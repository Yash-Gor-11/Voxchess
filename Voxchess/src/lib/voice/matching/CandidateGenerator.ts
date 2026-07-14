// src/lib/voice/matching/CandidateGenerator.ts
//
// ParseResult + legal moves -> RawCandidate[]. Generation logic only —
// filters legal moves by what a ParseResult constrains, no scoring. Kept
// deliberately separate from ranking (MoveRanker) per v3 §5.6: generation
// should almost never change, ranking is what gets tuned as usage surfaces
// edge cases.
//
// Scope discipline (explicitly flagged in review): this module answers
// "which legal moves satisfy this parsed intent," using ONLY what
// ChessAdapter.getLegalMoves() already reports. It must not grow its own
// castling-legality, en-passant, check, or pin logic — that's chess.js's
// job via ChessAdapter, and re-deriving any of it here would create a
// second source of truth that could drift from board reality.
//
// Dependency rules (v3 §5.0): matching/ sits below confirmation/ and
// controller/, above intent/ and language/. May import adapters/ (for the
// LegalMove type) and types/, but not chess.js directly.

import type { LegalMove, ParseResult, RawCandidate } from "../types";

/**
 * Whether `parseResult`'s capture flag is compatible with `move`.
 *
 * Asymmetric on purpose: if the user said "takes" (capture: true), the
 * move MUST actually capture something — that's a real constraint, catches
 * a misparse. But if the user did NOT say "takes" (capture: false), that
 * does NOT mean the move must be non-capturing — real chess voice input
 * doesn't require saying "takes" for a capture to be valid (Lichess-style
 * UX: "e4" is a fine thing to say even when it captures on e4). So
 * capture: false places no constraint on the move at all.
 */
function captureCompatible(parseResult: ParseResult, move: LegalMove): boolean {
  if (parseResult.capture) return move.captured !== undefined;
  return true;
}

function squareMatches(square: { file: string; rank: string }, squareStr: string): boolean {
  return squareStr === `${square.file}${square.rank}`;
}

/**
 * Generates candidates for a single ParseResult against a set of legal
 * moves. Exported separately from generateCandidates (which handles an
 * array of ParseResults) since Phase 4+ controller code may want to
 * generate for one already-selected ParseResult directly.
 */
export function generateCandidatesForParseResult(
  parseResult: ParseResult,
  legalMoves: readonly LegalMove[],
): RawCandidate[] {
  let filtered: LegalMove[];

  if (parseResult.isCastle === "K") {
    filtered = legalMoves.filter((m) => m.isCastleKingside);
  } else if (parseResult.isCastle === "Q") {
    filtered = legalMoves.filter((m) => m.isCastleQueenside);
  } else if (parseResult.from) {
    // Two-square form ("e2 e4"): the origin square is authoritative and
    // already pins down which piece is moving (chess.js resolves that from
    // board state), so we deliberately do NOT also filter by
    // parseResult.piece here — see the module header on generation vs.
    // ranking, and IntentParser's determinism note on why "from" being
    // present already fully identifies a candidate set of size <= 1 in
    // virtually all real positions (barring pathological FENs with
    // duplicate pieces on the same square, which chess.js itself
    // wouldn't produce as a legal position).
    const from = parseResult.from;
    filtered = legalMoves.filter((m) => {
      if (from.file && from.rank) return squareMatches({ file: from.file, rank: from.rank }, m.from);
      if (from.file) return m.from.startsWith(from.file);
      if (from.rank) return m.from.endsWith(from.rank);
      return true; // from: {} — shouldn't occur given current grammar, but don't crash if it does
    });
    if (parseResult.to) {
      filtered = filtered.filter((m) => squareMatches(parseResult.to!, m.to));
    }
  } else if (parseResult.to) {
    // Destination-only form ("e4", "knight f3", "knight takes e5"). This
    // is where real ambiguity lives — multiple pieces (or the same piece
    // from different origins) may be able to reach the same square. All
    // of them become candidates here; MoveRanker (and eventually
    // ConfirmationManager) is what narrows further, not this function.
    filtered = legalMoves.filter((m) => squareMatches(parseResult.to!, m.to));
    if (parseResult.piece) {
      filtered = filtered.filter((m) => m.piece === parseResult.piece);
    }
  } else {
    // Neither castle, from, nor to — not a move ParseResult at all
    // (shouldn't happen given IntentParser's current grammar, but fail
    // safe rather than throw).
    return [];
  }

  filtered = filtered.filter((m) => captureCompatible(parseResult, m));

  if (parseResult.promotion) {
    filtered = filtered.filter((m) => m.promotion === parseResult.promotion);
  }

  return filtered.map((move) => ({ move, parseResult }));
}

/**
 * generateCandidates(parseResults, legalMoves) -> RawCandidate[]
 *
 * Runs generateCandidatesForParseResult across every ParseResult (plural,
 * since IntentParser's return type is an array — see its determinism
 * note) and flattens the results. With the current IntentParser grammar
 * there's normally exactly one ParseResult per input, so this is
 * functionally single-ParseResult today, but the signature stays
 * array-in per v3 §5.6's declared interface.
 */
export function generateCandidates(
  parseResults: readonly ParseResult[],
  legalMoves: readonly LegalMove[],
): RawCandidate[] {
  return parseResults.flatMap((pr) => generateCandidatesForParseResult(pr, legalMoves));
}
