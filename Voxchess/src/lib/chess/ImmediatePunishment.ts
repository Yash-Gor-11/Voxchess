// ImmediatePunishment.ts
//
// Realism policy layer sitting between candidate selection and
// commitment in the bot's move pipeline. Owns all chess-specific
// realism logic (FEN derivation, the board-wide SEE scan, mate-distance
// checks, rating-banded thresholds, logging) so that useBotMove.ts stays
// a thin orchestrator and never needs to know how any of this works.
//
// Scope, deliberately bounded (see conversation history for the full
// design discussion):
//   - Quality weights still determine HOW OFTEN the bot makes mistakes.
//     This module only decides WHICH mistakes are believable enough to
//     play, by rejecting immediate, deterministic tactical oversights.
//   - Two independent signals: SEE-based immediate material loss, and
//     short forced mates. Both are rating-banded, and deliberately NOT
//     derived from EloConfig.cpTolerance — survival-mode defensive
//     precision and tactical-oversight realism are unrelated axes and
//     must stay independently tunable.
//   - No engine re-search. The expensive work (generating the MultiPV
//     candidate pool) has already happened; this module only reads
//     `candidate.mate` (already computed by that same search) and runs
//     SEE (a static, engine-free computation) on the resulting position.
//     That keeps `check()` fully synchronous — no new async phase in
//     useBotMove's state machine.
//   - Deeper tactics (forks, skewers, discovered attacks, multi-move
//     combinations) are explicitly OUT of scope for v1. Those require
//     genuine calculation and are exactly the kind of mistake real
//     humans at every rating still make. If self-play logging later
//     shows a specific gap (see the `logging` config below), the right
//     response is one more narrow, deterministic, engine-native
//     primitive added the same way SEE was — not a growing pile of
//     pattern detectors.
//
// This module does NOT own the reject → fallback → recheck loop.
// That's orchestration and belongs in useBotMove.ts, which calls
// resolveUpwardFallback() (botMoveSelection.ts) and check() (here) in
// alternation. This module only answers, for one specific candidate:
// "is this believable for this rating, and why or why not."

import { Chess, type PieceSymbol, type Square } from "chess.js";
import { see } from "./see/see";
import type { PvCandidate } from "./botMoveSelection";

// --- Rating-banded thresholds -----------------------------------------
//
// Deliberately independent of EloConfig.cpTolerance (survival-mode
// defensive precision) — these answer "would a human of this rating
// notice and avoid this specific oversight," not "how close to best
// defense should a losing bot stay." Starting bands below are informed
// estimates, not measured; per the design's own philosophy, the right
// way to refine them is self-play logging (see ImmediatePunishmentConfig
// below), not more armchair tuning.

/**
 * SEE-loss threshold in centipawn-equivalent units (see.ts's netMaterial
 * is in abstract piece-value units — 1/3/3/5/9 — scaled by
 * MATERIAL_TO_CENTIPAWN below to stay in the same rough units as the
 * rest of EloConfig, e.g. cpTolerance). Below the threshold, an
 * immediate material loss is treated as an authentic human-level slip
 * and left alone; at or above it, it's rejected as an obvious oversight
 * this rating wouldn't realistically miss.
 */
export function seeThresholdForElo(elo: number): number {
  if (elo <= 700) return Infinity; // filter disabled — beginners authentically hang pieces
  if (elo <= 1200) return 900; // only catastrophic (queen-level) losses
  if (elo <= 1700) return 500; // queen/rook hangs, obvious recapture failures
  if (elo <= 2200) return 300; // minor-piece-or-worse obvious losses
  return 100; // 2300+: essentially any positive obvious material loss
}

/**
 * Mate-in-N threshold, in the same "N" units as PvCandidate.mate.
 * Candidates where the mover gets mated within this many moves are
 * rejected as short forced mates a bot of this rating shouldn't
 * voluntarily walk into.
 */
export function mateThresholdForElo(elo: number): number {
  if (elo <= 800) return 0; // no mate filtering at all
  if (elo <= 1300) return 1; // filter only mate-in-1
  if (elo <= 2000) return 2; // filter mate-in-1 and mate-in-2
  return 3; // 2100+: filter mate-in-1 through mate-in-3
}

/**
 * see()'s netMaterial is in abstract piece-value units (pawn=1 ...
 * queen=9), not real centipawns — this is a rough scaling to keep
 * seeThresholdForElo's numbers in the same order of magnitude as the
 * rest of EloConfig (which is genuinely centipawn-based, e.g.
 * cpTolerance). This is an approximation, not a claim that piece values
 * translate precisely to centipawns.
 */
