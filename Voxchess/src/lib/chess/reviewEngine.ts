// src/lib/chess/reviewEngine.ts

import { REVIEW_CONFIG, CURRENT_REVIEW_VERSION } from "./reviewConstants";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MoveClassification =
  | "book"
  | "brilliant"
  | "great"
  | "missedWin"
  | "best"
  | "excellent"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder";

export type GamePhase = "opening" | "middlegame" | "endgame";

export type EngineLine = {
  readonly moves: readonly string[]; // UCI
  readonly san: readonly string[];   // derived once at generation time
  readonly eval: number | null;      // centipawns, white perspective
  readonly mate: number | null;
  readonly depth: number;
};

export type MoveReview = {
  readonly ply: number;              // 1-indexed; white = odd, black = even
  readonly san: string;
  readonly uci: string;
  readonly fenBefore: string;
  readonly fenAfter: string;
  readonly evalBefore: number | null; // centipawns, white perspective
  readonly evalAfter: number | null;
  readonly mateBefore: number | null;
  readonly mateAfter: number | null;
  readonly bestMove: string;          // UCI — canonical
  readonly bestMoveSan: string;
  readonly bestMoveEval: number | null;
  readonly bestMoveMate: number | null;
  readonly cpLoss: number;            // >= 0, side-to-move perspective — feeds ACPL
  readonly winPercentLoss: number;    // >= 0, 0-100 — feeds accuracy (pure Lichess metric, see computeMoveAccuracy)
  readonly classification: MoveClassification;
  readonly phase: GamePhase;          // assigned during buildReviewModel
  readonly isBook: boolean;
  readonly engineLines: readonly EngineLine[];
};

export type ReviewSideStats = {
  readonly accuracy: number;
  readonly acpl: number;
  readonly estimatedPerformance: number;
  readonly openingAccuracy: number | null;
  readonly middlegameAccuracy: number | null;
  readonly endgameAccuracy: number | null;
  readonly counts: Readonly<Record<MoveClassification, number>>; // per-side — counts.book is THIS side's book moves
};

export type ReviewModel = {
  readonly version: number;
  readonly depth: number;
  readonly moves: readonly MoveReview[];
  readonly white: ReviewSideStats;
  readonly black: ReviewSideStats;
  readonly opening: string;
  readonly eco: string;
  readonly lastBookPly: number;       // -1 if no book moves
  readonly openingEndPly: number;     // -1 if no opening detected
  readonly endgameStartPly: number;   // -1 if no endgame reached
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PIECE_VALUES: Record<string, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9,
};

const PERFORMANCE_TABLE: readonly [number, number][] = [
  [100, 3200],
  [99, 3050],
  [97, 2900],
  [95, 2700],
  [92, 2500],
  [89, 2300],
  [85, 2100],
  [80, 1900],
  [75, 1700],
  [69, 1500],
  [62, 1300],
  [55, 1100],
  [0, 800],
];

// ─── Material ─────────────────────────────────────────────────────────────────

export type MaterialCount = { readonly white: number; readonly black: number };

/**
 * Count material for both sides from a FEN string.
 * Piece values: P=1 N=3 B=3 R=5 Q=9 (kings excluded).
 */
export function countMaterial(fen: string): MaterialCount {
  // Parse only the piece placement field — no Chess instance needed.
  const placement = fen.split(" ")[0];
  let white = 0;
  let black = 0;

  for (const ch of placement) {
    const lower = ch.toLowerCase();
    const val = PIECE_VALUES[lower];
    if (val === undefined) continue;
    if (ch === ch.toUpperCase()) white += val;
    else black += val;
  }

  return { white, black };
}

/**
 * Precompute material counts for every position in a game.
 * Pass fenAfter[] (one entry per ply). Reuse this array everywhere
 * to avoid recreating Chess instances repeatedly.
 */
export function buildMaterialHistory(fens: readonly string[]): MaterialCount[] {
  return fens.map(countMaterial);
}

// ─── Win probability model ────────────────────────────────────────────────────
//
// Win% conversion, the per-move accuracy formula, and the game-level
// accuracy aggregation below are all verified against actual Lichess
// source (lila's Eval.scala / WinPercent.scala / AccuracyPercent.scala),
// not reverse-engineered approximations. Only move CLASSIFICATION (the
// Best/Excellent/Good/.../Brilliant label) departs from Lichess — see
// classifyMove and REVIEW_CONFIG.thresholds for that hybrid design.

