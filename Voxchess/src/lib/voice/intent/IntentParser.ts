// src/lib/voice/intent/IntentParser.ts
//
// tokens -> ParseResult[]. Produces INTENT, not moves — a bare "b" or a
// resign command are both valid outputs of the overall pipeline, but
// neither is a move (v3 §5.5). Command detection (undo/resign/draw/flip)
// is commands/CommandParser.ts's job (Phase 6); this module only handles
// the move grammar defined declaratively in language/en/grammar.ts.
//
// Dependency rules (v3 §5.0): intent/ sits above language/en/, below
// matching/. This file must not import chess.js, ChessAdapter, or anything
// from matching/confirmation/controller/commands.
//
// Determinism note: with the current grammar vocabulary, file/rank/to/
// takes/castle token sets are mutually disjoint, and "piece" vs
// "promotionPiece" only overlap where that's semantically intentional
// (queen/rook/bishop/knight are valid both as the moving piece and as a
// promotion target). Combined with each pattern requiring FULL token
// consumption (see tryMatchPattern), this means at most one pattern can
// match a given token sequence today — parseIntent's ParseResult[] return
// type is deliberately still an array (not ParseResult | null) because
// that invariant is a property of the current grammar, not a structural
// guarantee, and a future grammar addition could reintroduce genuine
// ambiguity. IntentParser.test.ts asserts the "at most one match" property
// explicitly so a future change that breaks it fails loudly here rather
// than surfacing as a confusing downstream bug in CandidateGenerator.

import {
  GRAMMAR_PATTERNS,
  SLOT_PREDICATES,
  type GrammarPattern,
  type SlotType,
} from "../language/en/grammar";
import type { ParseResult, PieceLetter, PromotionLetter } from "../types";

const PIECE_WORD_TO_SAN: Readonly<Record<string, PieceLetter>> = {
  pawn: "P",
  knight: "N",
  bishop: "B",
  rook: "R",
  queen: "Q",
  king: "K",
};

const RANK_WORD_TO_DIGIT: Readonly<Record<string, string>> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
};

/** Rank tokens arrive as either a digit already ("4", from a split "e4") or a word ("four"). */
function rankTokenToDigit(token: string): string {
  if (/^[1-8]$/.test(token)) return token;
  return RANK_WORD_TO_DIGIT[token] ?? token;
}

interface SlotMatch {
  type: SlotType;
  /** null when the slot was optional and did not match a token. */
  token: string | null;
}

/**
 * Attempts to match `tokens` fully against `pattern`. Returns the ordered
 * slot matches on success, or null if the pattern doesn't fully consume
 * the token array. No backtracking — see the determinism note above for
 * why that's currently safe given the grammar's disjoint predicate sets.
 */
function tryMatchPattern(tokens: string[], pattern: GrammarPattern): SlotMatch[] | null {
  let ti = 0;
  const matches: SlotMatch[] = [];

  for (const slot of pattern.slots) {
    const predicate = SLOT_PREDICATES[slot.type];
    if (ti < tokens.length && predicate(tokens[ti])) {
      matches.push({ type: slot.type, token: tokens[ti] });
      ti++;
    } else if (slot.optional) {
      matches.push({ type: slot.type, token: null });
    } else {
      return null;
    }
  }

  return ti === tokens.length ? matches : null;
}

/**
 * Returns the token for the nth (0-indexed) occurrence of `type` within
 * `matches`. Needed because from-to-move/from-to-promotion patterns have
 * TWO "file" slots and TWO "rank" slots (origin square, destination
 * square) — a plain type-keyed lookup can't distinguish them, only
 * position can.
 */
function getNth(matches: SlotMatch[], type: SlotType, n: number): string | null {
  let seen = 0;
  for (const m of matches) {
    if (m.type !== type) continue;
    if (seen === n) return m.token;
    seen++;
  }
  return null;
}

function buildParseResult(pattern: GrammarPattern, matches: SlotMatch[], raw: string): ParseResult {
  if (pattern.id === "castle-kingside") {
    return { piece: null, from: null, to: null, capture: false, promotion: null, isCastle: "K", raw };
  }
  if (pattern.id === "castle-queenside") {
    return { piece: null, from: null, to: null, capture: false, promotion: null, isCastle: "Q", raw };
  }

  const pieceToken = getNth(matches, "piece", 0);
  const piece: PieceLetter | null = pieceToken ? PIECE_WORD_TO_SAN[pieceToken] ?? null : null;

  if (pattern.id === "destination-move" || pattern.id === "capture-move") {
    const file = getNth(matches, "file", 0)!;
    const rank = rankTokenToDigit(getNth(matches, "rank", 0)!);
    return {
      piece,
      from: null,
      to: { file, rank },
      capture: pattern.id === "capture-move",
      promotion: null,
      isCastle: null,
      raw,
    };
  }

  if (pattern.id === "capture-promotion") {
    const file = getNth(matches, "file", 0)!;
    const rank = rankTokenToDigit(getNth(matches, "rank", 0)!);
    const promoToken = getNth(matches, "promotionPiece", 0)!;
    return {
      piece,
      from: null,
      to: { file, rank },
      capture: true,
      // Safe cast: isPromotionPieceToken excludes king/pawn (grammar.ts).
      promotion: PIECE_WORD_TO_SAN[promoToken] as PromotionLetter,
      isCastle: null,
      raw,
    };
  }

  // from-to-move and from-to-promotion both have two file/rank pairs:
  // index 0 = origin square, index 1 = destination square.
  const fromFile = getNth(matches, "file", 0)!;
  const fromRank = rankTokenToDigit(getNth(matches, "rank", 0)!);
  const toFile = getNth(matches, "file", 1)!;
  const toRank = rankTokenToDigit(getNth(matches, "rank", 1)!);

  let promotion: PromotionLetter | null = null;
  if (pattern.id === "from-to-promotion") {
    const promoToken = getNth(matches, "promotionPiece", 0)!;
    // Safe cast: isPromotionPieceToken (grammar.ts) already excludes king/pawn,
    // so PIECE_WORD_TO_SAN[promoToken] is always one of Q/R/B/N here.
    promotion = PIECE_WORD_TO_SAN[promoToken] as PromotionLetter;
  }

  return {
    piece,
    from: { file: fromFile, rank: fromRank },
    to: { file: toFile, rank: toRank },
    capture: false,
    promotion,
    isCastle: null,
    raw,
  };
}

/**
 * parseIntent(tokens) -> ParseResult[]
 *
 * Tries every pattern in GRAMMAR_PATTERNS (in the array's declared order —
 * see grammar.ts's priority-ordering comment) and returns a ParseResult
 * for each one that fully consumes the token array. Returns an empty array
 * if nothing matches (unrecognized phrase, or a non-move command that
 * CommandParser — not this module — will need to handle in Phase 6).
 */
export function parseIntent(tokens: string[]): ParseResult[] {
  if (tokens.length === 0) return [];

  const raw = tokens.join(" ");
  const results: ParseResult[] = [];

  for (const pattern of GRAMMAR_PATTERNS) {
    const matches = tryMatchPattern(tokens, pattern);
    if (matches) {
      results.push(buildParseResult(pattern, matches, raw));
    }
  }

  return results;
}
