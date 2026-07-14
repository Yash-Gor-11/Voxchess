// src/lib/voice/language/en/grammar.test.ts
//
// Run with: bun test
//
// Scope: this tests the predicates and pattern DATA in grammar.ts, not
// end-to-end move parsing — that's IntentParser.test.ts's job once
// IntentParser exists (Phase 2 Step 4). What's tested here is narrower but
// still real: (1) each predicate classifies tokens correctly in isolation,
// and (2) each declared pattern's slot shape actually matches the tokens a
// real Normalizer.normalize() call produces for the phrase it's meant to
// describe. That second check is what would catch a drift between grammar
// patterns and what Normalizer actually emits — e.g. if Normalizer's
// output shape changed and nobody updated grammar.ts to match.

import { describe, expect, it } from "bun:test";
import { normalize } from "../../intent/Normalizer";
import {
  GRAMMAR_PATTERNS,
  SLOT_PREDICATES,
  isCastleKingsideToken,
  isCastleQueensideToken,
  isFileToken,
  isPieceToken,
  isPromotionPieceToken,
  isRankToken,
  isTakesToken,
  isToToken,
  type GrammarPattern,
} from "./grammar";
import grammarShapeFixtures from "../../fixtures/parser/grammar-shapes.json";

// ── Predicate unit tests ─────────────────────────────────────────────────

describe("token predicates", () => {
  it("isPieceToken recognizes canonical piece words only", () => {
    expect(isPieceToken("knight")).toBe(true);
    expect(isPieceToken("pawn")).toBe(true);
    expect(isPieceToken("f")).toBe(false);
    expect(isPieceToken("takes")).toBe(false);
  });

  it("isFileToken recognizes a-h only", () => {
    expect(isFileToken("a")).toBe(true);
    expect(isFileToken("h")).toBe(true);
    expect(isFileToken("i")).toBe(false);
    expect(isFileToken("9")).toBe(false);
  });

  it("isRankToken accepts both digit and word form", () => {
    expect(isRankToken("4")).toBe(true);
    expect(isRankToken("four")).toBe(true);
    expect(isRankToken("9")).toBe(false); // no rank 9 in chess
    expect(isRankToken("knight")).toBe(false);
  });

  it("isTakesToken recognizes only the canonical capture token", () => {
    expect(isTakesToken("takes")).toBe(true);
    expect(isTakesToken("take")).toBe(false); // aliases.ts resolves this before grammar sees it
  });

  it("isToToken accepts all three preposition homophones", () => {
    expect(isToToken("to")).toBe(true);
    expect(isToToken("too")).toBe(true);
    expect(isToToken("two")).toBe(true);
    expect(isToToken("the")).toBe(false);
  });

  it("isPromotionPieceToken excludes king and pawn", () => {
    expect(isPromotionPieceToken("queen")).toBe(true);
    expect(isPromotionPieceToken("rook")).toBe(true);
    expect(isPromotionPieceToken("bishop")).toBe(true);
    expect(isPromotionPieceToken("knight")).toBe(true);
    expect(isPromotionPieceToken("king")).toBe(false);
    expect(isPromotionPieceToken("pawn")).toBe(false);
  });

  it("isCastleKingsideToken/isCastleQueensideToken only match their resolved tokens", () => {
    expect(isCastleKingsideToken("castle-kingside")).toBe(true);
    expect(isCastleKingsideToken("castle-queenside")).toBe(false);
    expect(isCastleQueensideToken("castle-queenside")).toBe(true);
  });
});

// ── Pattern-shape coherence: patterns vs. real Normalizer output ────────

/**
 * A deliberately simple greedy matcher — NOT the real IntentParser
 * algorithm. This exists only to confirm grammar.ts's pattern data is
 * shaped correctly against real token sequences; it does not handle
 * multi-pattern ambiguity resolution, which is IntentParser's job.
 */
