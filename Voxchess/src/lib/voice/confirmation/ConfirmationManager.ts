// src/lib/voice/confirmation/ConfirmationManager.ts
//
// Manages the countdown, the yes/no/selector vocabulary, and cancellation
// (v3 §5.8). Renamed from "Resolver" in earlier drafts because it doesn't
// resolve ambiguity by itself — it manages the process of asking.
//
// Candidates carry no color (v3 §5.8/§7, resolved during blueprint
// freeze): this module deals in candidate ORDERING/INDEX only. The
// confirmation vocabulary here is therefore ordinal ("one"/"first"/"1",
// "two"/"second"/"2", ...), not color words. If a future UI wants to let
// users speak a color they see on the board, that translation (color word
// -> candidate index) belongs at the UI/store layer, not here — this
// module should never learn what color candidate 0 was drawn as.
//
// Dependency rules (v3 §5.0): confirmation/ sits below controller/ (and
// commands/, as lateral siblings) in the stack. May import intent/,
// matching/ (via types), types/, and shared/. Must NOT import controller/
// or chess.js.

import { normalize } from "../intent/Normalizer";
import { TypedEmitter } from "../shared/TypedEmitter";
import type { MoveCandidate, VoiceConfig } from "../types";

// ── Decisiveness threshold ──────────────────────────────────────────────
//
// v3 §6: "clarity: fuzzy widens the score threshold before
// ConfirmationManager engages; clear narrows it toward auto-commit."
// Read carefully, "widens the threshold" means fuzzy needs a BIGGER score
// margin between the top two candidates before treating the top one as
// decisive (so fuzzy asks for confirmation more often — it's the more
// cautious default). "Clear narrows it toward auto-commit" means clear
// needs only a SMALLER margin to skip confirmation (the user is asserting
// their speech is clear, so the system trusts the top score sooner).
//
// Concrete values are chosen so MoveRanker's pawn-default tiebreak bonus
// (+0.05, see MoveRanker.ts) clears the decisive bar under BOTH clarity
// settings — that bonus exists specifically so the common "bare square,
// pawn vs. some other piece" case doesn't need to bother the user. A
// genuine tie (margin 0, e.g. two rooks that can both reach the same
// square) never clears either threshold, which is exactly the case
// ConfirmationManager exists for.
const FUZZY_DECISIVE_MARGIN = 0.05;
const CLEAR_DECISIVE_MARGIN = 0.01;

/** True when the top candidate is decisively ahead — no confirmation round needed. */
export function isDecisive(ranked: readonly MoveCandidate[], clarity: "fuzzy" | "clear"): boolean {
  if (ranked.length <= 1) return true;
  // Rounding avoids floating-point imprecision at exact threshold values —
  // e.g. 0.95 - 0.9 evaluates to 0.04999999999999982 in JS, not 0.05,
  // which would incorrectly fail margin >= FUZZY_DECISIVE_MARGIN for
  // scores MoveRanker produces exactly at that boundary (its own
  // pawn-default bonus is +0.05 for precisely this reason). Found via
  // direct testing of this function, not by inspection.
  const margin = Math.round((ranked[0].score - ranked[1].score) * 1000) / 1000;
  const threshold = clarity === "clear" ? CLEAR_DECISIVE_MARGIN : FUZZY_DECISIVE_MARGIN;
  return margin >= threshold;
}

// ── Confirmation response vocabulary ────────────────────────────────────

const YES_WORDS: ReadonlySet<string> = new Set(["yes", "yeah", "yep", "yup", "confirm", "correct", "right"]);
const NO_WORDS: ReadonlySet<string> = new Set(["no", "nope", "nah", "cancel", "negative"]);

/** Ordinal words -> zero-based candidate index. Covers up to 5 candidates, well beyond realistic chess ambiguity. */
const ORDINAL_WORDS: Readonly<Record<string, number>> = {
  one: 0, first: 0, "1": 0,
  two: 1, second: 1, "2": 1,
  three: 2, third: 2, "3": 2,
  four: 3, fourth: 3, "4": 3,
  five: 4, fifth: 4, "5": 4,
};