/**
 * Convert a centipawn evaluation into a win percentage (0-100) for the side
 * the evaluation is expressed from the perspective of.
 *
 * Matches Lichess's published implementation exactly (Eval.Cp.ceiled +
 * WinPercent.fromCentiPawns): cp is clamped to ±REVIEW_CONFIG.cpCeiling
 * BEFORE the sigmoid is applied, not after. This means evaluations beyond
 * the ceiling all map to the same win% — a +5000cp position isn't treated
 * as "more winning" than a +1000cp one.
 *
 * Reference values for REVIEW_CONFIG.winPercentSteepness = 0.00368208 —
 * verify these still hold (see reviewEngine.test.ts) before changing the
 * constant, since this curve underlies both accuracy and classification:
 *
 *   cp =     0  ->  50.00%
 *   cp =  +100  ->  59.12%
 *   cp =  -100  ->  40.88%
 *   cp = +1000  ->  97.55%  (= the ceiling — also the value for any cp >= 1000)
 *   cp = -1000  ->   2.45%  (= the floor   — also the value for any cp <= -1000)
 */
export function cpToWinPercent(cp: number): number {
  const ceiled = Math.max(-REVIEW_CONFIG.cpCeiling, Math.min(REVIEW_CONFIG.cpCeiling, cp));
  const raw = 50 + 50 * (2 / (1 + Math.exp(-REVIEW_CONFIG.winPercentSteepness * ceiled)) - 1);
  // The sigmoid asymptotes naturally stay within (0, 100), but clamp
  // explicitly so the invariant holds regardless of floating-point behavior
  // at the tails.
  return Math.max(0, Math.min(100, raw));
}

/**
 * Convert an evaluation (centipawns or forced mate) into a win percentage
 * (0-100).
 *
 * A forced mate is NOT treated as a literal 100%/0% probability. Matching
 * Lichess's published implementation (Eval.Cp.ceilingWithSignum), a mate is
 * converted into a SIGNED CEILING centipawn value (±REVIEW_CONFIG.cpCeiling)
 * and run through the same sigmoid as everything else — i.e. "a forced mate
 * is as winning as our most extreme cp evaluation gets", not "a guaranteed
 * win with certainty 1".
 */
export function evalToWinPercent(cp: number | null, mate: number | null): number {
  if (mate !== null) return cpToWinPercent(mate > 0 ? REVIEW_CONFIG.cpCeiling : -REVIEW_CONFIG.cpCeiling);
  return cpToWinPercent(cp ?? 0);
}

/**
 * Win-percentage lost by the ACTUAL MOVE PLAYED, comparing the position
 * immediately before it to the position immediately after it — NOT the
 * actual move vs. the best move (that's a different metric — see
 * classifyMove's winLossVsBest).
 *
 * This is the real input to the Lichess accuracy formula. It's why a
 * "blunder" inside an already-won or already-lost position scores as
 * ~100% accurate: the win probability barely moved, even if the centipawn
 * swing looks dramatic. It is intentionally NOT zeroed out for top moves —
 * per Lichess's stated philosophy, "good moves don't exist", you can only
 * lose win% by playing worse than the position already was.
 *
 * All four inputs must already be in the same (mover's) perspective.
 */
export function computeWinPercentLoss(
  evalBeforeSide: number | null,
  evalAfterSide: number | null,
  mateBeforeSide: number | null,
  mateAfterSide: number | null,
): number {
  const before = evalToWinPercent(evalBeforeSide, mateBeforeSide);
  const after = evalToWinPercent(evalAfterSide, mateAfterSide);
  return Math.max(0, before - after);
}

// ─── Move accuracy ────────────────────────────────────────────────────────────

/**
 * Lichess's published accuracy formula.
 *
 * Takes WIN-PERCENT LOSS (0-100) — NOT centipawn loss, and NOT loss vs. the
 * best move. This is the actual move's own before/after win% swing (see
 * computeWinPercentLoss). Returns a value in [0, 100].
 */
