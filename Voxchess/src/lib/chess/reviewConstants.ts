// src/lib/chess/reviewConstants.ts

export const REVIEW_CONFIG = {
  endgameMaterialThreshold: 13,

  // Centipawn ceiling applied BEFORE the win% sigmoid — matches Lichess's
  // published Eval.Cp.CEILING exactly (see https://lichess.org/page/accuracy
  // and lila's Eval.scala). A forced mate is also converted through this
  // same ceiling (as a signed ±cpCeiling value) rather than treated as a
  // literal 100%/0% probability.
  cpCeiling: 1000,

  // The starting position isn't treated as a perfectly neutral 50% — it
  // carries a tiny built-in White edge, matching lila's Eval.Cp.initial
  // exactly. Used as the seed value for the game-accuracy win% trajectory.
  initialPositionCp: 15,

  // Sigmoid steepness for converting a centipawn evaluation into a win
  // probability (0-100). Matches Lichess's published constant exactly
  // (MULTIPLIER = -0.00368208 in lila's Eval.scala / WinPercent.scala).
  winPercentSteepness: 0.00368208,

  // ── Classification thresholds ──────────────────────────────────────────
  //
  // VoxChess deliberately uses a HYBRID model rather than cloning either
  // site outright:
  //
  //   - ACCURACY (computeMoveAccuracy / MoveReview.winPercentLoss) is PURE
  //     Lichess: the move's own before/after win% swing. Per Lichess's own
  //     stated philosophy ("good moves don't exist — you can only lose win%
  //     by playing worse than the position already was"), this is NEVER
  //     zeroed out for "Best" moves. Even the engine's #1 choice can show
  //     <100% accuracy if the position naturally continues to drift.
  //
  //   - CLASSIFICATION (the Best/Excellent/Good/.../Brilliant label) is
  //     chess.com-style: how much worse the played move was than the best
  //     available alternative, in win% terms. This is a SEPARATE metric
  //     (winLossVsBest = bestMoveWinPercent - playedMoveWinPercent) from
  //     the accuracy one above — see classifyMove.
  //
  // Both run through the same win%/sigmoid machinery; only the INPUT win%
  // values being compared differ between the two metrics.
  thresholds: {
    // winLossVsBest bands, in win% (0-100). "Best" is NOT one of these
    // bands — it's an exact-match check (played move === engine's #1
    // move), with no tolerance. These bands only apply otherwise.
    excellent: 2,    // winLossVsBest <  5  -> Excellent
    good: 5,        //               < 10  -> Good
    inaccuracy: 10,  //               < 20  -> Inaccuracy
    mistake: 15,     //               < 30  -> Mistake; >= 30 -> Blunder

    // Win-percent MARGIN between the played move and the engine's
    // second-best alternative, required to upgrade "Best" to "Great".
    // Great REQUIRES the played move to be the engine's literal #1 choice
    // — see classifyMove. Rewards a move that meaningfully stands out from
    // the alternatives, not one that merely occurs in a position whose
    // win% happened to swing a lot.
    greatMargin: 5,

    // A position is "already decided" if the mover's win% BEFORE the move
    // falls outside this band. Great and Brilliant are both suppressed
    // there: finding a strong move in a position that's already
    // essentially won or lost isn't what these labels are meant to reward.
    decisiveWinPercentFloor: 20,
    decisiveWinPercentCeiling: 80,

    // Missed Win: a winning continuation existed (bestMoveWinPercent >=
    // this threshold) that the player failed to reach (playedMoveWinPercent
    // < this threshold), in a position that wasn't ALREADY at this level
    // beforehand (beforeWinPercent < this threshold) — i.e. genuinely
    // missing a winning chance that had to be FOUND, not "threw away a
    // position that was already winning" (that correctly stays
    // Mistake/Blunder, since beforeWinPercent would already be at or above
    // this threshold). Only overrides a base classification of Mistake or
    // Blunder.
    missedWinThreshold: 75,
  },

  // estimatePerformance() blends the raw table-lookup rating toward the
// table's OWN value at this anchor accuracy for short games, so "3
// perfect moves" doesn't report the same extreme rating as "80 perfect
// moves". Set to an EXACT point already in PERFORMANCE_TABLE (74 -> 1500)
// rather than an interpolated value, so the anchor itself is a visible,
// deliberate design choice and not an incidental side-effect of
// interpolation. Confidence reaches 1.0 (no blending) once moveCount hits
// performanceConfidenceMoves.
performanceAnchorAccuracy: 74,
performanceConfidenceMoves: 30,

  // Game-level accuracy is NOT a simple average of move accuracies. This is
  // a faithful port of lila's published algorithm (verified against actual
  // Lichess source — not an approximation): split the game into sliding
  // windows, weight each move's accuracy by the local win% volatility
  // (population stdev, clamped to [gameAccuracyWeightMin,
  // gameAccuracyWeightMax]) of its window, blend that volatility-weighted
  // mean with the harmonic mean of all move accuracies, and average the
  // two. See buildWeightedAccuracies() / computeGameAccuracy() in
  // reviewEngine.ts.
  gameAccuracyWindowMin: 2,
  gameAccuracyWindowMax: 8,
  gameAccuracyWindowDivisor: 10,
  gameAccuracyWeightMin: 0.5,
  gameAccuracyWeightMax: 12,
} as const;

// Bumped: move classification overhauled to the win%-based hybrid model
// described above (Lichess-style accuracy, chess.com-style category bands,
// VoxChess-specific Great/Brilliant/Missed Win logic), with a new
// "excellent" tier added between Best and Good. winPercentLoss is now
// persisted in the annotated PGN via a [%wpl] tag (previously lost on
// reload, silently defaulting to 0 — see parseMoveAnnotation). Existing
// annotated PGNs will be flagged by reviewNeedsUpgrade() and prompted for
// re-analysis.
export const CURRENT_REVIEW_VERSION = 4;