function matchesPatternShape(tokens: string[], pattern: GrammarPattern): boolean {
  let ti = 0;
  for (const slot of pattern.slots) {
    const predicate = SLOT_PREDICATES[slot.type];
    if (ti < tokens.length && predicate(tokens[ti])) {
      ti++;
    } else if (!slot.optional) {
      return false;
    }
  }
  return ti === tokens.length;
}

interface GrammarShapeFixture {
  phrase: string;
  matchedPattern: string | null;
  _comment?: string;
}

describe("GRAMMAR_PATTERNS — fixture corpus (fixtures/parser/grammar-shapes.json)", () => {
  const fixtures = grammarShapeFixtures as GrammarShapeFixture[];

  for (const fixture of fixtures) {
    const label = `"${fixture.phrase}"${fixture._comment ? ` — ${fixture._comment}` : ""}`;
    it(`${label} -> ${fixture.matchedPattern ?? "no match"}`, () => {
      const tokens = normalize(fixture.phrase);
      const matches = GRAMMAR_PATTERNS.filter((p) => matchesPatternShape(tokens, p)).map((p) => p.id);

      if (fixture.matchedPattern === null) {
        expect(matches).toEqual([]);
      } else {
        expect(matches).toEqual([fixture.matchedPattern]);
      }
    });
  }

  // Phase 7 regression-corpus completeness check: every pattern grammar.ts
  // declares should have at least one positive fixture exercising it. This
  // is what would have caught grammar-shapes.json being stale (missing
  // capture-promotion coverage) automatically, rather than relying on
  // someone noticing the fixture file was orphaned.
  it("every declared pattern has at least one fixture covering it", () => {
    const coveredPatternIds = new Set(
      fixtures.filter((f) => f.matchedPattern !== null).map((f) => f.matchedPattern),
    );
    const uncovered = GRAMMAR_PATTERNS.map((p) => p.id).filter((id) => !coveredPatternIds.has(id));
    expect(uncovered).toEqual([]);
  });
});

describe("GRAMMAR_PATTERNS — priority ordering prevents shorter patterns swallowing longer ones", () => {
  // from-to-promotion's shape is a strict superset of from-to-move's shape
  // (same slots, plus a trailing promotionPiece). If a promotion phrase
  // were checked against from-to-move first, it would still match
  // from-to-move (the promotion piece token just gets left over / ignored
  // by a naive matcher) — so the ORDER patterns are tried in matters. This
  // test doesn't test IntentParser's ordering logic (Step 4 doesn't exist
  // yet) — it documents and locks in the array order in grammar.ts itself,
  // which is what IntentParser will rely on.
  it("from-to-promotion appears before from-to-move in GRAMMAR_PATTERNS", () => {
    const ids = GRAMMAR_PATTERNS.map((p) => p.id);
    expect(ids.indexOf("from-to-promotion")).toBeLessThan(ids.indexOf("from-to-move"));
  });
});

describe("GRAMMAR_PATTERNS — negative cases (should NOT match)", () => {
  it("a capture phrase does not match destination-move (missing takes)", () => {
    const tokens = normalize("knight takes e5");
    const destinationMove = GRAMMAR_PATTERNS.find((p) => p.id === "destination-move")!;
    expect(matchesPatternShape(tokens, destinationMove)).toBe(false);
  });

  it("a castle phrase does not match any square-based pattern", () => {
    const tokens = normalize("castle kingside");
    const squarePatterns = GRAMMAR_PATTERNS.filter((p) => p.id !== "castle-kingside" && p.id !== "castle-queenside");
    for (const pattern of squarePatterns) {
      expect(matchesPatternShape(tokens, pattern)).toBe(false);
    }
  });

  it("an incomplete phrase (piece with no square) matches nothing", () => {
    const tokens = normalize("knight");
    for (const pattern of GRAMMAR_PATTERNS) {
      expect(matchesPatternShape(tokens, pattern)).toBe(false);
    }
  });
});
