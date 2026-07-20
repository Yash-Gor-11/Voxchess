import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { resolveAgainstRealism, resolveExactAgainstRealism } from "./resolveAgainstRealism";
import { classifyCandidates, type PvCandidate } from "./botMoveSelection";

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

describe("resolveAgainstRealism", () => {
  it("returns the exact-quality candidate directly when it's already believable", () => {
    // Simple position, no hanging pieces anywhere. PV1 is "best", so
    // classifyCandidates will call it "best" regardless of what else is
    // in the pool -- desired="best" should resolve to PV1 immediately.
    const rootFen = buildFen({ h1: ["k", "w"], h8: ["k", "b"], e2: ["p", "w"] });
    const candidates: PvCandidate[] = [{ move: "e2e4", score: 20, mate: null }];
    const classified = classifyCandidates(candidates);

    const chosen = resolveAgainstRealism(classified, "best", rootFen, 1800);
    expect(chosen.move).toBe("e2e4");
  });

  it("skips a rejected candidate and falls back to the next rung", () => {
    // Queen hangs for free (Qd5, Rxd5 no recapture) vs PV1 a safe queen
    // retreat. If the roll wants whatever quality tier the blunder
    // landed in, Immediate Punishment should reject it and the ladder
    // should climb to PV1.
    const rootFen = buildFen({
      h1: ["k", "w"],
      h8: ["k", "b"],
      d1: ["q", "w"],
      d8: ["r", "b"],
    });
    const candidates: PvCandidate[] = [
      { move: "d1a1", score: 0, mate: null }, // PV1: safe retreat, eval ~0
      { move: "d1d5", score: -900, mate: null }, // PV2: hangs the queen for free
    ];
    const classified = classifyCandidates(candidates);
    const desiredQuality = classified[1].quality;

    const chosen = resolveAgainstRealism(classified, desiredQuality, rootFen, 1800);
    expect(chosen.move).toBe("d1a1");
  });

  it("accepts the same rejected candidate at a rating where the filter is disabled", () => {
    const rootFen = buildFen({
      h1: ["k", "w"],
      h8: ["k", "b"],
      d1: ["q", "w"],
      d8: ["r", "b"],
    });
    const candidates: PvCandidate[] = [
      { move: "d1a1", score: 0, mate: null },
      { move: "d1d5", score: -900, mate: null },
    ];
    const classified = classifyCandidates(candidates);
    const desiredQuality = classified[1].quality;

    // elo 400 -> SEE filter disabled entirely, so the blunder should be
    // allowed through as-is (authentic for that rating).
    const chosen = resolveAgainstRealism(classified, desiredQuality, rootFen, 400);
    expect(chosen.move).toBe("d1d5");
  });

  it("falls back to the last remaining candidate rather than looping forever if everything is rejected", () => {
    const rootFen = buildFen({
      h1: ["k", "w"],
      h8: ["k", "b"],
      d1: ["q", "w"],
      d8: ["r", "b"],
    });
    // Only one candidate at all -- rejected by Immediate Punishment, but
    // it's the only one available, so the loop must still return it
    // rather than throwing or looping forever.
    const candidates: PvCandidate[] = [{ move: "d1d5", score: -900, mate: null }];
    const classified = classifyCandidates(candidates);
    const desiredQuality = classified[0].quality;

    const chosen = resolveAgainstRealism(classified, desiredQuality, rootFen, 1800);
    expect(chosen.move).toBe("d1d5");
  });
});

describe("resolveExactAgainstRealism", () => {
  const rootFen = buildFen({
    h1: ["k", "w"],
    h8: ["k", "b"],
    d1: ["q", "w"],
    d8: ["r", "b"],
  });
  const candidates: PvCandidate[] = [
    { move: "d1a1", score: 0, mate: null }, // PV1: "best"
    { move: "d1d5", score: -900, mate: null }, // PV2: hangs the queen
  ];
  const classified = classifyCandidates(candidates);

  it("returns null when no exact match for the desired quality exists in the pool", () => {
    const ALL_QUALITIES = ["best", "excellent", "good", "inaccuracy", "mistake", "blunder"] as const;
    const present = new Set(classified.map((c) => c.quality));
    const missing = ALL_QUALITIES.find((q) => !present.has(q));
    expect(missing).toBeDefined(); // sanity check the fixture actually omits something

    const result = resolveExactAgainstRealism(classified, missing!, rootFen, 1800);
    expect(result).toBeNull();
  });

  it("returns a resolved candidate when an exact match exists, still subject to realism climbing", () => {
    const desiredQuality = classified[1].quality; // the blunder's own tier -- exact match exists
    const result = resolveExactAgainstRealism(classified, desiredQuality, rootFen, 1800);
    // Exact match (the queen hang) exists but is rejected -- climbs to PV1.
    expect(result).not.toBeNull();
    expect(result?.move).toBe("d1a1");
  });

  it("agrees with resolveAgainstRealism once an exact match is confirmed present", () => {
    const desiredQuality = classified[0].quality; // "best" -- PV1, always present
    const viaExact = resolveExactAgainstRealism(classified, desiredQuality, rootFen, 1800);
    const viaLadder = resolveAgainstRealism(classified, desiredQuality, rootFen, 1800);
    expect(viaExact).toEqual(viaLadder);
  });
});