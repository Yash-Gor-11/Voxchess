// src/lib/voice/controller/VoiceSession.ts
//
// Disposable, one per listening episode (v3 §5.2). Owns transcript,
// candidates, and confirmation state — none of that lives in Zustand
// (that's the whole point of this module existing). Plain TypeScript, zero
// React/DOM imports (v3 §2).
//
// Phase 6 update: command detection (undo/resign/offer-draw/flip-board)
// is now wired in, as a structurally separate pipeline from move parsing
// (parseCommand is tried before parseIntent — see handleFinalTranscript).
// Dangerous commands (resign, offer-draw) route through
// ActionConfirmation, a single-action yes/no confirmer that reuses
// ConfirmationManager's response vocabulary but — unlike move
// disambiguation — never auto-skips confirmation, since there's no
// "decisive candidate" concept for "resign the game."
//
// Phase 5 update: ambiguity is fully resolved, not just acknowledged.
// Ranking decisiveness and the yes/no/selector/timeout flow are entirely
// ConfirmationManager's responsibility (confirmation/); this module's job
// is orchestration — open the mic, route the transcript to the move
// pipeline, the command pipeline, or an active confirmation round, react
// to the outcome. It does not decide what counts as "close enough to be
// ambiguous" (that's isDecisive, confirmation/side).
//
// State machine notes (v3 §4), fully wired:
//   AwaitingConfirmation -> (yes / timer elapses / selector) -> Executing -> Idle
//   AwaitingConfirmation -> (no) -> Listening
//   AwaitingConfirmation -> (FEN changes externally) -> Idle [session disposed by caller]
// The mic stays open THROUGHOUT the AwaitingConfirmation window (state
// does not flip to Listening while capturing the yes/no/selector reply —
// only an explicit "no" causes that transition, matching the frozen state
// diagram exactly). This applies identically to command confirmation.
//
// Dependency rules (v3 §5.0): controller/ sits at the top of the stack —
// may import intent/, matching/, adapters/, recognition/, confirmation/,
// commands/, types/, shared/. Must NOT import chess.js directly
// (ChessAdapter's exclusive right).

import { normalize } from "../intent/Normalizer";
import { parseIntent } from "../intent/IntentParser";
import { generateCandidates } from "../matching/CandidateGenerator";
import { rankCandidates } from "../matching/MoveRanker";
import { createConfirmationManager, createActionConfirmation } from "../confirmation/ConfirmationManager";
import { parseCommand, isDangerousCommand } from "../commands/CommandParser";
import { TypedEmitter } from "../shared/TypedEmitter";
import type { ChessAdapter } from "../adapters/ChessAdapter";
import type { RecognizerFactory, RecognitionCallbacks } from "../recognition/BrowserRecognizer";
import type { MoveCandidate, VoiceCommand, VoiceConfig, VoiceError } from "../types";
import { VoiceState } from "./VoiceState";

export type VoiceSessionEvents = {
  stateChange: VoiceState;
  candidates: MoveCandidate[];
  /**
   * Added during integration (not part of the original Phase 6 build):
   * fires the instant a dangerous command (resign/offer-draw) enters its
   * confirmation round -- i.e. exactly when ActionConfirmation opens the
   * mic for a yes/no reply. Previously there was NO externally observable
   * signal for this at all (unlike ConfirmationManager's 'candidates'
   * event for move ambiguity), which is why real testing found dangerous
   * commands unusable: the mic would open and close with no indication
   * to the user that they were even being asked a question, let alone
   * what it was. Purely additive -- exposes information the session
   * already had internally (the command that triggered this), changes
   * nothing about handleCommand()'s existing control flow.
   */
  pendingCommand: VoiceCommand;
  moveCommitted: { from: string; to: string; promotion?: string };
  command: VoiceCommand;
  error: VoiceError;
};

export interface VoiceSession {
  start(): void;
  stop(): void;
  /** Tears down all listeners and clears timers. Also clears all event subscriptions. */
  dispose(): void;
  on<K extends keyof VoiceSessionEvents>(
    event: K,
    cb: (payload: VoiceSessionEvents[K]) => void,
  ): () => void;
}

