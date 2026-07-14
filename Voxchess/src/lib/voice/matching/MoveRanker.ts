// src/lib/voice/matching/MoveRanker.ts
//
// RawCandidate[] + RankingContext -> MoveCandidate[], scored and sorted
// descending by score. This is the layer v3 §5.6/§5.7 expects to change
// frequently as real usage surfaces edge cases — CandidateGenerator's
// filtering logic stays stable, this file's scoring weights don't have to.
//
// Scoring model (v3 §5.7: "edit-distance/token-overlap against SAN,
// weighted by ASR confidence, pawn-default tiebreak"):
//   1. Base score = context.confidence if provided, else 1.0 (ASR
//      confidence isn't wired up until Phase 4, so this is usually the
//      default today).
//   2. Pawn-default tiebreak: when the ParseResult didn't name a piece
//      (destination-only form, e.g. bare "e4"), a pawn candidate gets a
//      small bonus — mirroring SAN's own convention that an unqualified
//      destination move is a pawn move unless stated otherwise.
//   3. Genuinely tied candidates (e.g. two rooks that can both reach the
//      same square) are LEFT tied — this module does not attempt to guess
//      between them. Breaking a real ambiguity here would be silently
//      wrong more often than not; that's exactly what confirmation/
//      ConfirmationManager (Phase 5) exists to ask the user about.
//
// Dependency rules (v3 §5.0): matching/ may import types/ and the LegalMove
// shape from adapters/ (types only, not chess.js itself).

import type { MoveCandidate, RankingContext, RawCandidate } from "../types";

const PAWN_DEFAULT_BONUS = 0.05;

function scoreCandidate(candidate: RawCandidate, context: RankingContext): number {
  const base = context.confidence ?? 1.0;

  let score = base;

  // Pawn-default tiebreak — only applies when the spoken phrase didn't
  // name a piece at all. If a piece WAS named, CandidateGenerator already
  // filtered to only that piece, so this bonus would never differentiate
  // anything (every remaining candidate is already that piece).
  if (candidate.parseResult.piece === null && candidate.move.piece === "P") {
    score += PAWN_DEFAULT_BONUS;
  }

  score = Math.max(0, Math.min(1, score));
  // Round to avoid floating-point artifacts like 0.9 + 0.05 producing
  // 0.9500000000000001 — found during testing (fullPipeline pawn-default
  // tiebreak check), not theoretical. Fixture-based equality checks would
  // be flaky without this.
  return Math.round(score * 1000) / 1000;
}

function toMoveCandidate(raw: RawCandidate, score: number): MoveCandidate {
  return {
    move: {
      from: raw.move.from,
      to: raw.move.to,
      promotion: raw.move.promotion,
    },
    san: raw.move.san,
    score,
  };
}

/**
 * rankCandidates(raw, context) -> MoveCandidate[]
 *
 * Sorted descending by score. Ties are preserved in their original
 * relative order (Array.prototype.sort is stable per the ES2019+ spec,
 * which this codebase's target already satisfies) — that determinism
 * matters for fixture testing and for whichever candidate
 * ConfirmationManager (Phase 5) treats as "preferred" when scores tie.
 */
export function rankCandidates(
  raw: readonly RawCandidate[],
  context: RankingContext,
): MoveCandidate[] {
  return raw
    .map((candidate) => toMoveCandidate(candidate, scoreCandidate(candidate, context)))
    .sort((a, b) => b.score - a.score);
}
