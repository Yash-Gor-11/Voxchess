import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { rollAdjustedQuality } from "./rollAdjustedQuality";
import type { PvCandidate } from "./botMoveSelection";
import type { MoveQuality } from "./evaluation";

function buildFen(pieces: Record<string, [string, string]>, turn: "w" | "b" = "w"): string {
  const chess = new Chess();
  chess.clear();
  for (const [square, [type, color]] of Object.entries(pieces)) {
    chess.put({ type: type as any, color: color as any }, square as any);
  }
  const parts = chess.fen().split(" ");
  parts[1] = turn;
  parts[2] = "-";
  parts[3] = "-";
  return parts.join(" ");
}

describe("rollAdjustedQuality", () => {
  it("always rolls the single populated bucket on a NORMAL position (adjustWeights is identity there)", () => {
    // Quiet position: PV1 a non-capturing, non-check pawn push, PV2 far
    // worse (big win% gap) -> "normal" character -> adjustWeights is a
    // no-op -> rollQuality against a 100%-best distribution must always
    // return "best", deterministically, regardless of Math.random().
    const rootFen = buildFen({ h1: ["k", "w"], h8: ["k", "b"], e2: ["p", "w"] });
    const bestMoves: PvCandidate[] = [
      { move: "e2e4", score: 30, mate: null },
      { move: "e2e3", score: -400, mate: null },
    ];
    const allBest: Record<MoveQuality, number> = {
      best: 100,
      excellent: 0,
      good: 0,
      inaccuracy: 0,
      mistake: 0,
      blunder: 0,
    };
    for (let i = 0; i < 20; i++) {
      expect(rollAdjustedQuality(rootFen, bestMoves, allBest)).toBe("best");
    }
  });

  it("a tactical position measurably lowers the roll frequency of 'best' compared to the same weights on a normal position", () => {
    // Same base weights (a realistic mid-tier distribution) evaluated
    // against two different positions -- one tactical (PV1 is a
    // capture), one normal (quiet, unambiguous). Since adjustWeights'
    // tactical row moves real probability mass out of "best", rolling
    // many times against the tactical position should produce "best"
    // less often, on average, than the same weights against the normal
    // position. This is inherently statistical (rollQuality uses
    // Math.random()), so it uses a large sample and a generous margin
    // rather than an exact assertion.
    const normalFen = buildFen({ h1: ["k", "w"], h8: ["k", "b"], e2: ["p", "w"] });
    const normalMoves: PvCandidate[] = [
      { move: "e2e4", score: 30, mate: null },
      { move: "e2e3", score: -400, mate: null },
    ];

    const tacticalFen = buildFen({
      h1: ["k", "w"],
      h8: ["k", "b"],
      e4: ["p", "w"],
      d5: ["p", "b"],
    });
    const tacticalMoves: PvCandidate[] = [
      { move: "e4d5", score: 100, mate: null }, // capture -> tactical
      { move: "e4e5", score: -400, mate: null },
    ];

    const baseWeights: Record<MoveQuality, number> = {
      best: 59,
      excellent: 22,
      good: 11,
      inaccuracy: 5.5,
      mistake: 2,
      blunder: 0.5,
    };

    const N = 4000;
    let normalBestCount = 0;
    let tacticalBestCount = 0;

    for (let i = 0; i < N; i++) {
      if (rollAdjustedQuality(normalFen, normalMoves, baseWeights) === "best") normalBestCount++;
      if (rollAdjustedQuality(tacticalFen, tacticalMoves, baseWeights) === "best") {
        tacticalBestCount++;
      }
    }

    const normalRate = normalBestCount / N;
    const tacticalRate = tacticalBestCount / N;

    // Expect roughly a 12-point-of-59 reduction (the tactical row's
    // best->excellent flow alone is 12%), well outside sampling noise
    // at N=4000. Generous margin since this is about direction and
    // rough magnitude, not pinning an exact value.
    expect(tacticalRate).toBeLessThan(normalRate - 0.03);
  });

  it("returns a MoveQuality even for a position with a single candidate (no PV2 to compare against)", () => {
    const rootFen = buildFen({ h1: ["k", "w"], h8: ["k", "b"], e2: ["p", "w"] });
    const bestMoves: PvCandidate[] = [{ move: "e2e4", score: 30, mate: null }];
    const weights: Record<MoveQuality, number> = {
      best: 50,
      excellent: 20,
      good: 15,
      inaccuracy: 8,
      mistake: 5,
      blunder: 2,
    };
    const result = rollAdjustedQuality(rootFen, bestMoves, weights);
    expect(["best", "excellent", "good", "inaccuracy", "mistake", "blunder"]).toContain(result);
  });
});