import { describe, it, expect } from "vitest";
import {
  adjustWeights,
  REDISTRIBUTION_TABLE,
  type RedistributionTable,
} from "./adjustWeights";
import type { PositionCharacter } from "./positionCharacter";
import { MOVE_QUALITY_ASCENDING } from "./botMoveSelection";
import type { MoveQuality } from "./evaluation";

const CHARACTERS: PositionCharacter[] = ["normal", "ambiguous", "tactical", "both"];

// Representative elo profiles spanning the full ladder, taken directly
// from personalities.ts's ELO_CONFIG (kept as plain literals here so
// this test suite doesn't need to import the real config, which would
// couple a math-invariant test to production data it isn't testing).
const SAMPLE_PROFILES: Record<string, Record<MoveQuality, number>> = {
  "300": { best: 5, excellent: 7, good: 10, inaccuracy: 20, mistake: 30, blunder: 28 },
  "1200": { best: 38, excellent: 23, good: 17, inaccuracy: 12, mistake: 7, blunder: 3 },
  "1800": { best: 59, excellent: 22, good: 11, inaccuracy: 5.5, mistake: 2, blunder: 0.5 },
  "2400": { best: 75, excellent: 15, good: 6, inaccuracy: 2.5, mistake: 1, blunder: 0.5 },
  "2900": { best: 91, excellent: 6, good: 2, inaccuracy: 0.7, mistake: 0.2, blunder: 0.1 },
};

function sum(weights: Record<MoveQuality, number>): number {
  return MOVE_QUALITY_ASCENDING.reduce((total, q) => total + weights[q], 0);
}

describe("adjustWeights — mathematical invariants (not behavioral tuning)", () => {
  describe("preserves total probability mass", () => {
    for (const [elo, base] of Object.entries(SAMPLE_PROFILES)) {
      for (const character of CHARACTERS) {
        it(`elo ${elo}, character "${character}"`, () => {
          const adjusted = adjustWeights(base, character);
          expect(sum(adjusted)).toBeCloseTo(sum(base), 9);
        });
      }
    }
  });

  describe("never produces negative weights", () => {
    for (const [elo, base] of Object.entries(SAMPLE_PROFILES)) {
      for (const character of CHARACTERS) {
        it(`elo ${elo}, character "${character}"`, () => {
          const adjusted = adjustWeights(base, character);
          for (const quality of MOVE_QUALITY_ASCENDING) {
            expect(adjusted[quality]).toBeGreaterThanOrEqual(0);
          }
        });
      }
    }
  });

  it('"normal" is the identity transform for every sample profile', () => {
    for (const base of Object.values(SAMPLE_PROFILES)) {
      const adjusted = adjustWeights(base, "normal");
      expect(adjusted).toEqual(base);
    }
  });

  it("an entirely empty row is the identity transform, independent of the production table", () => {
    const emptyTable: RedistributionTable = {
      normal: [],
      ambiguous: [],
      tactical: [],
      both: [],
    };
    for (const base of Object.values(SAMPLE_PROFILES)) {
      for (const character of CHARACTERS) {
        expect(adjustWeights(base, character, emptyTable)).toEqual(base);
      }
    }
  });

  it("does not mutate the input weights object", () => {
    const base = { ...SAMPLE_PROFILES["1800"] };
    const snapshot = { ...base };
    adjustWeights(base, "tactical");
    expect(base).toEqual(snapshot);
  });

  it("flow order inside a row is irrelevant (atomic, not sequential)", () => {
    const forward: RedistributionTable = {
      normal: [],
      ambiguous: [],
      both: [],
      tactical: [
        { from: "best", to: "excellent", fraction: 0.12 },
        { from: "excellent", to: "good", fraction: 0.1 },
        { from: "good", to: "inaccuracy", fraction: 0.06 },
        { from: "excellent", to: "mistake", fraction: 0.02 },
      ],
    };
    const shuffled: RedistributionTable = {
      normal: [],
      ambiguous: [],
      both: [],
      tactical: [
        { from: "good", to: "inaccuracy", fraction: 0.06 },
        { from: "excellent", to: "mistake", fraction: 0.02 },
        { from: "best", to: "excellent", fraction: 0.12 },
        { from: "excellent", to: "good", fraction: 0.1 },
      ],
    };

    for (const base of Object.values(SAMPLE_PROFILES)) {
      const a = adjustWeights(base, "tactical", forward);
      const b = adjustWeights(base, "tactical", shuffled);
      expect(a).toEqual(b);
    }
  });

  it("two flows sharing the same 'from' bucket both draw from the ORIGINAL value, not a partially-depleted one", () => {
    // Synthetic table: 50% of `best` to excellent, AND 50% of `best` to
    // good, in the same row. A sequential (bugged) implementation would
    // take 50% of best, leaving 50%, then take 50% of THAT remaining
    // half for the second flow (25% of the original) -- only removing
    // 75% of best total. The correct atomic semantics remove BOTH
    // amounts computed from the original value: 50% + 50% = 100% of
    // best redistributed, leaving 0.
    const table: RedistributionTable = {
      normal: [],
      ambiguous: [],
      tactical: [],
      both: [
        { from: "best", to: "excellent", fraction: 0.5 },
        { from: "best", to: "good", fraction: 0.5 },
      ],
    };
    const base: Record<MoveQuality, number> = {
      best: 60,
      excellent: 20,
      good: 10,
      inaccuracy: 5,
      mistake: 3,
      blunder: 2,
    };
    const adjusted = adjustWeights(base, "both", table);
    expect(adjusted.best).toBeCloseTo(0, 9);
    expect(adjusted.excellent).toBeCloseTo(20 + 30, 9); // +50% of original 60
    expect(adjusted.good).toBeCloseTo(10 + 30, 9); // +50% of original 60
    expect(sum(adjusted)).toBeCloseTo(sum(base), 9);
  });

  it("throws on an out-of-range fraction before doing any arithmetic", () => {
    // Deliberately violates the ~30-35% design ceiling (a fraction of
    // 1.5, i.e. 150% of the source bucket) -- this table should never
    // ship. Caught by the upfront per-flow validation now, since a
    // fraction outside [0, 1] is a malformed table regardless of what
    // the resulting arithmetic would produce.
    const table: RedistributionTable = {
      normal: [],
      ambiguous: [],
      both: [],
      tactical: [{ from: "mistake", to: "best", fraction: 1.5 }],
    };
    const base: Record<MoveQuality, number> = {
      best: 50,
      excellent: 20,
      good: 15,
      inaccuracy: 8,
      mistake: 5,
      blunder: 2,
    };
    expect(() => adjustWeights(base, "tactical", table)).toThrow(/out-of-range fraction/);
  });

  it("throws on a negative fraction before doing any arithmetic", () => {
    const table: RedistributionTable = {
      normal: [],
      ambiguous: [],
      both: [],
      tactical: [{ from: "best", to: "mistake", fraction: -0.2 }],
    };
    const base: Record<MoveQuality, number> = {
      best: 50,
      excellent: 20,
      good: 15,
      inaccuracy: 8,
      mistake: 5,
      blunder: 2,
    };
    expect(() => adjustWeights(base, "tactical", table)).toThrow(/out-of-range fraction/);
  });

  it("throws on a non-finite fraction before doing any arithmetic", () => {
    const table: RedistributionTable = {
      normal: [],
      ambiguous: [],
      both: [],
      tactical: [{ from: "best", to: "mistake", fraction: NaN }],
    };
    const base: Record<MoveQuality, number> = {
      best: 50,
      excellent: 20,
      good: 15,
      inaccuracy: 8,
      mistake: 5,
      blunder: 2,
    };
    expect(() => adjustWeights(base, "tactical", table)).toThrow(/non-finite fraction/);
  });

  it("still throws on a negative resulting weight even when every individual fraction is in range", () => {
    // Each fraction here is individually valid ([0, 1]), but three flows
    // drawing from the same bucket sum to 105% of it -- this can only be
    // caught by checking the RESULT, which is exactly why the
    // negative-weight check stays alongside the upfront fraction
    // validation rather than replacing it.
    const table: RedistributionTable = {
      normal: [],
      ambiguous: [],
      both: [],
      tactical: [
        { from: "mistake", to: "best", fraction: 0.4 },
        { from: "mistake", to: "excellent", fraction: 0.4 },
        { from: "mistake", to: "good", fraction: 0.25 },
      ],
    };
    const base: Record<MoveQuality, number> = {
      best: 50,
      excellent: 20,
      good: 15,
      inaccuracy: 8,
      mistake: 5,
      blunder: 2,
    };
    expect(() => adjustWeights(base, "tactical", table)).toThrow(/negative weight/);
  });

  it("supports an injected table independent of the production REDISTRIBUTION_TABLE", () => {
    const tinyTable: RedistributionTable = {
      normal: [],
      ambiguous: [],
      tactical: [{ from: "best", to: "mistake", fraction: 0.5 }],
      both: [],
    };
    const base: Record<MoveQuality, number> = {
      best: 100,
      excellent: 0,
      good: 0,
      inaccuracy: 0,
      mistake: 0,
      blunder: 0,
    };
    const adjusted = adjustWeights(base, "tactical", tinyTable);
    expect(adjusted).toEqual({
      best: 50,
      excellent: 0,
      good: 0,
      inaccuracy: 0,
      mistake: 50,
      blunder: 0,
    });
  });
});

