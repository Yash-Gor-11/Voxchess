// src/hooks/useAnalysisVoice.ts
//
// Analysis's single mic slot is dual-purpose. Its EXISTING tree-navigation
// vocabulary (first/last/next/back/main line/go to move N) is untouched
// per the handoff's Phase 1 audit -- genuinely unrelated to what
// AnalysisChessAdapter enables. This hook ADDS real move-input voice on
// top of that: say a chess move and it's applied to the live
// AnalysisTree via AnalysisChessAdapter, exactly like Play's voice moves.
//
// Why this isn't just a second useVoiceEngine call: VoiceSession owns its
// own mic lifecycle end-to-end (start() -> openMic -> handleFinalTranscript,
// all internal) with no seam for "try my own vocabulary first, defer to
// yours only if it doesn't match." Adding such a seam to VoiceSession would
// be a change to the frozen v3 architecture to satisfy one page's routing
// need, not a real implementation flaw forcing it (handoff §8) -- so
// instead this hook assembles the SAME sequence VoiceSession runs
// internally (compare to VoiceSession.ts's handleFinalTranscript),
// directly against the engine's exported building blocks, gated by the
// existing nav-command check first.
//
// Command scope for Analysis: only "flip-board" is honored from
// CommandParser's fixed-phrase vocabulary. undo/resign/offer-draw have no
// Analysis-mode meaning (tree "back"/"previous" already covers undo-like
// intent, and there's no resign/draw concept mid-analysis) -- spoken but
// silently ignored here rather than mis-mapped onto some approximated
// Analysis behavior.
//
// Recognition source: BrowserRecognizer (recognition/BrowserRecognizer.ts),
// replacing the legacy lib/voice/speechRecognition.ts per the Phase 1
// audit's "Superseded" note -- same one-shot (continuous: false) contract
// the page's existing activateVoice already assumed.

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { normalize } from "@/lib/voice/intent/Normalizer";
import { parseIntent } from "@/lib/voice/intent/IntentParser";
import { generateCandidates } from "@/lib/voice/matching/CandidateGenerator";
import { rankCandidates } from "@/lib/voice/matching/MoveRanker";
import { parseCommand } from "@/lib/voice/commands/CommandParser";
import {
  createConfirmationManager,
  type ConfirmationManager,
} from "@/lib/voice/confirmation/ConfirmationManager";
import {
  createAnalysisChessAdapter,
  type AnalysisTreeLike,
} from "@/lib/voice/adapters/AnalysisChessAdapter";
import type { ChessAdapter } from "@/lib/voice/adapters/ChessAdapter";
import {
  startRecognition,
  isSpeechSupported,
  type RecognitionHandle,
} from "@/lib/voice/recognition/BrowserRecognizer";
import { buildConfirmationPrompt } from "@/lib/voiceCandidatePrompt";
import { getSharedVoiceEngine } from "@/hooks/useVoiceEngine";

export interface UseAnalysisVoiceOptions {
  /** Reads the live AnalysisTree -- called fresh on every activation, never cached. */
  getTree: () => AnalysisTreeLike | null;
  /** Called after a move has actually been applied to the tree, so the page can refresh currentNode/UI state. */
  onMoveApplied: () => void;
  /** The page's EXISTING nav-command regex handler. Returns true if it recognized and handled the transcript. */
  tryNavCommand: (transcript: string) => boolean;
  onFlipBoard: () => void;
  /** ONLY for what was actually heard -- never repurposed for prompts (see onConfirmationPrompt). */
  onTranscript: (t: string) => void;
  /** "Which one? 1. ... 2. ..." -- pass null to clear. Kept separate from onTranscript per review feedback: a prompt describing what the engine is asking isn't "what the user said." */
  onConfirmationPrompt: (prompt: string | null) => void;
  onListening: () => void;
  onIdle: () => void;
  onError: (message: string) => void;
}

