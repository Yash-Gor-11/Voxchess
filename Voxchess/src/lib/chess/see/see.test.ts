import { describe, it, expect } from "vitest";
import { see } from "./see";
import { buildFen } from "./fixtures/buildFen";
import { BASIC_FIXTURES } from "./fixtures/basic";
import { TERMINATION_FIXTURES } from "./fixtures/termination";
import { MODERATE_FIXTURES } from "./fixtures/moderate";

describe("Category 0 — API contract", () => {
  const fen = buildFen({
    turn: "b",
    pieces: { d4: ["q", "w"], d1: ["r", "b"] },
  });
  const capture = { from: "d1" as const, to: "d4" as const };

  it("is deterministic", () => {
    expect(see(fen, capture)).toEqual(see(fen, capture));
  });

  it("does not mutate the position across repeated calls", () => {
    const first = see(fen, capture);
    // If see() mutated its internal board without cloning from `fen`
    // fresh each time, a second call against the same fen would diverge.
    const second = see(fen, capture);
    expect(second).toEqual(first);
  });

  it("throws when the move is not a legal capture in the position", () => {
    const noCaptureFen = buildFen({ turn: "w", pieces: { e2: ["p", "w"] } });
    expect(() => see(noCaptureFen, { from: "e2" as const, to: "e4" as const })).toThrow();
  });

  it("throws when the squares don't correspond to any legal move", () => {
    expect(() => see(fen, { from: "a1" as const, to: "a2" as const })).toThrow();
  });

  it("handles a promoting capture without throwing", () => {
    const promoFen = buildFen({
      turn: "w",
      pieces: { b7: ["p", "w"], a8: ["r", "b"] },
      whiteKing: "h1",
      blackKing: "h8",
    });
    const result = see(promoFen, { from: "b7" as const, to: "a8" as const, promotion: "q" });
    expect(Number.isFinite(result.netMaterial)).toBe(true);
  });
});

describe("Category A — trivial exchanges", () => {
  for (const fixture of BASIC_FIXTURES) {
    it(fixture.name, () => {
      const result = see(fixture.fen, fixture.capture);
      expect(result.netMaterial).toBe(fixture.expectedNetMaterial);
    });
  }
});

describe("Termination — stand-pat and attacker ordering", () => {
  for (const fixture of TERMINATION_FIXTURES) {
    it(fixture.name, () => {
      const result = see(fixture.fen, fixture.capture);
      expect(result.netMaterial).toBe(fixture.expectedNetMaterial);
    });
  }
});

describe("Category B — moderate, hand-verified exchanges", () => {
  for (const fixture of MODERATE_FIXTURES) {
    it(fixture.name, () => {
      const result = see(fixture.fen, fixture.capture);
      expect(result.netMaterial).toBe(fixture.expectedNetMaterial);
    });
  }
});

describe("Ordering independence — the LVA tie-break shouldn't change the result", () => {
  // CPW's own published x-ray example (see termination.ts for the full
  // fixture and derivation). Black's knight and bishop tie at the first
  // recapture; only the bishop reveals an x-ray attacker (its own queen)
  // when it moves. This asserts the actual PROPERTY -- that swapping
  // which equal-valued piece resolves the tie doesn't change the final
  // result -- rather than asserting that one specific ordering produces
  // a specific number, which wouldn't tell you whether a future change
  // broke the property or just changed which ordering is default.
  const fen = "1k1r3q/1ppn3p/p4b2/4p3/8/P2N2P1/1PP1R1BP/2K1Q3 w - - 0 1";
  const capture = { from: "d3" as const, to: "e5" as const };

  it("knight-first and bishop-first tie-breaks yield the same netMaterial", () => {
    const knightFirst = see(fen, capture, { pieceOrder: ["p", "n", "b", "r", "q", "k"] });
    const bishopFirst = see(fen, capture, { pieceOrder: ["p", "b", "n", "r", "q", "k"] });
    expect(bishopFirst.netMaterial).toBe(knightFirst.netMaterial);
  });
});

// Deliberately no describe block for validation.ts fixtures here -- see
// fixtures/validation.ts for why they don't have asserted values yet.