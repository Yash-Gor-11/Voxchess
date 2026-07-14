// src/lib/voice/recognition/BrowserRecognizer.ts
//
// Web Speech API wrapper. This is the swap point for an offline/WASM
// recognizer later (v3 §5.3) — nothing downstream depends on this file
// beyond the RecognizerFactory function signature.
//
// Ported from the pre-existing speechRecognition.ts (see Phase 1 audit)
// with the three deltas identified there applied:
//   1. Confidence is now captured (r[0].confidence) — the old file set
//      maxAlternatives=1 but never read the confidence value it implied.
//   2. Browser error strings are mapped onto VoiceErrorCode categories
//      instead of passed through raw.
//   3. Wrapped for use inside VoiceSession (Phase 4) via the
//      RecognizerFactory shape, rather than the old ad hoc
//      RecognitionCallbacks/RecognitionHandle pair used standalone.
//
// continuous: false is kept as-is from the original — NOT "upgraded" to
// continuous listening. One VoiceSession episode maps to one
// non-continuous recognition run, which is what VoiceSession's lifecycle
// already assumes (see Phase 1 audit notes on this point).
//
// The Web Speech API has no official TypeScript definitions, so `any` is
// used at the browser API boundary only, not in this module's own types.

import type { VoiceError, VoiceErrorCode } from "../types";

export interface RecognitionResult {
  transcript: string;
  isFinal: boolean;
  confidence?: number;
}

export interface RecognitionCallbacks {
  onResult: (result: RecognitionResult) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: VoiceError) => void;
}

export interface RecognitionHandle {
  stop: () => void;
}

/**
 * The shape VoiceSession depends on, not chess.js. Swapping in an offline
 * recognizer later means writing a new function matching this type — no
 * changes to VoiceSession itself.
 */
export type RecognizerFactory = (callbacks: RecognitionCallbacks) => RecognitionHandle | null;

export const isSpeechSupported = (): boolean =>
  typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

const BROWSER_ERROR_MAP: Readonly<Record<string, VoiceErrorCode>> = {
  "no-speech": "no-speech",
};

/** Delta #2: anything not explicitly mapped (network/not-allowed/aborted/etc.) collapses to asr-error. */
function mapBrowserError(code: string): VoiceErrorCode {
  return BROWSER_ERROR_MAP[code] ?? "asr-error";
}

// Module-level tracking of the currently-live native recognizer instance.
// A new startRecognition() call waits for ITS real teardown (onend)
// before claiming the microphone, instead of guessing a fixed delay --
// see the long comment below for why. Deliberately module-level (not
// per-call): the whole problem is that DIFFERENT calls to this function,
// arbitrarily close together in time, can otherwise overlap on the same
// underlying audio session.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let liveRec: any = null;
let liveRecEnded = true;

export const startRecognition: RecognizerFactory = (callbacks) => {
  if (!isSpeechSupported()) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  let cancelledBeforeStart = false;

  rec.onstart = () => callbacks.onStart?.();
  rec.onend = () => {
    if (liveRec === rec) {
      liveRec = null;
      liveRecEnded = true;
    }
    callbacks.onEnd?.();
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rec.onerror = (e: any) => {
    const code = e?.error ?? "unknown";
    callbacks.onError?.({ code: mapBrowserError(code), message: code });
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rec.onresult = (e: any) => {
    let interim = "";
    let interimConfidence: number | undefined;
    let final = "";
    let finalConfidence: number | undefined;

    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        final += r[0].transcript;
        finalConfidence = r[0].confidence; // Delta #1
      } else {
        interim += r[0].transcript;
        interimConfidence = r[0].confidence;
      }
    }

    if (final) {
      callbacks.onResult({ transcript: final.trim(), isFinal: true, confidence: finalConfidence });
    } else if (interim) {
      callbacks.onResult({ transcript: interim.trim(), isFinal: false, confidence: interimConfidence });
    }
  };

  function reallyStart() {
    if (cancelledBeforeStart) return;
    liveRec = rec;
    liveRecEnded = false;
    try {
      rec.start();
    } catch {
      liveRec = null;
      liveRecEnded = true;
      callbacks.onError?.({ code: "asr-error", message: "Could not start recognizer" });
    }
  }

  // Real-browser race (added during integration, not part of the
  // original Phase 4/6 build): VoiceSession calls openMic() a second
  // time synchronously whenever a confirmation round begins or restarts
  // (ActionConfirmation/ConfirmationManager's "awaiting" handlers, plus
  // the "cancelled"/"unrecognized" -> listenForMove()/openMic() paths),
  // right in the middle of the PREVIOUS recognition instance's own
  // onresult/onend dispatch. Starting a brand-new SpeechRecognition
  // instance before the browser has actually finished releasing the
  // previous instance's audio session is a well-documented race: the new
  // instance can immediately fire onerror:"aborted", or silently never
  // actually start listening.
  //
  // A blind fixed delay (an earlier version of this fix used
  // setTimeout(0)) isn't reliable -- real teardown timing varies by
  // browser/OS/mic-driver and can exceed a single JS tick. So instead:
  // if a previous instance is still live, explicitly abort() it (rather
  // than passively waiting on continuous:false to self-end) and wait for
  // ITS real onend before starting ours, chaining onto whatever onend
  // handler it already had rather than replacing it. Bounded by a safety
  // timeout in case onend never fires for some reason, so this can never
  // hang the session indefinitely.
  //
  // Found via real resign/undo confirmations reporting "aborted" and a
  // real promotion-ambiguity confirmation where the reply was never
  // heard. Fully contained in this module: VoiceSession.ts's openMic()
  // stays synchronous and untouched, so none of the engine's 275 existing
  // unit tests (which inject their own synchronous fake recognizerFactory
  // and never reach this file's real internals, per
  // BrowserRecognizer.test.ts's two unsupported-browser-only cases) are
  // affected by this.
  if (liveRecEnded) {
    reallyStart();
  } else {
    const prev = liveRec;
    const prevOnEnd = prev?.onend;
    let settled = false;

    if (prev) {
      prev.onend = (...args: unknown[]) => {
        prevOnEnd?.(...args);
        if (!settled) {
          settled = true;
          clearTimeout(safetyTimer);
          reallyStart();
        }
      };
      try {
        if (typeof prev.abort === "function") {
          prev.abort();
        } else if (typeof prev.stop === "function") {
          prev.stop();
        }
      } catch {
        /* noop */
      }
    }

    const safetyTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      liveRec = null;
      liveRecEnded = true;
      reallyStart();
    }, 900);
  }

  return {
    stop: () => {
      cancelledBeforeStart = true;
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    },
  };
};