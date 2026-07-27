// src/lib/voice/language/en/grammar.ts
//
// Pure pattern DATA plus the token-classification predicates the patterns
// are defined in terms of. No matching/execution logic lives here — that's
// intent/IntentParser.ts's job (Phase 2 Step 4). This file only answers
// "what shapes of token sequence count as a move or command," not "how do
// we walk a token array and produce a ParseResult."
//
// Per v3 blueprint §5.0 dependency rules: this is `language/en/`, sits
// below `intent/` in the layer stack, and must not import from `intent/`,
// `matching/`, `confirmation/`, `controller/`, or `adapters/`.

import { CAPTURE_ALIASES, NUMBER_WORD_ALIASES } from "./aliases";
import { CHESS_FILE_LETTERS } from "./phonetics";

// ── Token classification ────────────────────────────────────────────────
//
// These operate on tokens as they exist AFTER Normalizer.normalize() —
// i.e. piece/file/number spelling variants are already canonicalized, but
// "to"/"too"/"two" are still distinct (see aliases.ts header). Grammar is
// exactly the layer that's supposed to resolve that remaining ambiguity,
// by position: a "to"/"too"/"two" token sitting in a TO slot is being
// read as the preposition, regardless of which of the three spellings
// produced it.
//
// PIECE_WORDS is defined explicitly here rather than derived from
// aliases.ts's PIECE_ALIASES values. It was originally derived (DRY), but
// that made grammar vocabulary an accidental downstream consequence of
// alias/spelling policy — a change to homophone handling could silently
// add or remove a word from what grammar considers a valid piece, which
// is the wrong direction of dependency (grammar should define what a
// "piece word" means; aliases should map spelling variants onto that
// fixed vocabulary, not the reverse).
const PIECE_WORDS: ReadonlySet<string> = new Set([
  "pawn",
  "knight",
  "bishop",
  "rook",
  "queen",
  "king",
]);
const RANK_WORDS: ReadonlySet<string> = new Set(Object.values(NUMBER_WORD_ALIASES));
const RANK_DIGITS: ReadonlySet<string> = new Set(["1", "2", "3", "4", "5", "6", "7", "8"]);
const FILE_LETTERS: ReadonlySet<string> = new Set(CHESS_FILE_LETTERS);
const TAKES_WORD = CAPTURE_ALIASES.takes; // canonical form, currently "takes"
const TO_WORDS: ReadonlySet<string> = new Set(["to", "too", "two"]);

/**
 * Pieces eligible for promotion. King and pawn are excluded — you cannot
 * promote to either.
 */
const PROMOTION_PIECE_WORDS: ReadonlySet<string> = new Set(
  [...PIECE_WORDS].filter((p) => p !== "king" && p !== "pawn"),
);

export function isPieceToken(token: string): boolean {
  return PIECE_WORDS.has(token);
}

export function isPromotionPieceToken(token: string): boolean {
  return PROMOTION_PIECE_WORDS.has(token);
}

export function isFileToken(token: string): boolean {
  return FILE_LETTERS.has(token);
}

/** Accepts both digit form ("4", from a split "e4") and word form ("four"). */
export function isRankToken(token: string): boolean {
  return RANK_DIGITS.has(token) || RANK_WORDS.has(token);
}

export function isTakesToken(token: string): boolean {
  return token === TAKES_WORD;
}

/**
 * The preposition slot. Deliberately accepts "to"/"too"/"two" — see file
 * header. This is the one place in the whole pipeline where that
 * three-way homophone ambiguity gets resolved, and it's resolved by
 * position (it's in a TO slot) rather than by spelling.
 */
export function isToToken(token: string): boolean {
  return TO_WORDS.has(token);
}

export function isCastleKingsideToken(token: string): boolean {
  return token === "castle-kingside";
}

export function isCastleQueensideToken(token: string): boolean {
  return token === "castle-queenside";
}