const MATERIAL_TO_CENTIPAWN = 100;

// --- Config -------------------------------------------------------------

export interface ImmediatePunishmentConfig {
  /** Emit a structured RealismDecision (via onDecision) for every
   * check() call, accepted or rejected — not just rejections. This is
   * what makes self-play logging able to answer "is SEE filtering too
   * aggressively," "which ratings reject the most moves," etc. */
  logging: boolean;
  enableMateFilter: boolean;
  enableSeeFilter: boolean;
  /** Called once per check() when logging is true. Kept as an injected
   * callback rather than a hardcoded console.log so callers can route
   * this to whatever self-play data pipeline they're using. */
  onDecision?: (decision: RealismDecision) => void;
}

export const DEFAULT_IMMEDIATE_PUNISHMENT_CONFIG: ImmediatePunishmentConfig = {
  logging: false,
  enableMateFilter: true,
  enableSeeFilter: true,
};

// --- Decision shape -------------------------------------------------------

export interface RealismDecision {
  readonly accepted: boolean;
  readonly reason: "mate" | "see" | "none";
  readonly elo: number;
  readonly move: string;
  readonly mateDistance?: number;
  readonly mateThreshold?: number;
  readonly seeLossCentipawns?: number;
  readonly seeThreshold?: number;
}

// --- UCI parsing ----------------------------------------------------------

/**
 * PvCandidate.move is UCI ("e2e4", or "e7e8q" for a promotion) — four
 * characters, or five with a lowercase promotion letter appended.
 */
function parseUciMove(uci: string): { from: Square; to: Square; promotion?: PieceSymbol } {
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const promotion = uci.length > 4 ? (uci.slice(4, 5) as PieceSymbol) : undefined;
  return { from, to, promotion };
}

// --- Board-wide SEE scan ---------------------------------------------------

/**
 * The worst (from the mover's perspective) SEE outcome among the
 * opponent's legal captures in `fen`, optionally excluding one square.
 * "Worst" here means the largest netMaterial in the opponent's favor —
 * see() is computed from the capturing side's perspective, so a large
 * positive value is bad for whoever just moved into this position.
 *
 * `excludeSquare` exists so computeImmediateMaterialRisk (below) can
 * scan for hanging material on squares OTHER than the one the candidate
 * move itself just captured on — that square's exchange is handled
 * directly via see() on the root move instead, since see() already nets
 * the mover's own gain against the opponent's best reply, including
 * proper stand-pat if recapturing wouldn't actually be worth it for the
 * opponent. Re-deriving that same square via an isolated board scan
 * would double-count the mover's own capture as if it hadn't happened —
 * see computeImmediateMaterialRisk's doc comment for a concrete case
 * where that goes wrong (a fair recapture registers as "the opponent
 * nets a whole pawn" in isolation, when combined with the mover's own
 * capture the trade is actually even).
 *
 * Returns 0 if the opponent has no qualifying legal captures at all.
 */
function boardWideWorstSee(fen: string, excludeSquare: Square | null): number {
  const chess = new Chess(fen);
  const captures = chess
    .moves({ verbose: true })
    .filter((m) => (m.isCapture() || m.isEnPassant()) && m.to !== excludeSquare);

  if (captures.length === 0) return 0;

  let worst = -Infinity;
  for (const capture of captures) {
    const result = see(fen, { from: capture.from, to: capture.to, promotion: capture.promotion });
    if (result.netMaterial > worst) worst = result.netMaterial;
  }
  return worst;
}

/**
 * Computes the worst immediate tactical punishment available to the
 * opponent after playing `uciMove` from `rootFen`, in
 * centipawn-equivalent units. This combines two components — it's
 * policy (what counts as "the risk of this move"), not a raw SEE
 * reading, which is why it isn't just called computeSeeLoss:
 *
 *   - If the candidate move is itself a capture: see() called directly
 *     on the root move, which correctly nets the mover's own gain
 *     against the opponent's best reply (and any further continuation),
 *     including declining a bad recapture via stand-pat. This is NOT
 *     re-derived via a board scan on the resulting position, because
 *     that would double-count the mover's own capture. Concretely: a
 *     pawn takes a pawn defended by another pawn is a fair, even trade
 *     (net 0) — but scanning the resulting position in isolation and
 *     asking "what's the opponent's best capture" would report the
 *     recapture as the opponent winning a whole pawn, since it doesn't
 *     know the mover already justly captured one first. see() already
 *     nets this correctly via its own gain-minus-continuation structure.
 *   - A board-wide scan of the resulting position for hanging material
 *     on every OTHER square — this is what catches "ignored a hanging
 *     piece elsewhere on the board," a case that has nothing to do with
 *     whatever the candidate move itself captured (or didn't).
 *
 * Combined by taking whichever of the two is worse for the mover.
 *
 * Throws if `uciMove` isn't actually legal in `rootFen`.
 */