export function computeMoveAccuracy(winPercentLoss: number): number {
  const raw = 103.1668 * Math.exp(-0.04354 * winPercentLoss) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

// ─── Performance estimate ─────────────────────────────────────────────────────

/** Raw table lookup — accuracy in, interpolated rating out, no blending. */
function lookupPerformanceRating(accuracy: number): number {
  for (let i = 0; i < PERFORMANCE_TABLE.length - 1; i++) {
    const [hiAcc, hiRating] = PERFORMANCE_TABLE[i];
    const [loAcc, loRating] = PERFORMANCE_TABLE[i + 1];
    if (accuracy >= loAcc) {
      const t = (accuracy - loAcc) / (hiAcc - loAcc);
      return loRating + t * (hiRating - loRating);
    }
  }
  return PERFORMANCE_TABLE[PERFORMANCE_TABLE.length - 1][1];
}

/**
 * Map overall accuracy to a platform performance rating.
 *
 * This is still fundamentally a pure function of accuracy — it does not
 * re-blend blunder counts, ACPL, or book-move counts, since those are
 * already fully reflected in the accuracy figure itself (re-weighting them
 * here would double-count them). The one additional input, `moveCount`, is
 * a CONFIDENCE adjustment, not a second scoring signal: 3 perfect moves and
 * 80 perfect moves both produce 100% accuracy, but the latter is far more
 * informative about actual playing strength. Short games are blended toward
 * the table's OWN value at an explicit anchor accuracy — not an arbitrary
 * rating — so the single performance table stays the one source of truth
 * for the whole curve, including its low-confidence anchor point.
 */
export function estimatePerformance(accuracy: number, moveCount: number): number {
  const raw = lookupPerformanceRating(accuracy);
  const anchor = lookupPerformanceRating(REVIEW_CONFIG.performanceAnchorAccuracy);
  const confidence = Math.min(moveCount / REVIEW_CONFIG.performanceConfidenceMoves, 1);
  const blended = anchor + confidence * (raw - anchor);
  return Math.round(blended);
}

// ─── Opening boundary ─────────────────────────────────────────────────────────

/**
 * Resolve the opening end ply from the last book ply.
 * Returns -1 if no book moves were detected.
 */
export function resolveOpeningEndPly(lastBookPly: number): number {
  return lastBookPly; // -1 if no book moves detected
}

// ─── Phase detection ──────────────────────────────────────────────────────────

/**
 * Assign a GamePhase to each ply.
 *
 * PRECONDITION: openingEndPly is already resolved via resolveOpeningEndPly().
 * Phases never transition backwards: opening → middlegame → endgame.
 *
 * endgameStartPly: first ply where either side drops to ≤ ENDGAME_MATERIAL_THRESHOLD.
 * -1 if no endgame is reached.
 */
export function determineGamePhases(
  materialHistory: readonly MaterialCount[],
  openingEndPly: number,
): {
  phases: GamePhase[];
  endgameStartPly: number;
} {
  const total = materialHistory.length;
  const phases: GamePhase[] = new Array(total).fill("middlegame");

  for (let i = 0; i <= openingEndPly && i < total; i++) {
    phases[i] = "opening";
  }

  let endgameStartPly = -1;

  for (let i = 0; i < total; i++) {
    if (phases[i] === "opening") continue;
    if (endgameStartPly !== -1) {
      phases[i] = "endgame";
      continue;
    }

    const { white, black } = materialHistory[i];
    if (white <= REVIEW_CONFIG.endgameMaterialThreshold ||
      black <= REVIEW_CONFIG.endgameMaterialThreshold) {
      endgameStartPly = i;
      phases[i] = "endgame";
    }
  }

  return { phases, endgameStartPly };
}

// ─── Move classification ──────────────────────────────────────────────────────

/**
 * Classifies a move using VoxChess's hybrid model:
 *
 *   - cpLoss          — traditional ACPL input (best - actual, in cp).
 *   - winPercentLoss   — PURE Lichess accuracy input (the move's own
 *                         before/after win% swing — see computeWinPercentLoss).
 *                         Deliberately NOT zeroed for top moves and NOT
 *                         compared to the best move.
 *   - classification   — chess.com-style category, driven by a SEPARATE
 *                         metric, winLossVsBest (best move's win% minus the
 *                         played move's win%), with VoxChess-specific
 *                         overlays for Great / Brilliant / Missed Win.
 *
 * Priority (highest wins, evaluated in this order — each later check can
 * overwrite an earlier result): Brilliant > Great > Missed Win > Best >
 * Excellent > Good > Inaccuracy > Mistake > Blunder.
 */
export function classifyMove(params: {
  uci: string;
  bestMove: string;           // UCI
  evalBefore: number | null;  // centipawns, mover's perspective
  evalAfter: number | null;   // centipawns, mover's perspective
  bestMoveEval: number | null;
  bestMoveMate: number | null; // forced-mate count for the top engine line, side-to-move perspective
  mateBefore: number | null;  // forced-mate count, MOVER'S perspective — caller must flip sign
  mateAfter: number | null;   // forced-mate count, MOVER'S perspective — caller must flip sign
  materialBefore: MaterialCount;
  materialAfter: MaterialCount;
  sideToMove: "w" | "b";
  isBook: boolean;
  // Engine's second-best line at the position before the move.
  //
  // useStockfish contract: bestMoves[].score AND bestMoves[].mate are both
  // already side-to-move perspective (same convention as bestMoveEval /
  // bestMoveMate above) — verified against applyHumanError in useStockfish,
  // which reorders bestMoves[] entries without transforming score or mate,
  // implying both fields share one consistent perspective per entry.
  secondBestEval: number | null;
  secondBestMate: number | null;
}): { classification: MoveClassification; cpLoss: number; winPercentLoss: number } {
  const {
    uci, bestMove,
    evalBefore, evalAfter, bestMoveEval, bestMoveMate,
    mateBefore, mateAfter,
    materialBefore, materialAfter,
    sideToMove, isBook,
    secondBestEval, secondBestMate,
  } = params;


  // ── Universal metrics — computed once, every downstream decision reads
  //    from these rather than re-deriving its own ad-hoc comparison. ──

  // cpLoss: traditional ACPL input (Average Centipawn Loss). Naturally 0
  // when the played move IS the engine's best move — eval_ then equals
  // best_ by definition, no special-casing needed.
  const clampCp = (cp: number) =>
  Math.max(-REVIEW_CONFIG.cpCeiling, Math.min(REVIEW_CONFIG.cpCeiling, cp));

const eval_ = clampCp(evalAfter ?? 0);
const best_ = clampCp(bestMoveEval ?? 0);

const cpLoss = Math.max(0, best_ - eval_);

  // winPercentLoss: PURE Lichess accuracy input. See computeWinPercentLoss's
  // doc comment — intentionally decoupled from classification below.
  const winPercentLoss = computeWinPercentLoss(evalBefore, evalAfter, mateBefore, mateAfter);

  // Book moves skip only classification.
  if (isBook) {
    return {
      classification: "book",
      cpLoss,
      winPercentLoss,
    };
  }
  // winLossVsBest: the metric that drives CLASSIFICATION — how much worse
  // the played move was than the best alternative, in win% terms. This is
  // NOT the same quantity as winPercentLoss above.
  const beforeWinPercent = evalToWinPercent(evalBefore, mateBefore);
  const playedWinPercent = evalToWinPercent(evalAfter, mateAfter);
  const bestWinPercent = evalToWinPercent(bestMoveEval, bestMoveMate);
  const secondBestWinPercent =
    secondBestEval !== null || secondBestMate !== null
      ? evalToWinPercent(secondBestEval, secondBestMate)
      : bestWinPercent; // no alternative to compare against — margin is 0
  const winLossVsBest = Math.max(0, bestWinPercent - playedWinPercent);

  const isTopMove = uci === bestMove;

  const isDecisiveAlready =
    beforeWinPercent <= REVIEW_CONFIG.thresholds.decisiveWinPercentFloor ||
    beforeWinPercent >= REVIEW_CONFIG.thresholds.decisiveWinPercentCeiling;

  const ownBefore = sideToMove === "w" ? materialBefore.white : materialBefore.black;
  const ownAfter = sideToMove === "w" ? materialAfter.white : materialAfter.black;
  const isSacrifice = ownAfter < ownBefore;
  

  // ── Base classification: Best is an exact-match check (no threshold, no
  //    tolerance). Everything else bands on winLossVsBest. ──
  let classification: MoveClassification;
  if (isTopMove) {
    classification = "best";
  } else if (winLossVsBest < REVIEW_CONFIG.thresholds.excellent) {
    classification = "excellent";
  } else if (winLossVsBest < REVIEW_CONFIG.thresholds.good) {
    classification = "good";
  } else if (winLossVsBest < REVIEW_CONFIG.thresholds.inaccuracy) {
    classification = "inaccuracy";
  } else if (winLossVsBest < REVIEW_CONFIG.thresholds.mistake) {
    classification = "mistake";
  } else {
    classification = "blunder";
  }

  // ── Missed Win overlay — overrides Mistake/Blunder ONLY. "A winning
  //    continuation existed and you failed to find it" — NOT "threw away a
  //    position that was already winning" (that correctly stays
  //    Mistake/Blunder, since beforeWinPercent would already be at or
  //    above the threshold). ──
  const isMissedWin =
    (classification === "mistake" || classification === "blunder") &&
    beforeWinPercent < REVIEW_CONFIG.thresholds.missedWinThreshold &&
    bestWinPercent >= REVIEW_CONFIG.thresholds.missedWinThreshold &&
    playedWinPercent < REVIEW_CONFIG.thresholds.missedWinThreshold;
  if (isMissedWin) classification = "missedWin";

  // ── Great overlay — engine's #1 move ONLY, standing out clearly from the
  //    runner-up, in a position that wasn't already decided. The only base
  //    classification this can ever be overlaid onto is "best" (isTopMove
  //    is required), but it's kept as an explicit overlay — rather than
  //    folded into the base ladder — so the priority chain stays legible as
  //    written. ──
  const winPercentMargin = Math.max(0, bestWinPercent - secondBestWinPercent);
  const isGreat =
    isTopMove &&
    !isDecisiveAlready &&
    winPercentMargin >= REVIEW_CONFIG.thresholds.greatMargin;
  if (isGreat) classification = "great";

  // ── Brilliant overlay — HIGHEST priority, checked last so it always wins
  //    when its conditions hold. A sacrifice that is ALREADY Best/Excellent
  //    quality (winLossVsBest below the Excellent boundary — NOT required
  //    to be the literal engine #1 move; a sacrifice can be brilliant even
  //    if Stockfish prefers a small-margin alternative) in a position that
  //    wasn't already decided. The winLossVsBest gate is what stops an
  //    unsound or significantly-inferior sacrifice from being called
  //    Brilliant just because material was given up — Brilliant is an
  //    overlay ON TOP OF move quality, not a replacement for it. ──
  const isBrilliant =
    isSacrifice &&
    !isDecisiveAlready &&
    winLossVsBest < REVIEW_CONFIG.thresholds.excellent;
  if (isBrilliant) classification = "brilliant";

  return { classification, cpLoss, winPercentLoss };
}

// ─── Game-level accuracy ───────────────────────────────────────────────────────
//
// Game accuracy is deliberately NOT a simple average of move accuracies.
// This is a faithful port of lila's published algorithm:
//
//   val windowSize = (cps.size / 10).atLeast(2).atMost(8)
//   val windows = List.fill(windowSize.atMost(size) - 2)(firstWindow)
//                   ::: allWinPercents.sliding(windowSize).toList
//   val weights = windows.map(stdev(_).atLeast(0.5).atMost(12))
//
// Two structural details that differ from a naive "centered sliding
// window" implementation, both load-bearing:
//   1. Windows are LEFT-ALIGNED (sliding(windowSize) takes [i, i+windowSize)),
//      not centered on the move being scored.
//   2. The first (windowSize - 2) moves don't get their own window at all —
//      they all share the literal FIRST window (positions [0, windowSize)),
//      padding so early moves still get a volatility weight despite not
//      having enough history yet.

/** Population standard deviation of a list of numbers. 0 for empty input. */
function stdDev(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Harmonic mean of a list of accuracy percentages (0-100). Penalizes low
 * outliers more heavily than an arithmetic mean would — a single 0%-ish
 * move pulls the harmonic mean down much harder than it pulls an average
 * down, which is exactly the "one blunder shouldn't be hidden by an
 * otherwise-clean game" effect the blend is going for.
 */
function harmonicMean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  // Harmonic mean is undefined at exactly 0 (division by zero) — floor each
  // value slightly so one zero-accuracy move doesn't make the whole thing
  // degenerate to 0 outright.
  const EPSILON = 0.01;
  const reciprocalSum = values.reduce((s, v) => s + 1 / Math.max(v, EPSILON), 0);
  return values.length / reciprocalSum;
}

function weightedMean(pairs: readonly { value: number; weight: number }[]): number {
  if (pairs.length === 0) return 0;
  const totalWeight = pairs.reduce((s, p) => s + p.weight, 0);
  if (totalWeight === 0) return pairs.reduce((s, p) => s + p.value, 0) / pairs.length;
  return pairs.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight;
}

type WeightedMoveAccuracy = { readonly ply: number; readonly accuracy: number; readonly weight: number };

/**
 * Builds the per-ply (accuracy, weight) series for the WHOLE game in one
 * pass — both colors interleaved, in ply order. Side-specific stats then
 * filter this by ply parity rather than rebuilding windows per side, since
 * the windowing is inherently a whole-game computation.
 */
function buildWeightedAccuracies(moves: readonly MoveReview[]): WeightedMoveAccuracy[] {
  if (moves.length === 0) return [];

  // allWinPercents = [initial position] ++ [win% after each move], all in
  // White's perspective (matching evalAfter/mateAfter's stored convention).
  // This trajectory is used ONLY to measure local volatility below — it is
  // NOT used to recompute per-move accuracy (see the comment below).
  const allWinPercents = [
    cpToWinPercent(REVIEW_CONFIG.initialPositionCp),
    ...moves.map((m) => evalToWinPercent(m.evalAfter, m.mateAfter)),
  ];

  const windowSize = Math.max(
    REVIEW_CONFIG.gameAccuracyWindowMin,
    Math.min(
      REVIEW_CONFIG.gameAccuracyWindowMax,
      // Integer floor division, matching Scala's Int/Int — NOT rounding.
      Math.floor(moves.length / REVIEW_CONFIG.gameAccuracyWindowDivisor),
    ),
  );
  const effectiveWindowSize = Math.min(windowSize, allWinPercents.length);
  const padCount = Math.max(0, effectiveWindowSize - 2);
  const firstWindow = allWinPercents.slice(0, effectiveWindowSize);

  const windows: number[][] = [];
  for (let i = 0; i < padCount; i++) windows.push(firstWindow);
  for (let start = 0; start + effectiveWindowSize <= allWinPercents.length; start++) {
    windows.push(allWinPercents.slice(start, start + effectiveWindowSize));
  }
  // windows.length === moves.length here (one per ply).

  const weights = windows.map((w) =>
    Math.max(REVIEW_CONFIG.gameAccuracyWeightMin, Math.min(REVIEW_CONFIG.gameAccuracyWeightMax, stdDev(w))),
  );

  // Accuracy reuses the ALREADY-COMPUTED winPercentLoss from classifyMove —
  // the pure Lichess before/after swing (never zeroed for top moves; see
  // classifyMove's doc comment). We do not recompute anything else here —
  // the weight above is the only thing this function adds.
  return moves.map((m, i) => ({
    ply: m.ply,
    accuracy: computeMoveAccuracy(m.winPercentLoss),
    weight: weights[i] ?? 1,
  }));
}

/**
 * Game-level (or phase-level) accuracy for one side, given the full game's
 * weighted-accuracy series (see buildWeightedAccuracies) filtered down to
 * whatever subset (side, or side+phase) is being scored:
 *
 *   final accuracy = average(volatility-weighted mean, harmonic mean)
 */
function computeGameAccuracy(subset: readonly WeightedMoveAccuracy[]): number {
  if (subset.length === 0) return 0;
  if (subset.length === 1) return subset[0].accuracy;

  const wMean = weightedMean(subset.map((p) => ({ value: p.accuracy, weight: p.weight })));
  const hMean = harmonicMean(subset.map((p) => p.accuracy));
  return (wMean + hMean) / 2;
}

// ─── Side stats ───────────────────────────────────────────────────────────────

/**
 * Compute accuracy, ACPL, performance estimate, and move counts for one side.
 *
 * PRECONDITION: every MoveReview already has its final phase assigned.
 * ACPL (Average Centipawn Loss) is the traditional cp-denominated stat,
 * computed over all moves including book moves (book cpLoss = 0).
 * Accuracy is win%-loss based (see computeMoveAccuracy / computeGameAccuracy)
 * and is a SEPARATE, not-double-counted metric from ACPL.
 */
export function computeSideStats(
  moves: readonly MoveReview[],
  side: "white" | "black",
): ReviewSideStats {
  const sideMoves = moves.filter((m) =>
    side === "white" ? m.ply % 2 === 1 : m.ply % 2 === 0,
  );

  const counts: Record<MoveClassification, number> = {
    book: 0, brilliant: 0, great: 0, missedWin: 0, best: 0, excellent: 0,
    good: 0, inaccuracy: 0, mistake: 0, blunder: 0,
  };
  for (const m of sideMoves) counts[m.classification]++;

  const acpl =
    sideMoves.length > 0
      ? sideMoves.reduce((s, m) => s + m.cpLoss, 0) / sideMoves.length
      : 0;

  // Built once from the FULL game (both sides, ply order) — the windowing
  // that produces each move's weight is inherently a whole-game
  // computation, not something that can be derived from one side alone.
  const allWeightedAccuracies = buildWeightedAccuracies(moves);
  const sideWeightedAccuracies = allWeightedAccuracies.filter((wa) =>
    side === "white" ? wa.ply % 2 === 1 : wa.ply % 2 === 0,
  );

  const accuracy = computeGameAccuracy(sideWeightedAccuracies);

  function phaseAccuracy(phase: GamePhase): number | null {
    const plySet = new Set(sideMoves.filter((m) => m.phase === phase).map((m) => m.ply));
    if (plySet.size === 0) return null;
    return computeGameAccuracy(sideWeightedAccuracies.filter((wa) => plySet.has(wa.ply)));
  }

  return {
    accuracy,
    acpl: Math.round(acpl),
    estimatedPerformance: estimatePerformance(accuracy, sideMoves.length),
    openingAccuracy: phaseAccuracy("opening"),
    middlegameAccuracy: phaseAccuracy("middlegame"),
    endgameAccuracy: phaseAccuracy("endgame"),
    counts: Object.freeze(counts),
  };
}

// ─── Annotated PGN builder ────────────────────────────────────────────────────

export function buildAnnotatedPgn(
  originalHeaders: Record<string, string>,
  moves: readonly MoveReview[],
  depth: number,
): string {
  const NAG: Partial<Record<MoveClassification, string>> = {
    brilliant: "$3",
    great: "$1",
    best: "$1",
    inaccuracy: "$6",
    mistake: "$4",
    blunder: "$2",
    missedWin: "$4",
  };

  const LABEL: Record<MoveClassification, string> = {
    book: "Book",
    brilliant: "Brilliant",
    great: "Great",
    best: "Best",
    excellent: "Excellent",
    good: "Good",
    inaccuracy: "Inaccuracy",
    mistake: "Mistake",
    blunder: "Blunder",
    missedWin: "Missed win",
  };

  function formatEval(ev: number | null, mate: number | null): string {
    if (mate !== null) return `#${mate}`;
    if (ev === null) return "?";
    return (ev / 100).toFixed(2);
  }

  const headers = {
    ...originalHeaders,
    VoxReviewDepth: String(depth),
    VoxReviewVersion: String(CURRENT_REVIEW_VERSION),
    VoxReviewMoveCount: String(moves.length),
  };

  const headerStr = Object.entries(headers)
    .map(([k, v]) => `[${k} "${v}"]`)
    .join("\n");

  const tokens: string[] = [];

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const moveNum = Math.floor(i / 2) + 1;

    if (i % 2 === 0) tokens.push(`${moveNum}.`);
    else if (i === 1) tokens.push(`${moveNum}...`);

    tokens.push(m.san);

    const nag = NAG[m.classification];
    if (nag) tokens.push(nag);

    const evalStr = formatEval(m.evalAfter, m.mateAfter);
    // [%wpl] persists winPercentLoss so it survives a reload — without this,
    // parseMoveAnnotation has no way to recover it and accuracy silently
    // defaults to 0-loss (100%) for every move on every reopen.
    let comment = `[%eval ${evalStr}] [%wpl ${m.winPercentLoss.toFixed(2)}] ${LABEL[m.classification]}`;

    const needsBestMove =
      m.classification !== "book" &&
      m.classification !== "best" &&
      m.classification !== "brilliant" &&
      m.bestMoveSan &&
      m.bestMoveSan !== m.san;

    if (needsBestMove) {
      const bestEvalStr = formatEval(m.bestMoveEval, m.bestMoveMate);
      comment += `. Engine preferred ${m.bestMoveSan} (${bestEvalStr})`;
    }

    tokens.push(`{ ${comment} }`);
  }

  tokens.push(originalHeaders["Result"] ?? "*");

  return `${headerStr}\n\n${tokens.join(" ")}`;
}

