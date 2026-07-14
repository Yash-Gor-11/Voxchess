// src/hooks/useVoiceEngine.ts
//
// Replaces useChessVoice.ts. Where the old hook owned its own
// startRecognition() call and hand-rolled regex parsing
// (lib/voice/chessVoiceHandler.ts's applyChessVoice), this hook is a thin
// React binding over the new engine: it creates one ChessAdapter + one
// VoiceSession per mount (while `enabled`), subscribes to the session's
// events, and mirrors them into voiceStore -- the exact same store shape
// TranscriptDisplay/VoiceStatusBar/ChessVoiceButton already consume, per
// the Phase 1 audit note in voiceStore.ts.
//
// Per the frozen v3 architecture (see handoff §2, invariant #2):
// ChessAdapter.executeMove() is only ever called by VoiceSession with an
// already-validated candidate move -- this hook's `executeMove` option is
// the page's OWN pre-existing move pipeline (Play's `executeMove` /
// `move()`, Analysis's `executeMove`), the same function drag-and-drop
// and click-to-move already call. Nothing here bypasses that.
//
// One VoiceEngine instance is shared module-wide (not per-hook-instance)
// since VoiceEngine itself is stateless aside from holding a VoiceConfig
// -- creating a new one per page mount would be harmless but wasteful.
// Session creation (one per mount) is what actually matters, since a
// VoiceSession holds real per-episode state (transcript, candidates,
// confirmation timers) that must not leak between pages or across
// game resets.

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { createVoiceEngine, type VoiceEngine } from "@/lib/voice/controller/VoiceEngine";
import { createChessAdapter } from "@/lib/voice/adapters/ChessAdapter";
import type { VoiceSession } from "@/lib/voice/controller/VoiceSession";
import { VoiceState } from "@/lib/voice/controller/VoiceState";
import { isSpeechSupported } from "@/lib/voice/recognition/BrowserRecognizer";
import type { VoiceCommand } from "@/lib/voice/types";
import { buildConfirmationPrompt } from "@/lib/voiceCandidatePrompt";
import {
  recognitionStyleToClarity,
  timeoutTierToMs,
  CURRENT_VOICE_LANGUAGE,
  type ConfirmationTimeoutTier,
  type RecognitionStyle,
} from "@/lib/voiceSettingsMapping";
import { useVoiceStore } from "@/stores/voiceStore";

/**
 * VoiceSession only ever emits "pendingCommand" after its internal
 * isDangerousCommand(command) check passes (see VoiceSession.ts's
 * handleCommand()) -- so the actual runtime payload is always
 * resign/offer-draw. isDangerousCommand() itself is a plain boolean
 * check, not a type predicate, so that narrowing doesn't flow through
 * automatically; rather than widen this type back out to the full
 * VoiceCommand union (which would let undo/flip-board silently compile
 * here even though they can never arrive), it's modeled explicitly as
 * its own type and asserted at the one call site that needs it. Keeps
 * VoiceSession.ts's public event contract untouched (still the broader
 * VoiceCommand) rather than threading a new domain type through the
 * frozen engine for a narrowing its own command-parsing module doesn't
 * expose.
 */
type DangerousVoiceCommand = { type: "resign" } | { type: "offer-draw" };

/**
 * Exhaustive over DangerousVoiceCommand specifically (not the full
 * VoiceCommand union) so that adding a new dangerous command later --
 * e.g. an "abort search" -- fails to compile here until a real prompt is
 * written for it.
 */
function buildPendingCommandLabel(command: DangerousVoiceCommand): string {
  switch (command.type) {
    case "resign":
      return "Confirm resignation";
    case "offer-draw":
      return "Offer a draw";
    default: {
      const exhaustive: never = command;
      return exhaustive;
    }
  }
}

let sharedEngine: VoiceEngine | null = null;
export function getSharedVoiceEngine(): VoiceEngine {
  if (!sharedEngine) sharedEngine = createVoiceEngine();
  return sharedEngine;
}