function computeImmediateMaterialRisk(rootFen: string, uciMove: string): number {
  const chess = new Chess(rootFen);
  const { from, to, promotion } = parseUciMove(uciMove);
  const moveInfo = chess
    .moves({ verbose: true })
    .find((m) => m.from === from && m.to === to && (promotion == null || m.promotion === promotion));
  if (!moveInfo) {
    throw new Error(`ImmediatePunishment: ${uciMove} is not a legal move in position ${rootFen}`);
  }

  const isCapture = moveInfo.isCapture() || moveInfo.isEnPassant();

  let sameSquareLoss = 0;
  if (isCapture) {
    const result = see(rootFen, { from, to, promotion });
    sameSquareLoss = Math.max(0, -result.netMaterial);
  }

  chess.move({ from, to, promotion });
  const resultingFen = chess.fen();
  const excludeSquare = isCapture ? to : null;
  const otherSquaresLoss = Math.max(0, boardWideWorstSee(resultingFen, excludeSquare));

  return Math.max(sameSquareLoss, otherSquaresLoss) * MATERIAL_TO_CENTIPAWN;
}

// --- The check --------------------------------------------------------

/**
 * Whether `candidate.mate` indicates the MOVER (whoever is to move in
 * `rootFen`, about to play this candidate) ends up on the losing end of
 * a forced mate.
 *
 * candidate.mate is NOT mover-relative — per stockfish.ts's
 * publishEval(), every reported score/mate gets multiplied by
 * `activeSide` (-1 when the root position has Black to move), which
 * converts UCI's native mover-relative sign into a WHITE-ABSOLUTE one
 * (positive always favors White, regardless of whose turn it is). That
 * means "the mover gets mated" corresponds to a NEGATIVE candidate.mate
 * when White is to move, but a POSITIVE candidate.mate when Black is to
 * move — a naive `candidate.mate < 0` check is only correct for half of
 * all positions. This function reads the side to move directly from
 * `rootFen` so callers never have to reason about the sign convention
 * themselves.
 */
function moverGetsMated(rootFen: string, mate: number): boolean {
  const sideToMove = rootFen.split(" ")[1];
  return sideToMove === "w" ? mate < 0 : mate > 0;
}

/**
 * Decides whether `candidate` is a believable move for a bot rated
 * `elo`, given the position it would be played from (`rootFen`).
 *
 * Two independent, rating-banded checks, either of which can reject:
 *   - Mate: candidate.mate indicates the mover gets forced-mated within
 *     mateThresholdForElo(elo) moves.
 *   - Material: the worst board-wide SEE outcome available to the
 *     opponent, in the position resulting from this candidate, is at or
 *     above seeThresholdForElo(elo).
 *
 * Fully synchronous — no engine calls. candidate.mate is read from data
 * the MultiPV search already produced; SEE is a static computation on
 * chess.js's own move generator. Never mutates rootFen.
 */
export function check(
  rootFen: string,
  candidate: PvCandidate,
  elo: number,
  config: ImmediatePunishmentConfig = DEFAULT_IMMEDIATE_PUNISHMENT_CONFIG,
): RealismDecision {
  const emit = (decision: RealismDecision): RealismDecision => {
    if (config.logging) config.onDecision?.(decision);
    return decision;
  };

  // Mate check first — a short forced mate is a strictly more severe
  // outcome than any material loss, and checking it doesn't require
  // deriving the resulting position at all (candidate.mate is already
  // known), so it's the cheaper check to run first.
  if (config.enableMateFilter && candidate.mate != null && moverGetsMated(rootFen, candidate.mate)) {
    const mateDistance = Math.abs(candidate.mate);
    const mateThreshold = mateThresholdForElo(elo);
    if (mateDistance <= mateThreshold) {
      return emit({
        accepted: false,
        reason: "mate",
        elo,
        move: candidate.move,
        mateDistance,
        mateThreshold,
      });
    }
  }

  if (config.enableSeeFilter) {
    const seeLossCentipawns = computeImmediateMaterialRisk(rootFen, candidate.move);
    const seeThreshold = seeThresholdForElo(elo);
    if (seeLossCentipawns >= seeThreshold) {
      return emit({
        accepted: false,
        reason: "see",
        elo,
        move: candidate.move,
        seeLossCentipawns,
        seeThreshold,
      });
    }
  }

  return emit({ accepted: true, reason: "none", elo, move: candidate.move });
}