// ─── ReviewModel builder ──────────────────────────────────────────────────────

/**
 * Pure transformation: takes classified moves (without phases) and produces
 * a fully immutable ReviewModel. Does not mutate the input array.
 *
 * The route is responsible for:
 *   - driving the Stockfish evaluation pass
 *   - constructing each MoveReview (without phase)
 *   - calling buildReviewModel once the full array is ready
 */
export function buildReviewModel(params: {
  depth: number;
  moves: readonly Omit<MoveReview, "phase">[];
  opening: string;
  eco: string;
  lastBookPly: number;
}): ReviewModel {
  const { depth, moves, opening, eco, lastBookPly } = params;

  const openingEndPly = resolveOpeningEndPly(lastBookPly);
  const materialHistory = buildMaterialHistory(moves.map((m) => m.fenAfter));
  const { phases, endgameStartPly } = determineGamePhases(
    materialHistory,
    openingEndPly,
  );

  // Produce a new array with phases stamped in — input array untouched
  const phasedMoves: MoveReview[] = moves.map((m, i) => ({
    ...m,
    phase: phases[i],
  }));

  const white = computeSideStats(phasedMoves, "white");
  const black = computeSideStats(phasedMoves, "black");

  return Object.freeze({
    version: CURRENT_REVIEW_VERSION,
    depth,
    moves: Object.freeze(phasedMoves),
    white,
    black,
    opening,
    eco,
    lastBookPly,
    openingEndPly,
    endgameStartPly,
  });
}

