// src/lib/voice/matching/MoveRanker.test.ts
//
// Run with: bun test

import { describe, expect, it } from "bun:test";
import { createTestChessAdapter } from "../adapters/ChessAdapter";
import { normalize } from "../intent/Normalizer";
import { parseIntent } from "../intent/IntentParser";
import { generateCandidates } from "./CandidateGenerator";
import { rankCandidates } from "./MoveRanker";
import type { RankingContext } from "../types";
import fixtures from "../fixtures/matching/move-ranker.json";

interface Fixture {
  fen: string;
  phrase: string;
  context: Partial<RankingContext>;
  expected: Array<{ san: string; score: number }>;
  _comment?: string;
}

function runFullPipeline(fen: string, phrase: string, context: Partial<RankingContext>) {
  const adapter = createTestChessAdapter(fen);
  const legalMoves = adapter.getLegalMoves();
  const parseResults = parseIntent(normalize(phrase));
  const raw = generateCandidates(parseResults, legalMoves);
  return rankCandidates(raw, { transcript: phrase, currentFen: fen, clarity: "fuzzy", ...context });
}

describe("MoveRanker — fixture corpus (full pipeline)", () => {
  for (const fixture of fixtures as Fixture[]) {
    const label = `"${fixture.phrase}"${fixture._comment ? ` — ${fixture._comment}` : ""}`;
    it(`${label} -> ${JSON.stringify(fixture.expected)}`, () => {
      const ranked = runFullPipeline(fixture.fen, fixture.phrase, fixture.context);
      const actual = ranked.map((r) => ({ san: r.san, score: r.score }));
      expect(actual).toEqual(fixture.expected);
    });
  }
});

describe("MoveRanker — genuine ambiguity is preserved, not silently broken", () => {
  it("ties two rook candidates at equal score rather than picking one", () => {
    const ranked = runFullPipeline("4k3/8/8/8/8/8/3K4/R6R w - - 0 1", "rook to e one", {});
    expect(ranked.length).toBe(2);
    expect(ranked[0].score).toBe(ranked[1].score);
  });
});

describe("MoveRanker — pawn-default tiebreak", () => {
  it("ranks a pawn above a non-pawn when both reach the same square and no piece was named", () => {
    // Knight on f2 and pawn on e3 can both reach e4.
    const ranked = runFullPipeline("4k3/8/8/8/8/4P3/5N2/4K3 w - - 0 1", "e4", { confidence: 0.9 });
    expect(ranked[0].san).toBe("e4");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("does not apply the pawn bonus when a piece WAS explicitly named", () => {
    // Even in a position where a pawn could theoretically also reach the
    // square, naming "knight" should filter to knight-only candidates
    // upstream (CandidateGenerator), so there's nothing left for the pawn
    // bonus to differentiate.
    const ranked = runFullPipeline(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "knight f3",
      { confidence: 0.9 },
    );
    expect(ranked.length).toBe(1);
    expect(ranked[0].score).toBe(0.9); // exactly confidence, no bonus applied
  });
});

describe("MoveRanker — score bounds and precision", () => {
  it("never produces a score above 1.0 even with confidence 1.0 plus the pawn bonus", () => {
    const ranked = runFullPipeline(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "e4",
      { confidence: 1.0 },
    );
    for (const r of ranked) {
      expect(r.score).toBeLessThanOrEqual(1.0);
    }
  });

  it("does not produce floating-point artifacts (e.g. 0.9500000000000001)", () => {
    const ranked = runFullPipeline("4k3/8/8/8/8/4P3/5N2/4K3 w - - 0 1", "e4", { confidence: 0.9 });
    const pawnCandidate = ranked.find((r) => r.san === "e4")!;
    expect(pawnCandidate.score).toBe(0.95);
  });
});

describe("MoveRanker — sort order", () => {
  it("sorts descending by score", () => {
    const ranked = runFullPipeline("4k3/8/8/8/8/4P3/5N2/4K3 w - - 0 1", "e4", { confidence: 0.9 });
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
  });
});

describe("MoveRanker — empty input", () => {
  it("returns an empty array when there are no candidates to rank", () => {
    const ranked = runFullPipeline(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "knight to a1",
      {},
    );
    expect(ranked).toEqual([]);
  });
});
