// src/lib/chess/reviewConstants.ts

export const REVIEW_CONFIG = {
  missedWinCpLoss:          1000,
  endgameMaterialThreshold:   13,
  // openingPlyCap removed — book classification now uses lastBookPly from
  // detectOpening(), which is accurate per-game rather than a fixed cap.
  thresholds: {
    good:               20,
    inaccuracy:        100,
    mistake:           300,
    brilliantEvalGain: 150,
    greatEvalGain:      50,
  },
} as const;

export const CURRENT_REVIEW_VERSION = 1;