/**
 * Single place that turns Settings' user-facing tier/style values into a
 * real VoiceConfig and applies it to the shared engine. Previously
 * _app.tsx (hydration on load) and settings.tsx (each settings-page
 * click) each built the configure() call independently -- harmless
 * today, but two copies of "how do we turn a tier into a VoiceConfig"
 * are exactly the kind of thing that quietly drifts apart the next time
 * a field gets added (e.g. a future wake-word setting). Both callers use
 * this instead now.
 */
export function applyVoiceSettings(
  timeoutTier: ConfirmationTimeoutTier,
  recognitionStyle: RecognitionStyle,
): void {
  getSharedVoiceEngine().configure({
    clarity: recognitionStyleToClarity(recognitionStyle),
    timerMs: timeoutTierToMs(timeoutTier),
    language: CURRENT_VOICE_LANGUAGE,
  });
}

export interface UseVoiceEngineOptions {
  /** Reads the CURRENT fen -- called fresh on every getLegalMoves(), never cached by this hook. */
  getFen: () => string;
  /** The page's existing validated-move pipeline (Play's move(), Analysis's executeMove()). */
  executeMove: (move: { from: string; to: string; promotion?: string }) => void;
  /** Non-dangerous (undo/flip-board) and post-confirmation dangerous (resign/offer-draw) commands. */
  onCommand?: (command: VoiceCommand) => void;
  /** Gate session creation -- e.g. false before a game has started, or once it's over. */
  enabled: boolean;
}

