// src/lib/chess/rollAdjustedQuality.ts
//
// Orchestration glue between PositionCharacterization.ts, adjustWeights.ts,
// and rollQuality (botMoveSelection.ts). Deliberately its own module, not
// inlined in useBotMove.ts, for the same reason resolveAgainstRealism.ts
// is its own module: it's pure (modulo rollQuality's own use of
// Math.random()), has no React dependency, and pulling it out means the
// hook and its tests share exactly one implementation instead of two
// copies risking drift.
//
// This is the ONLY place that composes all three position-characterization
// modules together. Each of them stays independently testable and
// independently reusable — botMoveSelection.ts's rollQuality doesn't know
// PositionCharacterization exists, and PositionCharacterization doesn't
// know rollQuality exists. This function is where they meet, and nowhere
// else.

import { characterizePosition } from "./positionCharacterization";
import { adjustWeights } from "./adjustWeights";
import { rollQuality, type PvCandidate } from "./botMoveSelection";
import type { MoveQuality } from "./evaluation";

/**
 * Characterizes the position at `rootFen` (given the engine's MultiPV
 * output), adjusts `baseWeights` accordingly, and rolls a quality tier
 * from the adjusted distribution.
 *
 * `bestMoves` must be the actual MultiPV candidates — this is why the
 * roll can no longer happen before the engine search returns (see
 * useBotMove.ts's requestBotMove/effect split): characterization needs
 * PV1 and PV2 to exist, so this function can only run once evaluation
 * results are in hand, not at move-request time the way the original
 * (pre-characterization) rollQuality(config.qualityWeights) call did.
 */
export function rollAdjustedQuality(
  rootFen: string,
  bestMoves: readonly PvCandidate[],
  baseWeights: Record<MoveQuality, number>,
): MoveQuality {
  const character = characterizePosition(rootFen, bestMoves);
const adjusted = adjustWeights(baseWeights, character);
const quality = rollQuality(adjusted);

console.group("🎯 Bot Position Characterization");
console.log("Character:", character);
console.log("FEN:", rootFen);
console.log("Base Weights:", baseWeights);
console.log("Adjusted Weights:", adjusted);
console.log("Rolled Quality:", quality);
console.log(
  "Candidates:",
  bestMoves.map((m, i) => ({
    pv: i + 1,
    move: m.move,
    score: m.score,
    mate: m.mate,
  })),
);
console.groupEnd();

return quality;
}