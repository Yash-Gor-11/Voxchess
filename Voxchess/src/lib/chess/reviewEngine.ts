// src/lib/chess/reviewEngine.ts

import { REVIEW_CONFIG, CURRENT_REVIEW_VERSION } from "./reviewConstants";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MoveClassification =
  | "book"
  | "brilliant"
  | "great"
  | "best"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "missedWin";

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
  readonly cpLoss: number;            // >= 0, side-to-move perspective
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
  readonly counts: Readonly<Record<MoveClassification, number>>;
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
    [99,  3050],
    [97,  2900],
    [95,  2700],
    [92,  2500],
    [89,  2300],
    [85,  2100],
    [80,  1900],
    [75,  1700],
    [69,  1500],
    [62,  1300],
    [55,  1100],
    [0,    800],
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

// ─── Move accuracy ────────────────────────────────────────────────────────────

/** Chess.com accuracy formula. Returns a value in [0, 100]. */
export function computeMoveAccuracy(cpLoss: number): number {
  const raw = 103.1668 * Math.exp(-0.04354 * cpLoss) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

// ─── Performance estimate ─────────────────────────────────────────────────────

/** Map overall accuracy to a platform performance rating via linear interpolation. */
export function estimatePerformance(accuracy: number): number {
  for (let i = 0; i < PERFORMANCE_TABLE.length - 1; i++) {
    const [hiAcc, hiRating] = PERFORMANCE_TABLE[i];
    const [loAcc, loRating] = PERFORMANCE_TABLE[i + 1];
    if (accuracy >= loAcc) {
      const t = (accuracy - loAcc) / (hiAcc - loAcc);
      return Math.round(loRating + t * (hiRating - loRating));
    }
  }
  return PERFORMANCE_TABLE[PERFORMANCE_TABLE.length - 1][1];
}

// ─── Opening boundary ─────────────────────────────────────────────────────────

/**
 * Resolve the opening end ply from the last book ply.
 * Returns -1 if no book moves were detected.
 */
export function resolveOpeningEndPly(lastBookPly: number): number {
  // openingPlyCap is gone; the last book ply IS the opening boundary.
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

export function classifyMove(params: {
  uci: string;
  bestMove: string;           // UCI
  evalBefore: number | null;  // centipawns, side-to-move perspective
  evalAfter: number | null;   // centipawns, side-to-move perspective
  bestMoveEval: number | null;
  mateBefore: number | null;
  mateAfter: number | null;
  materialBefore: MaterialCount;
  materialAfter: MaterialCount;
  sideToMove: "w" | "b";
  isBook: boolean;
}): { classification: MoveClassification; cpLoss: number } {
  const {
    uci, bestMove,
    evalBefore, evalAfter, bestMoveEval,
    mateBefore, mateAfter,
    materialBefore, materialAfter,
    sideToMove, isBook,
  } = params;

  if (isBook) return { classification: "book", cpLoss: 0 };

  // Missed forced mate: had a forced mate, didn't convert it
  if (mateBefore !== null && mateBefore > 0 && mateAfter === null) {
  return { classification: "missedWin", cpLoss: REVIEW_CONFIG.missedWinCpLoss };
}

  const eval_ = evalAfter ?? 0;
  const best_ = bestMoveEval ?? 0;
  const cpLoss = Math.max(0, best_ - eval_);
  const isTopMove = uci === bestMove;

  if (isTopMove) {
    const ownBefore = sideToMove === "w" ? materialBefore.white : materialBefore.black;
    const ownAfter  = sideToMove === "w" ? materialAfter.white  : materialAfter.black;
    const isSacrifice = ownAfter < ownBefore;
    const evalGain = eval_ - (evalBefore ?? 0);

    if (isSacrifice && evalGain >= REVIEW_CONFIG.thresholds.brilliantEvalGain) {
      return { classification: "brilliant", cpLoss: 0 };
    }
    if (evalGain >= REVIEW_CONFIG.thresholds.greatEvalGain) {
      return { classification: "great", cpLoss: 0 };
    }
    return { classification: "best", cpLoss: 0 };
  }

  // classifyMove thresholds
if (cpLoss <= REVIEW_CONFIG.thresholds.good)       return { classification: "good",       cpLoss };
if (cpLoss <= REVIEW_CONFIG.thresholds.inaccuracy) return { classification: "inaccuracy", cpLoss };
if (cpLoss <= REVIEW_CONFIG.thresholds.mistake)    return { classification: "mistake",    cpLoss };
  return { classification: "blunder", cpLoss };
}

// ─── Side stats ───────────────────────────────────────────────────────────────

/**
 * Compute accuracy, ACPL, performance estimate, and move counts for one side.
 *
 * PRECONDITION: every MoveReview already has its final phase assigned.
 * ACPL is computed over all moves including book moves (book cpLoss = 0).
 * Accuracy is computed over all moves including book moves.
 */
export function computeSideStats(
  moves: readonly MoveReview[],
  side: "white" | "black",
): ReviewSideStats {
  const sideMoves = moves.filter((m) =>
    side === "white" ? m.ply % 2 === 1 : m.ply % 2 === 0,
  );

  const counts: Record<MoveClassification, number> = {
    book: 0, brilliant: 0, great: 0, best: 0, good: 0,
    inaccuracy: 0, mistake: 0, blunder: 0, missedWin: 0,
  };
  for (const m of sideMoves) counts[m.classification]++;

  const acpl =
    sideMoves.length > 0
      ? sideMoves.reduce((s, m) => s + m.cpLoss, 0) / sideMoves.length
      : 0;

  const accuracy =
    sideMoves.length > 0
      ? sideMoves.reduce((s, m) => s + computeMoveAccuracy(m.cpLoss), 0) /
        sideMoves.length
      : 0;

  function phaseAccuracy(phase: GamePhase): number | null {
    const pm = sideMoves.filter((m) => m.phase === phase);
    if (pm.length === 0) return null;
    return pm.reduce((s, m) => s + computeMoveAccuracy(m.cpLoss), 0) / pm.length;
  }

  return {
    accuracy,
    acpl: Math.round(acpl),
    estimatedPerformance: estimatePerformance(accuracy),
    openingAccuracy:     phaseAccuracy("opening"),
    middlegameAccuracy:  phaseAccuracy("middlegame"),
    endgameAccuracy:     phaseAccuracy("endgame"),
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
    great:     "$1",
    best:      "$1",
    inaccuracy:"$6",
    mistake:   "$4",
    blunder:   "$2",
    missedWin: "$4",
  };

  const LABEL: Record<MoveClassification, string> = {
    book:      "Book",
    brilliant: "Brilliant",
    great:     "Great",
    best:      "Best",
    good:      "Good",
    inaccuracy:"Inaccuracy",
    mistake:   "Mistake",
    blunder:   "Blunder",
    missedWin: "Missed win",
  };

  function formatEval(ev: number | null, mate: number | null): string {
    if (mate !== null) return `#${mate}`;
    if (ev === null) return "?";
    return (ev / 100).toFixed(2);
  }
  
  const headers = {
    ...originalHeaders,
    VoxReviewDepth:   String(depth),
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
    let comment = `[%eval ${evalStr}] ${LABEL[m.classification]}`;

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
 *   - driving the Stockfish queue
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
  eval:           number | null;
  mate:           number | null;
  classification: MoveClassification | null;
  nag:            string | null;
  bestMoveSan:    string | null;
  bestMoveEval:   number | null;
  bestMoveMate:   number | null;
};

export function parseMoveAnnotation(
  comment: string,
  nagStr: string | null,
): ParsedMoveAnnotation {
  let eval_: number | null = null;
  let mate: number | null = null;
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

  const LABEL_MAP: Record<string, MoveClassification> = {
    "Book":       "book",
    "Brilliant":  "brilliant",
    "Great":      "great",
    "Best":       "best",
    "Good":       "good",
    "Inaccuracy": "inaccuracy",
    "Mistake":    "mistake",
    "Missed win": "missedWin",
    "Blunder":    "blunder",
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
    eval: eval_, mate, classification, nag: nagStr,
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