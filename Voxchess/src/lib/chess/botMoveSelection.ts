// src/lib/chess/botMoveSelection.ts
//
// Pure move-quality classification and selection logic for the bot's
// human-error model. No Stockfish, chess.js, EloConfig, or async/I-O —
// only bare candidate arrays and weights in, a chosen candidate out.

import { classifyWinLoss, evalToWinPercent, type MoveQuality } from "./evaluation";

export interface PvCandidate {
  readonly move: string;
  readonly score: number;
  readonly mate: number | null;
}

export interface ClassifiedCandidate {
  readonly pv: PvCandidate;
  readonly quality: MoveQuality;
}

export const MOVE_QUALITY_ASCENDING: readonly MoveQuality[] = [
  "blunder",
  "mistake",
  "inaccuracy",
  "good",
  "excellent",
  "best",
];

export const INITIAL_MULTI_PV = 3;
export const EXPANDED_MULTI_PV = 8;

function classifyPv(pv: PvCandidate, pvIndex: number, bestWinPercent: number): MoveQuality {
  if (pvIndex === 0) return "best";
  const pvWinPercent = evalToWinPercent(pv.score, pv.mate);
  const winLossVsBest = Math.max(0, bestWinPercent - pvWinPercent);
  return classifyWinLoss(winLossVsBest);
}

export function classifyCandidates(candidates: readonly PvCandidate[]): ClassifiedCandidate[] {
  if (candidates.length === 0) return [];
  const bestWinPercent = evalToWinPercent(candidates[0].score, candidates[0].mate);
  return candidates.map((pv, i) => ({ pv, quality: classifyPv(pv, i, bestWinPercent) }));
}

export function rollQuality(weights: Record<MoveQuality, number>): MoveQuality {
  const total = MOVE_QUALITY_ASCENDING.reduce((sum, q) => sum + weights[q], 0);
  if (total <= 0) return "best";

  let roll = Math.random() * total;
  for (const quality of MOVE_QUALITY_ASCENDING) {
    roll -= weights[quality];
    if (roll <= 0) return quality;
  }
  return "best";
}

export function pickExactQuality(
  classified: readonly ClassifiedCandidate[],
  quality: MoveQuality,
): PvCandidate | null {
  const pool = classified.filter((c) => c.quality === quality);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)].pv;
}

export function resolveUpwardFallback(
  classified: readonly ClassifiedCandidate[],
  desired: MoveQuality,
): PvCandidate {
  const startRung = MOVE_QUALITY_ASCENDING.indexOf(desired);
  for (let rung = startRung; rung < MOVE_QUALITY_ASCENDING.length; rung++) {
    const match = pickExactQuality(classified, MOVE_QUALITY_ASCENDING[rung]);
    if (match) return match;
  }
  if (classified.length === 0) throw new Error("resolveUpwardFallback: empty candidate pool");
  return classified[0].pv;
}

export function selectMoveByQuality(
  candidates: readonly PvCandidate[],
  qualityWeights: Record<MoveQuality, number>,
): PvCandidate {
  if (candidates.length === 0) throw new Error("selectMoveByQuality: candidates must not be empty");
  if (candidates.length === 1) return candidates[0];

  const classified = classifyCandidates(candidates);
  const desired = rollQuality(qualityWeights);
  return resolveUpwardFallback(classified, desired);
}