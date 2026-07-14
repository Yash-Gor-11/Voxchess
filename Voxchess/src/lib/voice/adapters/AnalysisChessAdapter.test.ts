// src/lib/voice/adapters/AnalysisChessAdapter.test.ts
//
// Run with: bun test
//
// MockAnalysisTree below replicates the real AnalysisTree class's
// confirmed behavior (see AnalysisChessAdapter.ts's header — the real
// source was provided directly and used to verify this adapter in the
// development sandbox, not guessed). Specifically it reproduces:
//   - makeMove() returning null for illegal moves
//   - a move matching an EXISTING child reusing that child (transposition)
//     rather than creating a duplicate — a real, easy-to-miss quirk of the
//     actual class
//   - branching: making a move from a node that already has an unrelated
//     child adds a SECOND child (a variation) without disturbing the first
//
// This mock is intentionally NOT the real class (that file lives outside
// src/lib/voice/ in the real VoxChess repo and shouldn't be duplicated
// here) — it's a faithful behavioral stand-in, verified to match the real
// class's logic during development.

import { describe, expect, it } from "bun:test";
import { Chess } from "chess.js";
import { createAnalysisChessAdapter, type AnalysisTreeLike } from "./AnalysisChessAdapter";

interface MockNode {
  fen: string;
  move: string | null;
  san: string | null;
  isMainLine: boolean;
  children: MockNode[];
}

/**
 * Faithful behavioral stand-in for the real AnalysisTree — see file
 * header. Exposes `current`/`makeMove` (the AnalysisTreeLike contract)
 * plus test-only helpers (`goToNode`, `root`) not part of that contract.
 */
class MockAnalysisTree implements AnalysisTreeLike {
  root: MockNode;
  current: MockNode;

  constructor(startFen: string) {
    this.root = { fen: startFen, move: null, san: null, isMainLine: true, children: [] };
    this.current = this.root;
  }

  makeMove(uciMove: string): MockNode | null {
    const chess = new Chess(this.current.fen);
    const from = uciMove.slice(0, 2);
    const to = uciMove.slice(2, 4);
    const promotion = uciMove.slice(4) || undefined;

    let result;
    try {
      result = chess.move({ from, to, promotion });
    } catch {
      return null;
    }
    if (!result) return null;

    const moveKey = result.from + result.to + (result.promotion ?? "");

    // Transposition reuse — matches the real class exactly.
    const existing = this.current.children.find((c) => c.move === moveKey);
    if (existing) {
      this.current = existing;
      return existing;
    }

    const newNode: MockNode = {
      fen: chess.fen(),
      move: moveKey,
      san: result.san,
      isMainLine: false,
      children: [],
    };
    this.current.children.push(newNode);
    this.current = newNode;
    return newNode;
  }

  goToNode(node: MockNode): void {
    this.current = node;
  }
}

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("AnalysisChessAdapter — reads", () => {
  it("getLegalMoves() reads from the tree's current node", () => {
    const tree = new MockAnalysisTree(START_FEN);
    const adapter = createAnalysisChessAdapter(tree);
    expect(adapter.getLegalMoves().length).toBe(20);
  });

  it("currentFen() matches tree.current.fen", () => {
    const tree = new MockAnalysisTree(START_FEN);
    const adapter = createAnalysisChessAdapter(tree);
    expect(adapter.currentFen()).toBe(START_FEN);
  });
});

describe("AnalysisChessAdapter — writes", () => {
  it("executeMove() commits a simple move via tree.makeMove()", () => {
    const tree = new MockAnalysisTree(START_FEN);
    const adapter = createAnalysisChessAdapter(tree);

    adapter.executeMove({ from: "g1", to: "f3" });

    expect(tree.current.san).toBe("Nf3");
    expect(adapter.currentFen()).toBe(tree.current.fen);
  });

  it("executeMove() with a promotion lowercases the letter for tree.makeMove()", () => {
    // LegalMove/MoveCandidate carry promotion as uppercase ("Q"), matching
    // this project's internal PromotionLetter convention — the adapter is
    // responsible for lowercasing it before it reaches AnalysisTree, since
    // that's what chess.js (and therefore the real class) expects.
    const tree = new MockAnalysisTree("k7/4P3/8/8/8/8/8/4K3 w - - 0 1");
    const adapter = createAnalysisChessAdapter(tree);

    adapter.executeMove({ from: "e7", to: "e8", promotion: "Q" });

    expect(tree.current.san).toBe("e8=Q+");
  });

  it("an illegal move does not advance tree.current", () => {
    const tree = new MockAnalysisTree(START_FEN);
    const adapter = createAnalysisChessAdapter(tree);
    const before = tree.current.fen;

    adapter.executeMove({ from: "a1", to: "a8" }); // blocked by own pawn

    expect(tree.current.fen).toBe(before);
  });
});

describe("AnalysisChessAdapter — variation branching (the Phase 8 risk v3 flags)", () => {
  it("making a move from a node with an existing child creates a variation without disturbing the original", () => {
    const tree = new MockAnalysisTree(START_FEN);
    const adapter = createAnalysisChessAdapter(tree);

    adapter.executeMove({ from: "e2", to: "e4" });
    const afterE4 = tree.current;
    adapter.executeMove({ from: "e7", to: "e5" });

    // Go back to the position after 1.e4 and play a DIFFERENT reply.
    tree.goToNode(afterE4);
    adapter.executeMove({ from: "c7", to: "c5" });

    expect(afterE4.children.length).toBe(2);
    expect(afterE4.children[0].san).toBe("e5");
    expect(afterE4.children[1].san).toBe("c5");
    expect(afterE4.children[1].isMainLine).toBe(false);
    // The adapter operated correctly on whichever node was "current" —
    // it never needed to know or care that this was a branch point.
    expect(adapter.currentFen()).toBe(tree.current.fen);
  });
});

describe("AnalysisChessAdapter — transposition reuse", () => {
  it("replaying an existing child's move reuses that node instead of duplicating it", () => {
    const tree = new MockAnalysisTree(START_FEN);
    const adapter = createAnalysisChessAdapter(tree);

    adapter.executeMove({ from: "e2", to: "e4" });
    const firstE4Node = tree.current;

    tree.goToNode(tree.root);
    adapter.executeMove({ from: "e2", to: "e4" }); // same move again from root

    expect(tree.current).toBe(firstE4Node);
    expect(tree.root.children.length).toBe(1);
  });
});