export function useAnalysisVoice(options: UseAnalysisVoiceOptions) {
  const optsRef = useRef(options);
  optsRef.current = options;

  const adapterRef = useRef<ChessAdapter | null>(null);
  const recognitionHandleRef = useRef<RecognitionHandle | null>(null);
  // Dedupes the ambiguity toast, same as useVoiceEngine.ts, so a retry
  // within one confirmation round replaces it instead of stacking.
  const promptToastIdRef = useRef<string | number | null>(null);

  const clearConfirmationPrompt = useCallback(() => {
    optsRef.current.onConfirmationPrompt(null);
    if (promptToastIdRef.current !== null) {
      toast.dismiss(promptToastIdRef.current);
      promptToastIdRef.current = null;
    }
  }, []);

  // One ConfirmationManager for the lifetime of this hook. Its `cancel()`
  // (silent teardown, no 'cancelled' emission -- see the module's own
  // doc comment) is called from stop(), from the unmount cleanup effect,
  // and at the top of every fresh activate(), so a still-pending
  // confirmation round from a previous activation (or from navigating
  // away mid-round) can never resolve against a stale adapter/page state.
  const confirmationManagerRef = useRef<ConfirmationManager | null>(null);
  if (!confirmationManagerRef.current) {
    const cm = createConfirmationManager();

    cm.on("resolved", (candidate) => {
      const adapter = adapterRef.current;
      if (!adapter) {
        // No adapter means the page tore down mid-round (or never had
        // one) -- explicitly skip every move-related callback rather than
        // relying on optional chaining to silently no-op executeMove
        // while onMoveApplied() still ran right after it regardless.
        clearConfirmationPrompt();
        optsRef.current.onIdle();
        return;
      }
      adapter.executeMove(candidate.move);
      optsRef.current.onMoveApplied();
      clearConfirmationPrompt();
      optsRef.current.onIdle();
    });

    cm.on("awaiting", ({ candidates }) => {
      const prompt = buildConfirmationPrompt(candidates, getSharedVoiceEngine().getConfig().timerMs);
      optsRef.current.onConfirmationPrompt(prompt);
      if (promptToastIdRef.current !== null) toast.dismiss(promptToastIdRef.current);
      promptToastIdRef.current = toast(prompt);
      listenForConfirmationReply(cm);
    });

    cm.on("cancelled", () => {
      clearConfirmationPrompt();
      optsRef.current.onIdle();
    });

    cm.on("unrecognized", ({ transcript }) => {
      // Deliberately does NOT clear the prompt -- still awaiting the same
      // round, just re-listening after an unparseable reply.
      optsRef.current.onError(`Didn't understand "${transcript}" — say yes, no, or a number.`);
      listenForConfirmationReply(cm);
    });

    confirmationManagerRef.current = cm;
  }

  // Unmount safety net: a confirmation round left pending when the user
  // navigates away must not resolve later against a torn-down page.
  useEffect(() => {
    return () => {
      confirmationManagerRef.current?.cancel();
      recognitionHandleRef.current?.stop();
    };
  }, []);

  function listenForConfirmationReply(cm: ConfirmationManager) {
    recognitionHandleRef.current = startRecognition({
      onResult: (result) => {
        if (!result.isFinal) return;
        cm.handleResponse(result.transcript);
      },
      onError: () => {
        optsRef.current.onError("Microphone error");
        clearConfirmationPrompt();
        optsRef.current.onIdle();
      },
    });
    if (!recognitionHandleRef.current) {
      optsRef.current.onError("Could not reopen the microphone");
      clearConfirmationPrompt();
      optsRef.current.onIdle();
    }
  }

  const handleFinalTranscript = useCallback((transcript: string) => {
    // 1) Existing tree-navigation vocabulary — untouched, tried first.
    if (optsRef.current.tryNavCommand(transcript.toLowerCase().trim())) {
      optsRef.current.onIdle();
      return;
    }

    const tokens = normalize(transcript);

    // 2) The Analysis-relevant subset of the engine's fixed-phrase commands.
    const command = parseCommand(tokens);
    if (command) {
      if (command.type === "flip-board") {
        optsRef.current.onFlipBoard();
      }
      // undo/resign/offer-draw: no Analysis-mode meaning — ignored.
      optsRef.current.onIdle();
      return;
    }

    // 3) Move parsing against the live AnalysisTree position.
    const parseResults = parseIntent(tokens);
    if (parseResults.length === 0) {
      optsRef.current.onError(`Could not parse "${transcript}"`);
      optsRef.current.onIdle();
      return;
    }

    const adapter = adapterRef.current;
    if (!adapter) {
      optsRef.current.onIdle();
      return;
    }

    const config = getSharedVoiceEngine().getConfig();
    const legalMoves = adapter.getLegalMoves();
    const raw = generateCandidates(parseResults, legalMoves);
    if (raw.length === 0) {
      optsRef.current.onError(`No legal move matches "${transcript}"`);
      optsRef.current.onIdle();
      return;
    }

    const ranked = rankCandidates(raw, {
      transcript,
      clarity: config.clarity,
      currentFen: adapter.currentFen(),
    });

    // begin() resolves synchronously (emitting 'resolved' -> the handler
    // above) when the top candidate is decisive, or emits 'awaiting' to
    // start a confirmation round otherwise — identical to what
    // VoiceSession.handleFinalTranscript does internally. Reads the SAME
    // live engine config Play's VoiceSession uses (not a hardcoded
    // default), so a future Settings-driven configure() call is honored
    // here too rather than silently ignored by this hand-rolled pipeline.
    confirmationManagerRef.current!.begin(ranked, config);
  }, []);

  const activate = useCallback(() => {
    if (!isSpeechSupported()) {
      toast.error("Voice requires Chrome or Edge");
      return;
    }
    const tree = optsRef.current.getTree();
    if (!tree) return;

    // A fresh activation always wins over whatever was pending before
    // (matches Play's session.stop()-on-toggle semantics).
    confirmationManagerRef.current?.cancel();
    clearConfirmationPrompt();

    adapterRef.current = createAnalysisChessAdapter(tree);
    optsRef.current.onListening();

    let resultReceived = false;
    let handle: RecognitionHandle | null = null;
    handle = startRecognition({
      onResult: (result) => {
        // Only fires onTranscript for the FINAL result -- matches Play's
        // useVoiceEngine.ts, which can't show interim text at all since
        // VoiceSession (frozen v3) never surfaces non-final results as an
        // event. Previously this called onTranscript on every interim
        // result too, which made Analysis's live-partial-text behavior
        // silently diverge from Play's. Adding an interim-result event to
        // VoiceSession would fix that properly, but that's an engine
        // surface change, not integration glue -- not worth it for a
        // nice-to-have this close to the deadline. If it's wanted later,
        // it should be added once, to the engine, so both pages get it
        // for free instead of Analysis re-diverging from Play again.
        if (!result.isFinal) return;
        optsRef.current.onTranscript(result.transcript);
        resultReceived = true;
        handle?.stop();
        handleFinalTranscript(result.transcript);
      },
      onEnd: () => {
        if (!resultReceived) optsRef.current.onIdle();
      },
      onError: () => {
        optsRef.current.onError("Microphone error");
        optsRef.current.onIdle();
      },
    });
    recognitionHandleRef.current = handle;

    if (!handle) {
      optsRef.current.onIdle();
      toast.error("Could not start microphone");
    }
  }, [handleFinalTranscript, clearConfirmationPrompt]);

  const stop = useCallback(() => {
    recognitionHandleRef.current?.stop();
    recognitionHandleRef.current = null;
    confirmationManagerRef.current?.cancel();
    clearConfirmationPrompt();
  }, [clearConfirmationPrompt]);

  return { activate, stop };
}