export type ConfirmationResponseKind =
  | { type: "yes" }
  | { type: "no" }
  | { type: "selector"; index: number }
  | { type: "unrecognized" };

/**
 * Classifies a spoken confirmation response. Reuses Normalizer.normalize()
 * for tokenization/filler-stripping — "um yes please" still resolves to
 * "yes" the same way it would for a move phrase, since filler words are a
 * language-level concern, not a move-grammar-specific one.
 */
export function classifyConfirmationResponse(
  transcript: string,
  candidateCount: number,
): ConfirmationResponseKind {
  const tokens = normalize(transcript);
  if (tokens.some((t) => YES_WORDS.has(t))) return { type: "yes" };
  if (tokens.some((t) => NO_WORDS.has(t))) return { type: "no" };
  for (const t of tokens) {
    if (t in ORDINAL_WORDS) {
      const index = ORDINAL_WORDS[t];
      if (index < candidateCount) return { type: "selector", index };
    }
  }
  return { type: "unrecognized" };
}

// ── ConfirmationManager ──────────────────────────────────────────────────

export type ConfirmationManagerEvents = {
  /** Fires when a round actually needs the user's input — never fires for the decisive/auto-commit path. */
  awaiting: { candidates: MoveCandidate[]; preferred: MoveCandidate };
  /** Fires for the decisive auto-commit path, for "yes", for a valid selector, and for countdown timeout. */
  resolved: MoveCandidate;
  /** Fires only for an explicit "no" — NOT for cancel()'s silent teardown (see method docs). */
  cancelled: undefined;
  /** Fires when a response during an active round matches neither yes/no/selector. Round stays open. */
  unrecognized: { transcript: string };
};

export interface ConfirmationManager {
  /**
   * Starts a confirmation round for `ranked`. If the top candidate is
   * decisive per `config.clarity` (see isDecisive), resolves immediately
   * — synchronously emits 'resolved', no 'awaiting', no countdown.
   * Otherwise emits 'awaiting' and starts the countdown from
   * `config.timerMs` (skipped entirely if timerMs is null — waits
   * indefinitely for an explicit response).
   */
  begin(ranked: MoveCandidate[], config: VoiceConfig): void;
  /** Feed a spoken response while a round is active. No-op if no round is active. */
  handleResponse(transcript: string): void;
  /**
   * Silently tears down any active round — clears the timer, clears
   * pending state, emits NOTHING. For VoiceSession-driven teardown
   * (stop/dispose), not for a user's explicit "no" (that goes through
   * handleResponse and emits 'cancelled').
   */
  cancel(): void;
  isAwaiting(): boolean;
  on<K extends keyof ConfirmationManagerEvents>(
    event: K,
    cb: (payload: ConfirmationManagerEvents[K]) => void,
  ): () => void;
  dispose(): void;
}

// ── Single-action confirmation (Phase 6: commands) ──────────────────────
//
// v3 §5.9: dangerous commands (resign, offer-draw) "route through
// ConfirmationManager's existing yes/no flow rather than a second bespoke
// confirmation mechanism." Reusing classifyConfirmationResponse (above) is
// what satisfies that — the SAME vocabulary/parsing the move-disambiguation
// flow uses. What's genuinely different for commands is the entry
// condition: move disambiguation (begin(), above) skips confirmation
// entirely when there's only one candidate (isDecisive returns true for
// length <= 1) — but a single dangerous command must ALWAYS be confirmed,
// there's no "decisive" shortcut for "resign the game." That's why this is
// a separate, smaller state machine rather than calling begin() with a
// one-item array (which would silently auto-resolve and skip asking).

export type ActionConfirmationEvents = {
  awaiting: undefined;
  confirmed: undefined;
  cancelled: undefined;
  unrecognized: { transcript: string };
};

export interface ActionConfirmation {
  /** Always starts a yes/no round — no decisiveness shortcut. */
  begin(config: VoiceConfig): void;
  handleResponse(transcript: string): void;
  /** Silent teardown, same contract as ConfirmationManager.cancel(). */
  cancel(): void;
  isAwaiting(): boolean;
  on<K extends keyof ActionConfirmationEvents>(
    event: K,
    cb: (payload: ActionConfirmationEvents[K]) => void,
  ): () => void;
  dispose(): void;
}