// ─── PGN annotation parser ────────────────────────────────────────────────────

export type ParsedMoveAnnotation = {
  eval: number | null;
  mate: number | null;
  winPercentLoss: number;
  classification: MoveClassification | null;
  nag: string | null;
  bestMoveSan: string | null;
  bestMoveEval: number | null;
  bestMoveMate: number | null;
};

export function parseMoveAnnotation(
  comment: string,
  nagStr: string | null,
): ParsedMoveAnnotation {
  let eval_: number | null = null;
  let mate: number | null = null;
  let winPercentLoss = 0;
  let bestMoveSan: string | null = null;
  let bestMoveEval: number | null = null;
  let bestMoveMate: number | null = null;
  let classification: MoveClassification | null = null;

  const evalMatch = comment.match(/\[%eval\s+([^\]]+)\]/);
  if (evalMatch) {
    const raw = evalMatch[1].trim();
    if (raw.startsWith("#")) {
      mate = parseInt(raw.slice(1), 10);
    } else {
      eval_ = Math.round(parseFloat(raw) * 100);
    }
  }

  const wplMatch = comment.match(/\[%wpl\s+([^\]]+)\]/);
  if (wplMatch) {
    const parsed = parseFloat(wplMatch[1]);
    if (!Number.isNaN(parsed)) winPercentLoss = parsed;
  }

  const LABEL_MAP: Record<string, MoveClassification> = {
    "Book": "book",
    "Brilliant": "brilliant",
    "Great": "great",
    "Best": "best",
    "Excellent": "excellent",
    "Good": "good",
    "Inaccuracy": "inaccuracy",
    "Mistake": "mistake",
    "Missed win": "missedWin",
    "Blunder": "blunder",
  };

  for (const [label, cls] of Object.entries(LABEL_MAP)) {
    if (comment.includes(label)) {
      classification = cls;
      break;
    }
  }

  // Backwards compatible: matches both "Engine preferred" and "Best was"
  const bestMatch = comment.match(
    /(?:Engine preferred|Best was)\s+(\S+)\s+\(([^)]+)\)/,
  );
  if (bestMatch) {
    bestMoveSan = bestMatch[1];
    const raw = bestMatch[2];
    if (raw.startsWith("#")) {
      bestMoveMate = parseInt(raw.slice(1), 10);
    } else {
      bestMoveEval = Math.round(parseFloat(raw) * 100);
    }
  }

  return {
    eval: eval_, mate, winPercentLoss, classification, nag: nagStr,
    bestMoveSan, bestMoveEval, bestMoveMate,
  };
}

// ─── Version helpers ──────────────────────────────────────────────────────────

export function getReviewVersion(pgn: string): number | null {
  const match = pgn.match(/\[VoxReviewVersion\s+"(\d+)"\]/);
  return match ? parseInt(match[1], 10) : null;
}

export function getReviewDepth(pgn: string): number | null {
  const match = pgn.match(/\[VoxReviewDepth\s+"(\d+)"\]/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Returns true if the PGN has no version header (unknown format)
 * or has a version older than CURRENT_REVIEW_VERSION.
 * Unknown versions are treated as needing upgrade.
 */
export function reviewNeedsUpgrade(pgn: string): boolean {
  const version = getReviewVersion(pgn);
  if (version === null) return true;
  return version < CURRENT_REVIEW_VERSION;
}