/**
 * Bare, unqualified "castle" -- no direction specified. Matched by TWO
 * separate patterns (castle-ambiguous-kingside/-queenside, see below),
 * each independently producing its own ParseResult, so parseIntent
 * naturally returns both. This is deliberate, not a bug: which
 * direction(s) are actually legal is exactly CandidateGenerator's job
 * (via ChessAdapter.getLegalMoves()'s isCastleKingside/isCastleQueenside
 * flags), and the existing ambiguity-confirmation flow already handles
 * "more than one legal candidate" -- so bare "castle" gets correct
 * behavior (auto-resolve if only one direction is legal, numbered
 * confirmation if both are) for free, with zero new confirmation
 * vocabulary, by reusing machinery that already exists for move ties.
 */
export function isCastleWordToken(token: string): boolean {
  return token === "castle";
}

// ── Grammar patterns ────────────────────────────────────────────────────

export type SlotType =
  | "piece"
  | "to"
  | "takes"
  | "file"
  | "rank"
  | "promotionPiece"
  | "castleKingside"
  | "castleQueenside"
  | "castleWord";

export interface SlotSpec {
  type: SlotType;
  /** Defaults to false (required) when omitted. */
  optional?: boolean;
}

export interface GrammarPattern {
  /** Stable identifier, used in fixtures/tests and IntentParser diagnostics. */
  id: string;
  /** Human-readable description, for fixture readability and error messages. */
  description: string;
  slots: SlotSpec[];
}

/**
 * Every pattern this grammar recognizes. Order matters for IntentParser
 * (Step 4): longer/more-specific patterns should be tried before shorter
 * ones that could be a prefix-match subset of them, the same principle
 * that mattered for CASTLE_PHRASE_REGEX in Normalizer.ts. Patterns are
 * listed here in that priority order already.
 */
