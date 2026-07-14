// src/lib/voice/types/index.ts
//
// Shared types for the voice engine (v3 blueprint's "one addition" note:
// every module imports shared types from one place instead of each
// defining its own copy). Populated incrementally — only what the phase
// currently being built actually needs. ParseResult is first because
// IntentParser (Phase 2 Step 4) is the first module that needs a shared
// type; MoveCandidate/RankingContext arrive in Phase 3, VoiceCommand when
// commands/CommandParser.ts is built, VoiceConfig/VoiceState in Phase 4.

export type PieceLetter = "P" | "N" | "B" | "R" | "Q" | "K";
export type PromotionLetter = "Q" | "R" | "B" | "N";

/**
 * Output of IntentParser.parseIntent(). Represents grammatical INTENT, not
 * a validated move — nothing here has been checked against board legality.
 * That happens downstream in matching/CandidateGenerator via ChessAdapter
 * (Phase 3, not yet built).
 */
export interface ParseResult {
  /**
   * Explicit piece word spoken, mapped to SAN letter. 'P' means the user
   * explicitly said "pawn" (distinct from null, which means no piece word
   * was present at all — e.g. bare "e4"). This distinction matters for
   * MoveRanker's future scoring (Phase 3): an explicit "pawn" is stronger
   * evidence of intent than an omitted piece word defaulting to pawn by
   * convention.
   */
  piece: PieceLetter | null;
  /**
   * Origin square, only present for two-square forms ("e2 e4"). null for
   * destination-only forms ("e4", "knight f3") where the origin is
   * inferred later from legal-move matching, not stated here.
   */
  from: Partial<{ file: string; rank: string }> | null;
  /** Destination square. null only for castling ParseResults. */
  to: { file: string; rank: string } | null;
  capture: boolean;
  promotion: PromotionLetter | null;
  isCastle: "K" | "Q" | null;
  /** The token sequence that produced this result, space-joined, for debugging/logging. */
  raw: string;
}

// ── Phase 3 types ──────────────────────────────────────────────────────

/**
 * A single legal move as reported by ChessAdapter.getLegalMoves(). Square
 * fields are plain strings (e.g. "e4"), not chess.js's Square type —
 * ChessAdapter is the only module permitted to import chess.js (v3 §5.10),
 * so this type intentionally doesn't leak chess.js types into the rest of
 * the voice/ tree.
 */
export interface LegalMove {
  from: string;
  to: string;
  piece: PieceLetter;
  /** Present only if this move captures a piece (including en passant). */
  captured?: PieceLetter;
  promotion?: PromotionLetter;
  isCastleKingside: boolean;
  isCastleQueenside: boolean;
  /** Standard Algebraic Notation, as produced by chess.js — e.g. "Nf3", "exd5", "O-O". */
  san: string;
}

/**
 * A legal move that satisfies a given ParseResult's constraints, before
 * ranking. Produced by CandidateGenerator, consumed by MoveRanker.
 */
export interface RawCandidate {
  move: LegalMove;
  parseResult: ParseResult;
}

/** A scored, ranked candidate. Produced by MoveRanker. */
export interface MoveCandidate {
  move: { from: string; to: string; promotion?: string };
  san: string;
  /** 0-1. Higher is a better match for what was spoken. */
  score: number;
}

/**
 * Context MoveRanker needs to score candidates. Deliberately narrow — see
 * v3 §5.7: this does NOT carry the full VoiceConfig (e.g. timerMs,
 * language), only what scoring actually uses.
 */
export interface RankingContext {
  transcript: string;
  confidence?: number;
  clarity: "fuzzy" | "clear";
  currentFen: string;
}

// ── Phase 4 types ──────────────────────────────────────────────────────

export interface VoiceConfig {
  readonly clarity: "fuzzy" | "clear";
  readonly timerMs: number | null;
  readonly language: "en";
}

/**
 * Error categories per v3 §9's error-handling table. VoiceErrorCode is the
 * closed set; VoiceError adds an optional human-readable message for
 * logging/toasts.
 */
export type VoiceErrorCode = "no-speech" | "parse-fail" | "illegal" | "asr-error";

export interface VoiceError {
  code: VoiceErrorCode;
  message?: string;
}

/**
 * Placeholder shape for CommandParser's output (Phase 6, not yet built).
 * Defined now only because VoiceSessionEvents (Phase 4) references it as
 * an event payload type — nothing currently emits a 'command' event; that
 * wiring is Phase 6's job. Kept minimal and matched to v3 §5.9's listed
 * command set (undo/resign/draw/flip) rather than speculatively expanded.
 */
export interface VoiceCommand {
  type: "undo" | "resign" | "offer-draw" | "flip-board";
}