/** How long the Error state lingers before auto-clearing back to Idle (v3 §4: "Error → (auto after N ms, or ack) → Idle"). */
const ERROR_AUTO_IDLE_MS = 3000;

export function createVoiceSession(
  adapter: ChessAdapter,
  recognizerFactory: RecognizerFactory,
  getConfig: () => VoiceConfig,
): VoiceSession {
  const emitter = new TypedEmitter<VoiceSessionEvents>();
  const confirmationManager = createConfirmationManager();
  const actionConfirmation = createActionConfirmation();

  let state: VoiceState = VoiceState.Idle;
  let handle: { stop: () => void } | null = null;
  let errorIdleTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let pendingCommand: VoiceCommand | null = null;

  function setState(next: VoiceState): void {
    state = next;
    emitter.emit("stateChange", next);
  }

  function clearErrorIdleTimer(): void {
    if (errorIdleTimer) {
      clearTimeout(errorIdleTimer);
      errorIdleTimer = null;
    }
  }

  function emitErrorAndIdle(error: VoiceError): void {
    emitter.emit("error", error);
    setState(VoiceState.Error);
    clearErrorIdleTimer();
    errorIdleTimer = setTimeout(() => {
      if (!disposed && state === VoiceState.Error) setState(VoiceState.Idle);
    }, ERROR_AUTO_IDLE_MS);
  }

  function commit(candidate: MoveCandidate): void {

  setState(VoiceState.Executing);

  adapter.executeMove(candidate.move);

  emitter.emit("moveCommitted", candidate.move);

  setState(VoiceState.Idle);
}

  /**
   * Low-level recognizer start with no state side effects of its own —
   * callers set state BEFORE calling this, since "listening for a fresh
   * move" (state: Listening) and "listening for a confirmation reply"
   * (state: stays AwaitingConfirmation) need different state behavior
   * around the identical recognizer-opening mechanics.
   */
  function openMic(onFinalTranscript: (transcript: string, confidence?: number) => void): void {
    const callbacks: RecognitionCallbacks = {
      onResult: (result) => {
        if (!result.isFinal) return;
        onFinalTranscript(result.transcript, result.confidence);
      },
      onError: (err) => {
        emitErrorAndIdle(err);
      },
      onEnd: () => {
        // Only fall back to Idle if we were plainly listening for a move —
        // if state is AwaitingConfirmation (capturing a confirmation
        // reply) or something already moved state forward, onEnd firing
        // here must not stomp that. This is also why AwaitingConfirmation
        // has no "-> Idle on recognizer end" transition in v3 §4: only
        // explicit yes/no/selector/timeout resolve it.
        if (state === VoiceState.Listening) setState(VoiceState.Idle);
      },
    };

    handle = recognizerFactory(callbacks);
    if (!handle) {
      emitErrorAndIdle({ code: "asr-error", message: "Could not start recognizer" });
    }
  }

  function listenForMove(): void {
    setState(VoiceState.Listening);
    openMic(handleFinalTranscript);
  }

  function handleFinalTranscript(transcript: string, confidence?: number): void {
    if (disposed) return;

    setState(VoiceState.Parsing);
    const tokens = normalize(transcript);
    if (tokens.length === 0) {
      emitErrorAndIdle({ code: "no-speech" });
      return;
    }

    // Commands are a structurally separate pipeline from moves (v3 §5.9;
    // fixed phrases vs. piece/square grammar) — tried first since there's
    // no vocabulary overlap risk and it short-circuits before the heavier
    // move pipeline runs.
    const command = parseCommand(tokens);
    if (command) {
      handleCommand(command);
      return;
    }

    const parseResults = parseIntent(tokens);
    if (parseResults.length === 0) {
      emitErrorAndIdle({ code: "parse-fail", message: `Could not parse "${transcript}"` });
      return;
    }

    setState(VoiceState.Ranking);
    const legalMoves = adapter.getLegalMoves();
    const raw = generateCandidates(parseResults, legalMoves);
    if (raw.length === 0) {
      emitErrorAndIdle({ code: "illegal", message: `No legal move matches "${transcript}"` });
      return;
    }

    const config = getConfig();
    const ranked = rankCandidates(raw, {
      transcript,
      confidence,
      clarity: config.clarity,
      currentFen: adapter.currentFen(),
    });

    // Decisiveness (single strong candidate vs. genuine ambiguity) is
    // entirely ConfirmationManager's call now — this module just reacts
    // to whichever of its events fires (wired once, below).
    confirmationManager.begin(ranked, config);
  }

  /**
   * Non-dangerous commands (undo, flip-board) execute immediately —
   * VoiceSession only emits the 'command' event; it does not itself
   * mutate board/UI state beyond ChessAdapter.executeMove for moves. The
   * page layer (Play, Analysis) is responsible for actually calling
   * undo()/setFlipped() etc. in response.
   *
   * Dangerous commands (resign, offer-draw) always go through
   * ActionConfirmation first — see its file-header note on why a single
   * dangerous action can never take the "decisive, skip confirmation"
   * shortcut that move disambiguation uses for a single candidate.
   */
  function handleCommand(command: VoiceCommand): void {
    if (!isDangerousCommand(command)) {
      emitter.emit("command", command);
      setState(VoiceState.Idle);
      return;
    }

    pendingCommand = command;
    emitter.emit("pendingCommand", command);
    setState(VoiceState.AwaitingConfirmation);
    actionConfirmation.begin(getConfig());
  }

  // ── ConfirmationManager wiring (Phase 5) ────────────────────────────

  confirmationManager.on("resolved", (candidate) => {
    // Covers three cases uniformly: the decisive auto-commit path (no
    // 'awaiting' ever fired), an explicit "yes"/selector, and a countdown
    // timeout — all three mean "commit this candidate."
    commit(candidate);
  });

  confirmationManager.on("awaiting", ({ candidates }) => {
    emitter.emit("candidates", candidates);
    setState(VoiceState.AwaitingConfirmation);
    openMic((transcript) => confirmationManager.handleResponse(transcript));
  });

  confirmationManager.on("cancelled", () => {
    // v3 §4: AwaitingConfirmation -> (no) -> Listening. Re-open the mic
    // for a fresh move attempt, distinct from openMic used for the
    // confirmation-reply capture above.
    listenForMove();
  });

  confirmationManager.on("unrecognized", ({ transcript }) => {
    // Response matched neither yes/no/selector. Stay in
    // AwaitingConfirmation (do not touch state), surface it as an error
    // for UI feedback, and re-open the mic for another attempt. The
    // countdown timer (if any) is untouched by ConfirmationManager itself
    // — it keeps running against the original schedule.
    emitter.emit("error", {
      code: "parse-fail",
      message: `Didn't understand "${transcript}" — say yes, no, or a number.`,
    });
    openMic((t) => confirmationManager.handleResponse(t));
  });

  // ── ActionConfirmation wiring (Phase 6: dangerous commands) ─────────

  actionConfirmation.on("awaiting", () => {
    openMic((transcript) => actionConfirmation.handleResponse(transcript));
  });

  actionConfirmation.on("confirmed", () => {
    if (pendingCommand) {
      emitter.emit("command", pendingCommand);
      pendingCommand = null;
    }
    setState(VoiceState.Idle);
  });

  actionConfirmation.on("cancelled", () => {
    // Same v3 §4 transition as move-confirmation's "no": back to
    // Listening for a fresh attempt. Covers both an explicit "no" and a
    // countdown timing out unanswered (fail-safe — see
    // ActionConfirmation's file-header note).
    pendingCommand = null;
    listenForMove();
  });

  actionConfirmation.on("unrecognized", ({ transcript }) => {
    emitter.emit("error", {
      code: "parse-fail",
      message: `Didn't understand "${transcript}" — say yes or no.`,
    });
    openMic((t) => actionConfirmation.handleResponse(t));
  });

  return {
    start() {
      if (disposed) return;
      if (state !== VoiceState.Idle) return; // already active; no-op rather than stacking sessions
      listenForMove();
    },

    stop() {
      confirmationManager.cancel();
      actionConfirmation.cancel();
      handle?.stop();
      handle = null;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      confirmationManager.dispose();
      actionConfirmation.dispose();
      handle?.stop();
      handle = null;
      clearErrorIdleTimer();
      emitter.clear();
    },

    on(event, cb) {
      return emitter.on(event, cb);
    },
  };
}