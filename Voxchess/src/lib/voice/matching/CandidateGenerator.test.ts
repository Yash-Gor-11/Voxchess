// src/lib/voice/matching/CandidateGenerator.test.ts
//
// Run with: bun test
//
// Fixture-driven per fixtures/matching/candidate-generator.json — every
// entry validated against real chess.js output (via ChessAdapter) before
// being committed here, not hand-derived.

import { describe, expect, it } from "bun:test";
import { createTestChessAdapter } from "../adapters/ChessAdapter";
import { normalize } from "../intent/Normalizer";
import { parseIntent } from "../intent/IntentParser";
import { generateCandidates } from "./CandidateGenerator";
import fixtures from "../fixtures/matching/candidate-generator.json";

interface Fixture {
  fen: string;
  phrase: string;
  expectedSans: string[];
  _comment?: string;
}

describe("CandidateGenerator — fixture corpus", () => {
  for (const fixture of fixtures as Fixture[]) {
    const label = `"${fixture.phrase}" on ${fixture.fen}${fixture._comment ? ` — ${fixture._comment}` : ""}`;
    it(`${label} -> ${JSON.stringify(fixture.expectedSans)}`, () => {
      const adapter = createTestChessAdapter(fixture.fen);
      const legalMoves = adapter.getLegalMoves();
      const parseResults = parseIntent(normalize(fixture.phrase));
      const candidates = generateCandidates(parseResults, legalMoves);
      const actualSans = candidates.map((c) => c.move.san).sort();
      expect(actualSans).toEqual([...fixture.expectedSans].sort());
    });
  }
});

describe("CandidateGenerator — capture-compatibility asymmetry", () => {
  // This is the single most important behavioral property of this module —
  // explicit "takes" constrains, but its absence does not. Tested directly
  // (not just via the fixture corpus) since it's easy to get backwards.
  const fen = "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1";

  it('requires an actual capture when the phrase says "takes"', () => {
    // Nothing to capture on e4 itself in this position from a quiet-move angle —
    // reusing the same fixture as the corpus for directness.
    const adapter = createTestChessAdapter("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    const legalMoves = adapter.getLegalMoves();
    const parseResults = parseIntent(normalize("pawn takes e4"));
    expect(generateCandidates(parseResults, legalMoves)).toEqual([]);
  });

  it('does NOT require the word "takes" for a capturing move to be generated', () => {
    const adapter = createTestChessAdapter(fen);
    const legalMoves = adapter.getLegalMoves();
    const parseResults = parseIntent(normalize("e4 d5")); // no "takes" spoken
    const candidates = generateCandidates(parseResults, legalMoves);
    expect(candidates.map((c) => c.move.san)).toEqual(["exd5"]);
  });
});

describe("CandidateGenerator — scope discipline", () => {
  // This module must never invent its own legality logic — it only
  // filters what ChessAdapter already reports. This test doesn't exercise
  // a specific rule (castling/pins/etc.) so much as document the
  // architectural expectation: an illegal destination (occupied by an own
  // piece) simply isn't in legalMoves at all, so no special-case filtering
  // for it should exist in this module.
  it("relies entirely on ChessAdapter's legal move list — an illegal destination yields zero candidates with no special-case code", () => {
    const adapter = createTestChessAdapter("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    const legalMoves = adapter.getLegalMoves();
    const parseResults = parseIntent(normalize("knight to a1")); // a1 occupied by own rook
    expect(generateCandidates(parseResults, legalMoves)).toEqual([]);
  });
});