export const GRAMMAR_PATTERNS: readonly GrammarPattern[] = [
  {
    id: "from-to-promotion",
    description:
      'Two full squares plus a promotion piece, e.g. "e seven e eight queen". ' +
      "Must be checked before from-to-move, since from-to-move's shape is a strict prefix of this one. " +
      'The trailing optional "to" (added for grammar expansion) supports "e7 e8 promote to queen" ' +
      '-- "promote" itself is stripped as filler (see aliases.ts), leaving "to queen" here.',
    slots: [
      { type: "piece", optional: true },
      { type: "file" },
      { type: "rank" },
      { type: "to", optional: true },
      { type: "file" },
      { type: "rank" },
      { type: "to", optional: true },
      { type: "promotionPiece" },
    ],
  },
  {
    id: "capture-promotion-with-origin",
    description:
      'Origin square + takes + destination square + promotion piece, e.g. "pawn g7 takes h8 queen". ' +
      'Added for grammar expansion -- previously a deliberate gap (see capture-move-with-origin\'s ' +
      'note on why explicit-origin captures had no pattern at all). Must be checked before ' +
      "capture-promotion and capture-move-with-origin, since both are strict prefixes of this shape.",
    slots: [
      { type: "piece", optional: true },
      { type: "file" },
      { type: "rank" },
      { type: "takes" },
      { type: "file" },
      { type: "rank" },
      { type: "to", optional: true },
      { type: "promotionPiece" },
    ],
  },
  {
    id: "capture-promotion",
    description:
      'Piece (optional) + takes + destination square + promotion piece, e.g. ' +
      '"pawn takes e eight queen". A large fraction of real promotions happen ' +
      "via capture (taking on the back rank), so this needs its own pattern " +
      "rather than being covered by capture-move + a leftover token. The " +
      'trailing optional "to" (added for grammar expansion) supports "takes h8 promote to queen".',
    slots: [
      { type: "piece", optional: true },
      { type: "takes" },
      { type: "file" },
      { type: "rank" },
      { type: "to", optional: true },
      { type: "promotionPiece" },
    ],
  },
  {
    id: "from-to-move",
    description:
      'Two full squares, e.g. "e2 e4" or "pawn e two e four". The from-square ' +
      "and to-square disambiguation (vs. e.g. a piece-name + destination-square " +
      "misread) is IntentParser's job, not grammar's — this pattern only " +
      "describes the token shape.",
    slots: [
      { type: "piece", optional: true },
      { type: "file" },
      { type: "rank" },
      { type: "to", optional: true },
      { type: "file" },
      { type: "rank" },
    ],
  },
  {
    id: "capture-move-with-origin",
    description:
      'Origin square + takes + destination square, e.g. "knight g4 takes e5", ' +
      '"bishop c1 takes h6". Added for grammar expansion -- the original build ' +
      "deliberately had no pattern for an explicit origin square before \"takes\" " +
      '(capture-move below only supports piece-name-or-nothing + takes + destination, ' +
      "never an origin square), documented at the time as a real gap rather than an " +
      "oversight. Must be checked before capture-move, since capture-move's shape is " +
      "a strict prefix of this one.",
    slots: [
      { type: "piece", optional: true },
      { type: "file" },
      { type: "rank" },
      { type: "takes" },
      { type: "file" },
      { type: "rank" },
    ],
  },
  {
    id: "capture-move",
    description: 'Piece (optional) + takes + destination square, e.g. "knight takes e5".',
    slots: [
      { type: "piece", optional: true },
      { type: "takes" },
      { type: "file" },
      { type: "rank" },
    ],
  },
  {
    id: "destination-promotion",
    description:
      'Destination square + promotion piece, with no origin square at all, e.g. ' +
      '"h8 queen", "pawn h8 queen", "pawn to h8 queen". Added for grammar expansion -- ' +
      "previously EVERY promotion pattern required an explicit origin square " +
      "(from-to-promotion, capture-promotion); this is the bare destination-only form, " +
      "the promotion equivalent of destination-move below. Must be checked before " +
      "destination-move, since destination-move's shape is a strict prefix of this one. " +
      'The second optional "to" supports "pawn h8 promote to queen" (see capture-promotion\'s note).',
    slots: [
      { type: "piece", optional: true },
      { type: "to", optional: true },
      { type: "file" },
      { type: "rank" },
      { type: "to", optional: true },
      { type: "promotionPiece" },
    ],
  },
  {
    id: "destination-move",
    description:
      'Piece (optional) + destination square, with an optional "to"/"two"/"too" ' +
      'preposition in between, e.g. "e4", "knight f3", "knight to f3", "pawn to e four".',
    slots: [
      { type: "piece", optional: true },
      { type: "to", optional: true },
      { type: "file" },
      { type: "rank" },
    ],
  },
  {
    id: "castle-kingside",
    description: 'Kingside castling, e.g. "castle kingside", "short castle", "O O".',
    slots: [{ type: "castleKingside" }],
  },
  {
    id: "castle-queenside",
    description: 'Queenside castling, e.g. "castle queenside", "long castle", "O O O".',
    slots: [{ type: "castleQueenside" }],
  },
  {
    id: "castle-ambiguous-kingside",
    description:
      'One half of bare, unqualified "castle" (no direction specified) -- see ' +
      "isCastleWordToken's doc comment for why this deliberately produces two " +
      "separate ParseResults (this pattern + castle-ambiguous-queenside) rather " +
      "than picking a default direction.",
    slots: [{ type: "castleWord" }],
  },
  {
    id: "castle-ambiguous-queenside",
    description: 'The other half of bare "castle" -- see castle-ambiguous-kingside.',
    slots: [{ type: "castleWord" }],
  },
];

/**
 * Maps a SlotType to its token-classification predicate. IntentParser
 * (Step 4) will use this to actually walk a token array against a
 * GrammarPattern's slots — kept here, next to the patterns and
 * predicates it wires together, rather than duplicated in IntentParser.
 */
export const SLOT_PREDICATES: Readonly<Record<SlotType, (token: string) => boolean>> = {
  piece: isPieceToken,
  to: isToToken,
  takes: isTakesToken,
  file: isFileToken,
  rank: isRankToken,
  promotionPiece: isPromotionPieceToken,
  castleKingside: isCastleKingsideToken,
  castleQueenside: isCastleQueensideToken,
  castleWord: isCastleWordToken,
};