describe("Production REDISTRIBUTION_TABLE — behavioral sanity (not exhaustive tuning)", () => {
  it("no single flow exceeds the ~30-35% design ceiling on its source bucket", () => {
    for (const character of CHARACTERS) {
      const outgoingByBucket: Partial<Record<MoveQuality, number>> = {};
      for (const flow of REDISTRIBUTION_TABLE[character]) {
        outgoingByBucket[flow.from] = (outgoingByBucket[flow.from] ?? 0) + flow.fraction;
      }
      for (const [bucket, totalFraction] of Object.entries(outgoingByBucket)) {
        expect(totalFraction, `${character}: total outflow from ${bucket}`).toBeLessThanOrEqual(0.35);
      }
    }
  });

  it("blunder is never a 'from' or 'to' target in any row", () => {
    for (const character of CHARACTERS) {
      for (const flow of REDISTRIBUTION_TABLE[character]) {
        expect(flow.from).not.toBe("blunder");
        expect(flow.to).not.toBe("blunder");
      }
    }
  });

  it("tactical-induced mistake rate decreases as base rating increases", () => {
    // The specific regression this table was redesigned to fix: routing
    // the tactical leak through excellent/good instead of directly out
    // of best means the downstream mistake rate should shrink with
    // rating, not stay flat or grow.
    const elos = ["1800", "2400", "2900"] as const;
    const mistakeRates = elos.map(
      (elo) => adjustWeights(SAMPLE_PROFILES[elo], "tactical").mistake,
    );
    expect(mistakeRates[0]).toBeGreaterThan(mistakeRates[1]);
    expect(mistakeRates[1]).toBeGreaterThan(mistakeRates[2]);
  });
});