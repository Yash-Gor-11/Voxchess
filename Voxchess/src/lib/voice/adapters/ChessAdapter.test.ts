// src/lib/voice/adapters/ChessAdapter.test.ts
//
// Run with: bun test

import { describe, expect, it } from "bun:test";
import { createTestChessAdapter } from "./ChessAdapter";

describe("ChessAdapter — getLegalMoves", () => {
  it("returns all 20 legal moves from the starting position", () => {
    const adapter = createTestChessAdapter(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    );
    expect(adapter.getLegalMoves().length).toBe(20);
  });

  it("reports both origin squares for a genuinely ambiguous rook move", () => {
    // Rooks on a1 and h1, e1 empty, path clear along the back rank.
    const adapter = createTestChessAdapter("4k3/8/8/8/8/8/3K4/R6R w - - 0 1");
    const toE1 = adapter.getLegalMoves().filter((m) => m.to === "e1" && m.piece === "R");
    expect(toE1.length).toBe(2);
    expect(toE1.map((m) => m.from).sort()).toEqual(["a1", "h1"]);
  });

  it("flags castling moves correctly", () => {
    const adapter = createTestChessAdapter("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1");
    const castles = adapter.getLegalMoves().filter((m) => m.isCastleKingside || m.isCastleQueenside);
    expect(castles.length).toBe(2);
    expect(castles.find((m) => m.isCastleKingside)?.san).toBe("O-O");
    expect(castles.find((m) => m.isCastleQueenside)?.san).toBe("O-O-O");
  });

  it("reports all four promotion options for a pawn on the seventh rank", () => {
    const adapter = createTestChessAdapter("k7/4P3/8/8/8/8/8/4K3 w - - 0 1");
    const promos = adapter.getLegalMoves().filter((m) => m.promotion);
    expect(promos.length).toBe(4);
    expect(promos.map((m) => m.promotion).sort()).toEqual(["B", "N", "Q", "R"]);
  });

  it("marks captures, including via the flags fallback", () => {
    const adapter = createTestChessAdapter("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1");
    const captures = adapter.getLegalMoves().filter((m) => m.captured);
    expect(captures.length).toBe(1);
    expect(captures[0].san).toBe("exd5");
  });
});

describe("ChessAdapter — executeMove delegation", () => {
  it("delegates to the caller-supplied executeMove without mutating internal state itself", () => {
    let recorded: { from: string; to: string; promotion?: string } | null = null;
    const adapter = createTestChessAdapter("8/8/8/8/8/8/8/8 w - - 0 1", (move) => {
      recorded = move;
    });
    adapter.executeMove({ from: "e2", to: "e4" });
    expect(recorded).toEqual({ from: "e2", to: "e4" });
  });
});

describe("ChessAdapter — currentFen", () => {
  it("returns the FEN the adapter was constructed with", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const adapter = createTestChessAdapter(fen);
    expect(adapter.currentFen()).toBe(fen);
  });
});