export function useVoiceEngine({ getFen, executeMove, onCommand, enabled }: UseVoiceEngineOptions) {
  const setActive = useVoiceStore((s) => s.setActive);
  const setStatus = useVoiceStore((s) => s.setStatus);
  const setTranscript = useVoiceStore((s) => s.setTranscript);
  const setResult = useVoiceStore((s) => s.setResult);
  const setConfirmationPrompt = useVoiceStore((s) => s.setConfirmationPrompt);

  const sessionRef = useRef<VoiceSession | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the currently-shown ambiguity toast so a second "Which one?"
  // (e.g. an unrecognized reply during the same confirmation round)
  // replaces it instead of stacking a new one on top.
  const promptToastIdRef = useRef<string | number | null>(null);

  // Stable refs so the session (created once per `enabled` mount) always
  // calls the LATEST getFen/executeMove/onCommand, without needing to be
  // torn down and recreated every time those closures change identity.
  const getFenRef = useRef(getFen);
  const executeMoveRef = useRef(executeMove);
  const onCommandRef = useRef(onCommand);
  getFenRef.current = getFen;
  executeMoveRef.current = executeMove;
  onCommandRef.current = onCommand;

  const clearConfirmationPrompt = useCallback(() => {
    setConfirmationPrompt(null);
    if (promptToastIdRef.current !== null) {
      toast.dismiss(promptToastIdRef.current);
      promptToastIdRef.current = null;
    }
  }, [setConfirmationPrompt]);

  useEffect(() => {
    if (!enabled) return;

    const adapter = createChessAdapter({
      getFen: () => getFenRef.current(),
      executeMove: (move) => executeMoveRef.current(move),
    });

    const engine = getSharedVoiceEngine();
    const session = engine.createSession(adapter);
    sessionRef.current = session;

    const unsubs: Array<() => void> = [];

    unsubs.push(
      session.on("stateChange", (state) => {
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current);
          idleTimerRef.current = null;
        }
        switch (state) {
          case VoiceState.Idle:
            setActive(null);
            setStatus("idle");
            clearConfirmationPrompt();
            break;
          case VoiceState.Listening:
            setActive("chess");
            setStatus("listening");
            setTranscript("");
            setResult(null);
            clearConfirmationPrompt();
            break;
          case VoiceState.AwaitingConfirmation:
            // Mic stays open for the yes/no/selector reply (v3 §4) --
            // keep the UI in its "listening" presentation throughout.
            // confirmationPrompt was already set by the "candidates"
            // handler just before this fires -- don't clear it here.
            setActive("chess");
            setStatus("listening");
            break;
          case VoiceState.Parsing:
          case VoiceState.Ranking:
          case VoiceState.Executing:
            // No distinct UI state for these -- "listening" styling holds
            // until a terminal event (moveCommitted/error/Idle) fires.
            break;
          case VoiceState.Error:
            setStatus("error");
            clearConfirmationPrompt();
            break;
        }
      }),
    );

    unsubs.push(
      session.on("moveCommitted", (move) => {
        const label = `${move.from}${move.to}${move.promotion ?? ""}`;
        setResult({ ok: true, message: `Played ${label}` });
        setStatus("success");
        setTranscript("");
        clearConfirmationPrompt();
        idleTimerRef.current = setTimeout(() => {
          setActive(null);
          setStatus("idle");
        }, 1500);
      }),
    );

    unsubs.push(
      session.on("error", (err) => {
        const message = err.message ?? "Didn't catch that";
        setResult({ ok: false, message });
        setStatus("error");
        clearConfirmationPrompt();
        toast.error(message);
      }),
    );

    unsubs.push(
      session.on("candidates", (candidates) => {
        // Fires exactly when ConfirmationManager needs the user's input
        // (a tie MoveRanker left unresolved -- see its file header) -- e.g.
        // two rooks that can both reach a square, or a bare promotion
        // square ("e8") with no piece named, which always yields 4 tied
        // Q/R/B/N candidates (CandidateGenerator only filters by
        // promotion piece when one was actually spoken). Without this,
        // the mic reopens for a yes/no/selector reply with no indication
        // of what the choices are, silently relying on the auto-commit
        // timeout (v3 invariant #5) as the only fallback.
        //
        // Uses the dedicated confirmationPrompt store field (NOT
        // transcript -- a prompt describing what the ENGINE is asking
        // isn't "what the user said," and conflating the two made
        // TranscriptDisplay lie about its own contents). The toast is
        // deduped via promptToastIdRef so a retry within the same
        // confirmation round replaces it instead of stacking.
        const prompt = buildConfirmationPrompt(candidates, engine.getConfig().timerMs);
        setConfirmationPrompt(prompt);
        if (promptToastIdRef.current !== null) toast.dismiss(promptToastIdRef.current);
        promptToastIdRef.current = toast(prompt);
      }),
    );

    unsubs.push(
      session.on("pendingCommand", (command) => {
        // Fires the instant a dangerous command (resign/offer-draw)
        // opens its yes/no confirmation round. Previously there was NO
        // UI signal for this at all -- the mic would silently open and
        // close (auto-cancelling after the timeout, since dangerous
        // commands fail SAFE on silence per v3 invariant #5) with
        // nothing telling the user a question was even being asked. This
        // is the actual root cause behind resign/offer-draw appearing
        // broken: not a timing race, just a missing prompt. Same
        // mechanism as the candidates handler above (dedicated
        // confirmationPrompt field + deduped toast), so the two dangerous
        // commands read consistently with move-ambiguity confirmation.
        // Safe assertion: see DangerousVoiceCommand's doc comment above --
        // VoiceSession only reaches this event after its own
        // isDangerousCommand() check passes.
        const label = buildPendingCommandLabel(command as DangerousVoiceCommand);
        const prompt = `${label}? Say "yes" or "no".`;
        setConfirmationPrompt(prompt);
        if (promptToastIdRef.current !== null) toast.dismiss(promptToastIdRef.current);
        promptToastIdRef.current = toast(prompt);
      }),
    );

    unsubs.push(
      session.on("command", (command) => {
        onCommandRef.current?.(command);
      }),
    );

    return () => {
      unsubs.forEach((unsub) => unsub());
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      clearConfirmationPrompt();
      session.dispose();
      sessionRef.current = null;
    };
    // Intentionally NOT depending on getFen/executeMove/onCommand identity
    // -- see the ref-mirroring above. Only `enabled` (and the stable store
    // setters) should tear down / recreate the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, setActive, setStatus, setTranscript, setResult, setConfirmationPrompt, clearConfirmationPrompt]);

  const activate = useCallback(() => {
    if (!isSpeechSupported()) {
      toast.error("Voice requires Chrome or Edge");
      return;
    }
    const session = sessionRef.current;
    if (!session) return;

    if (useVoiceStore.getState().activeMode === "chess") {
      session.stop();
      setActive(null);
      setStatus("idle");
      clearConfirmationPrompt();
      return;
    }
    session.start();
  }, [setActive, setStatus, clearConfirmationPrompt]);

  return { activate };
}