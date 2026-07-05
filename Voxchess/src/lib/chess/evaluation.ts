// src/lib/chess/evaluation.ts
//
// Neutral, shared evaluation math. Depends on nothing else in lib/chess.
// Both reviewEngine.ts and botMoveSelection.ts import FROM here; neither
// imports from the other.
//
//   evaluation.ts
//        │
//        ├──────► reviewEngine.ts
//        └──────► botMoveSelection.ts

import { REVIEW_CONFIG } from "./reviewConstants";

export const MOVE_QUALITIES = [
  "best",
  "excellent",
  "good",
  "inaccuracy",
  "mistake",
  "blunder",
] as const;

export type MoveQuality = (typeof MOVE_QUALITIES)[number];

export function cpToWinPercent(cp: number): number {
  const ceiled = Math.max(-REVIEW_CONFIG.cpCeiling, Math.min(REVIEW_CONFIG.cpCeiling, cp));
  const raw = 50 + 50 * (2 / (1 + Math.exp(-REVIEW_CONFIG.winPercentSteepness * ceiled)) - 1);
  return Math.max(0, Math.min(100, raw));
}

export function evalToWinPercent(cp: number | null, mate: number | null): number {
  if (mate !== null) return cpToWinPercent(mate > 0 ? REVIEW_CONFIG.cpCeiling : -REVIEW_CONFIG.cpCeiling);
  return cpToWinPercent(cp ?? 0);
}

/**
 * Maps a winLossVsBest value (win%, 0-100) to a MoveQuality band. Single
 * source of truth for the quality ladder boundaries — both reviewEngine's
 * classifyMove and botMoveSelection's classifyPv call this instead of each
 * maintaining a copy of the threshold comparisons. Never returns "best" —
 * callers decide what counts as "best" for their own context.
 */
export function classifyWinLoss(winLossVsBest: number): MoveQuality {
  const { excellent, good, inaccuracy, mistake } = REVIEW_CONFIG.thresholds;
  if (winLossVsBest < excellent) return "excellent";
  if (winLossVsBest < good) return "good";
  if (winLossVsBest < inaccuracy) return "inaccuracy";
  if (winLossVsBest < mistake) return "mistake";
  return "blunder";
}