export function createActionConfirmation(): ActionConfirmation {
  const emitter = new TypedEmitter<ActionConfirmationEvents>();
  let awaiting = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function clearTimer(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return {
    begin(config) {
      if (disposed) return;
      
      clearTimer();
      
      awaiting = true;
      emitter.emit("awaiting", undefined);

      if (config.timerMs !== null) {
        timer = setTimeout(() => {
          if (disposed || !awaiting) return;
          awaiting = false;
          // Deliberate asymmetry with move-disambiguation's timeout
          // (which commits the preferred candidate): silence on a
          // dangerous action must fail SAFE, not fail toward "yes." A
          // countdown elapsing without a response should never resign
          // the game or offer a draw on the user's behalf.
          emitter.emit("cancelled", undefined);
        }, config.timerMs);
      }
    },

    handleResponse(transcript) {
      
      if (disposed || !awaiting) return;

      // candidateCount=1 so a selector of "one"/"1" also counts as
      // confirmation — harmless, and forgiving of a user who's used to
      // the move-disambiguation vocabulary answering with a number.
      const classification = classifyConfirmationResponse(transcript, 1);

      if (classification.type === "yes" || (classification.type === "selector" && classification.index === 0)) {
        clearTimer();
        awaiting = false;
        emitter.emit("confirmed", undefined);
      } else if (classification.type === "no") {
        clearTimer();
        awaiting = false;
        emitter.emit("cancelled", undefined);
      } else {
        emitter.emit("unrecognized", { transcript });
      }
    },

    cancel() {
      clearTimer();
      awaiting = false;
    },

    isAwaiting() {
      return awaiting;
    },

    on(event, cb) {
      return emitter.on(event, cb);
    },

    dispose() {
      disposed = true;
      clearTimer();
      awaiting = false;
      emitter.clear();
    },
  };
}

export function createConfirmationManager(): ConfirmationManager {
  const emitter = new TypedEmitter<ConfirmationManagerEvents>();
  let awaitingCandidates: MoveCandidate[] | null = null;
  let preferred: MoveCandidate | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function clearTimer(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function resolveWith(candidate: MoveCandidate): void {
    clearTimer();
    awaitingCandidates = null;
    preferred = null;
    emitter.emit("resolved", candidate);
  }

  return {
    begin(ranked, config) {
      if (disposed) return;
      clearTimer();

      if (ranked.length === 0) return; // nothing to confirm — caller (VoiceSession) already handles the zero-candidate case as an error before this is ever reached

      if (isDecisive(ranked, config.clarity)) {
        emitter.emit("resolved", ranked[0]);
        return;
      }

      awaitingCandidates = ranked;
      preferred = ranked[0];
      emitter.emit("awaiting", { candidates: ranked, preferred: ranked[0] });

      if (config.timerMs !== null) {
        timer = setTimeout(() => {
          if (disposed || !preferred) return;
          resolveWith(preferred);
        }, config.timerMs);
      }
    },

    handleResponse(transcript) {
      if (disposed || !awaitingCandidates) return;

      const classification = classifyConfirmationResponse(transcript, awaitingCandidates.length);
      switch (classification.type) {
        case "yes":
          resolveWith(preferred!);
          break;
        case "selector":
          resolveWith(awaitingCandidates[classification.index]);
          break;
        case "no":
          clearTimer();
          awaitingCandidates = null;
          preferred = null;
          emitter.emit("cancelled", undefined);
          break;
        case "unrecognized":
          // Round stays open — timer (if any) keeps running unmodified,
          // caller is expected to re-listen for another attempt.
          emitter.emit("unrecognized", { transcript });
          break;
      }
    },

    cancel() {
      clearTimer();
      awaitingCandidates = null;
      preferred = null;
    },

    isAwaiting() {
      return awaitingCandidates !== null;
    },

    on(event, cb) {
      return emitter.on(event, cb);
    },

    dispose() {
      disposed = true;
      clearTimer();
      awaitingCandidates = null;
      preferred = null;
      emitter.clear();
    },
  };
}
