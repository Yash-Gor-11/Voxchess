// src/lib/chess/PositionCharacterization.ts
//
// Describes what KIND of position this is — not what quality of move
// should be played, and not whether a specific candidate is believable.
// That separation is deliberate:
//
//   PositionCharacterization.ts  -> "what kind of position is this?"
//   adjustWeights.ts             -> "how should that influence the roll?"
//   ImmediatePunishment.ts       -> "is this specific candidate believable?"
//
// No dependency on ImmediatePunishment.ts or see.ts, even indirectly —
// hanging material is intentionally excluded from characterization for
// v1. Not because it isn't a genuine property of the position (it is),
// but because computing it correctly requires a board-wide capture/SEE
// pass, which is real complexity this deliberately lightweight,
// coarse-grained pass is meant to avoid. Position characterization
// trades precision for cheapness; richer tactical analysis already
// exists elsewhere in the architecture (see.ts, ImmediatePunishment.ts)
// and isn't duplicated here.
//
// Exactly one chess.js replay: PV1's move is played on a cloned board
// to answer isCapture/isEnPassant/isPromotion/isCheck from a single
// consistent source, rather than partly parsing the UCI string and
// partly inspecting the board.

import { Chess, type PieceSymbol, type Square } from "chess.js";
import { evalToWinPercent, classifyWinLoss } from "./evaluation";
import type { PvCandidate } from "./botMoveSelection";
import type { PositionCharacter } from "./positionCharacter";

/**
 * Duplicated from ImmediatePunishment.ts rather than imported from it —
 * deliberate. Position characterization must not depend on
 * ImmediatePunishment (or vice versa); each answers a different
 * question and neither should need the other to exist. A four-line UCI
 * parser is cheap enough to duplicate to preserve that independence.
 */
function parseUciMove(uci: string): { from: Square; to: Square; promotion?: PieceSymbol } {
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const promotion = uci.length > 4 ? (uci.slice(4, 5) as PieceSymbol) : undefined;
  return { from, to, promotion };
}

/**
 * True if PV1 (the engine's top choice) is a capture, en passant,
 * promotion, or delivers check — or if a mate score is already present.
 * All observable chess facts about the best move itself, not about
 * whether any candidate is good or bad.
 *
 * Known v1 imprecision: "PV1 is a capture" will also fire on routine,
 * tactically quiet recaptures/trades. This may tag more positions
 * "tactical" than a human would consider sharp. Not fixed pre-emptively
 * — first thing to check against self-play logs once this ships (see
 * the "does tactical correlate with elevated Immediate Punishment
 * rejection" question raised earlier in the design discussion).
 */
function isTactical(rootFen: string, pv1: PvCandidate): boolean {
  if (pv1.mate != null) return true;

  const chess = new Chess(rootFen);
  const { from, to, promotion } = parseUciMove(pv1.move);
  const move = chess.moves({ verbose: true }).find(
    (m) => m.from === from && m.to === to && (promotion == null || m.promotion === promotion),
  );
  if (!move) return false; // defensive: PV1 not legal in rootFen shouldn't happen

  if (move.isCapture() || move.isEnPassant() || move.isPromotion()) return true;

  // Play the SAME verbose move object chess.js already gave us, rather
  // than reconstructing {from, to, promotion} from it — one less place
  // for promotion metadata to accidentally get mismatched if chess.js's
  // Move shape ever changes.
  chess.move(move);
  return chess.inCheck();
}

/**
 * True if the SECOND-best candidate (PV2 specifically — not PV3 or
 * beyond) is close enough to PV1 that a human would reasonably consider
 * either move fine. Deliberately reuses classifyWinLoss/evalToWinPercent
 * rather than inventing new centipawn cutoffs, so ambiguity is
 * calibrated against the same "how different are these moves" notion
 * the quality bands already encode: ambiguous exactly when PV2 would
 * itself classify as "excellent" relative to PV1.
 *
 * This intentionally couples ambiguity to classifyWinLoss's CURRENT
 * threshold definitions (in evaluation.ts) — if those thresholds are
 * ever retuned, what counts as "ambiguous" changes right along with
 * them, with no separate cutoff to keep in sync. That's treated as
 * desirable, not just an incidental dependency: it keeps one single
 * definition of "how different is different" across the whole quality
 * pipeline. Worth remembering if evaluation.ts changes substantially,
 * since ambiguity's behavior will shift as a side effect.
 *
 * False when fewer than two candidates exist — no alternative, no
 * ambiguity to speak of.
 */
function isAmbiguous(bestMoves: readonly PvCandidate[]): boolean {
  if (bestMoves.length < 2) return false;

  const bestWinPercent = evalToWinPercent(bestMoves[0].score, bestMoves[0].mate);
  const pv2WinPercent = evalToWinPercent(bestMoves[1].score, bestMoves[1].mate);
  const winLossVsBest = Math.max(0, bestWinPercent - pv2WinPercent);

  return classifyWinLoss(winLossVsBest) === "excellent";
}

/**
 * Characterizes the position at `rootFen` given the engine's MultiPV
 * output (`bestMoves`, PV1-first, same shape botMoveSelection.ts
 * consumes). Returns "normal" if `bestMoves` is empty — nothing to
 * characterize.
 */
export function characterizePosition(
  rootFen: string,
  bestMoves: readonly PvCandidate[],
): PositionCharacter {
  if (bestMoves.length === 0) return "normal";

  const tactical = isTactical(rootFen, bestMoves[0]);
const ambiguous = isAmbiguous(bestMoves);

const chess = new Chess(rootFen);
const { from, to, promotion } = parseUciMove(bestMoves[0].move);
const move = chess.moves({ verbose: true }).find(
  (m) =>
    m.from === from &&
    m.to === to &&
    (promotion == null || m.promotion === promotion),
);

if (move) {
  chess.move(move);
}

console.log("Position Characterization Signals", {
  move: bestMoves[0].move,
  capture: move?.isCapture() ?? false,
  enPassant: move?.isEnPassant() ?? false,
  promotion: move?.isPromotion() ?? false,
  check: move ? chess.inCheck() : false,
  mate: bestMoves[0].mate != null,
  ambiguous,
  tactical,
});

if (tactical && ambiguous) return "both";
if (tactical) return "tactical";
if (ambiguous) return "ambiguous";
return "normal";
}