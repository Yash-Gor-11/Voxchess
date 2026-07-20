import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { characterizePosition } from "./positionCharacterization";
import type { PvCandidate } from "./botMoveSelection";

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

describe("characterizePosition", () => {
  it('returns "normal" when there are no candidates', () => {
    const rootFen = buildFen({ h1: ["k", "w"], h8: ["k", "b"] });
    expect(characterizePosition(rootFen, [])).toBe("normal");
  });

  it('returns "tactical" when PV1 has a mate score', () => {
    const rootFen = buildFen({ h1: ["k", "w"], h8: ["k", "b"], e2: ["p", "w"] });
    const bestMoves: PvCandidate[] = [{ move: "e2e4", score: 0, mate: 3 }];
    expect(characterizePosition(rootFen, bestMoves)).toBe("tactical");
  });

  it('returns "tactical" when PV1 is a capture', () => {
    const rootFen = buildFen({
      h1: ["k", "w"],
      h8: ["k", "b"],
      e4: ["p", "w"],
      d5: ["p", "b"],
    });
    const bestMoves: PvCandidate[] = [{ move: "e4d5", score: 100, mate: null }];
    expect(characterizePosition(rootFen, bestMoves)).toBe("tactical");
  });

  it('returns "tactical" when PV1 is a promotion', () => {
    const rootFen = buildFen({ h1: ["k", "w"], a8: ["k", "b"], b7: ["p", "w"] });
    const bestMoves: PvCandidate[] = [{ move: "b7b8q", score: 800, mate: null }];
    expect(characterizePosition(rootFen, bestMoves)).toBe("tactical");
  });

  it('returns "tactical" when PV1 delivers check', () => {
    // White queen d1 to d7+ (black king on d8, nothing blocking the file).
    const rootFen = buildFen({ h1: ["k", "w"], d8: ["k", "b"], d1: ["q", "w"] }, "w");
    const bestMoves: PvCandidate[] = [{ move: "d1d7", score: 500, mate: null }];
    expect(characterizePosition(rootFen, bestMoves)).toBe("tactical");
  });

  it('returns "normal" for a quiet, unambiguous position', () => {
    const rootFen = buildFen({ h1: ["k", "w"], h8: ["k", "b"], e2: ["p", "w"] });
    // PV1 quiet pawn push; PV2 far worse (large win% gap) so not ambiguous.
    const bestMoves: PvCandidate[] = [
      { move: "e2e4", score: 30, mate: null },
      { move: "e2e3", score: -400, mate: null },
    ];
    expect(characterizePosition(rootFen, bestMoves)).toBe("normal");
  });

  it('returns "ambiguous" when PV2 is very close to PV1 and neither is tactical', () => {
    const rootFen = buildFen({ h1: ["k", "w"], h8: ["k", "b"], e2: ["p", "w"] });
    const bestMoves: PvCandidate[] = [
      { move: "e2e4", score: 20, mate: null },
      { move: "e2e3", score: 18, mate: null }, // tiny gap -> excellent -> ambiguous
    ];
    expect(characterizePosition(rootFen, bestMoves)).toBe("ambiguous");
  });

  it('returns "both" when PV1 is tactical AND PV2 is close to it', () => {
    const rootFen = buildFen({
      h1: ["k", "w"],
      h8: ["k", "b"],
      e4: ["p", "w"],
      d5: ["p", "b"],
      f2: ["p", "w"],
    });
    const bestMoves: PvCandidate[] = [
      { move: "e4d5", score: 100, mate: null }, // capture -> tactical
      { move: "f2f4", score: 98, mate: null }, // very close -> ambiguous too
    ];
    expect(characterizePosition(rootFen, bestMoves)).toBe("both");
  });

  it("does not throw when PV1's UCI move isn't actually legal in rootFen (defensive)", () => {
    const rootFen = buildFen({ h1: ["k", "w"], h8: ["k", "b"], e2: ["p", "w"] });
    const bestMoves: PvCandidate[] = [{ move: "a1a2", score: 0, mate: null }];
    expect(() => characterizePosition(rootFen, bestMoves)).not.toThrow();
  });
});