// src/lib/voice/intent/IntentParser.test.ts
//
// Run with: bun test
//
// Every fixture here was validated against the real parseIntent() output
// before being committed to this file — not hand-derived from reading the
// code. See the harness output referenced in the Phase 2 completion notes
// if you want to re-verify independently.

import { describe, expect, it } from "bun:test";
import { normalize } from "./Normalizer";
import { parseIntent } from "./IntentParser";
import type { ParseResult } from "../types";

import basicFixtures from "../fixtures/parser/intent-basic.json";
import captureFixtures from "../fixtures/parser/intent-captures.json";
import promotionFixtures from "../fixtures/parser/intent-promotion.json";
import castlingFixtures from "../fixtures/parser/intent-castling.json";

interface Fixture {
  phrase: string;
  expected?: Partial<ParseResult>;
  expectedNoMatch?: boolean;
  _comment?: string;
}

function runFixtureGroup(name: string, fixtures: Fixture[]) {
  describe(name, () => {
    for (const fixture of fixtures) {
      const label = `"${fixture.phrase}"${fixture._comment ? ` — ${fixture._comment}` : ""}`;

      if (fixture.expectedNoMatch) {
        it(`${label} -> no match`, () => {
          const tokens = normalize(fixture.phrase);
          expect(parseIntent(tokens)).toEqual([]);
        });
        continue;
      }

      it(`${label} -> ${JSON.stringify(fixture.expected)}`, () => {
        const tokens = normalize(fixture.phrase);
        const results = parseIntent(tokens);
        expect(results.length).toBe(1);
        expect(results[0]).toMatchObject(fixture.expected!);
      });
    }
  });
}

runFixtureGroup("IntentParser — destination and from-to moves", basicFixtures as Fixture[]);
runFixtureGroup("IntentParser — captures", captureFixtures as Fixture[]);
runFixtureGroup("IntentParser — promotion (destination-form and capture-promotion)", promotionFixtures as Fixture[]);
runFixtureGroup("IntentParser — castling", castlingFixtures as Fixture[]);

describe("IntentParser — determinism invariant", () => {
  // parseIntent's ParseResult[] return type is an array for architectural
  // reasons (a future grammar addition could reintroduce genuine
  // ambiguity), but with the CURRENT grammar it should never return more
  // than one match for any input — see the determinism note at the top of
  // IntentParser.ts for why that's currently guaranteed. This test locks
  // that property in so a future pattern addition that breaks it fails
  // loudly here, not as a confusing downstream bug in matching/.
  const allPhrases = [
    ...(basicFixtures as Fixture[]),
    ...(captureFixtures as Fixture[]),
    ...(promotionFixtures as Fixture[]),
    ...(castlingFixtures as Fixture[]),
  ].map((f) => f.phrase);

  for (const phrase of allPhrases) {
    it(`"${phrase}" yields at most one ParseResult`, () => {
      const tokens = normalize(phrase);
      expect(parseIntent(tokens).length).toBeLessThanOrEqual(1);
    });
  }
});

describe("IntentParser — scope boundary: from-square + capture + promotion", () => {
  // Deliberately out of scope per v3 §11 ("destination-square form only"
  // for promotion fixtures). This is a documented gap, not an oversight —
  // see intent-promotion.json's expectedNoMatch entry and grammar.ts's
  // pattern list (no pattern covers this six-token shape).
  it("does not match an explicit origin square combined with capture and promotion", () => {
    const tokens = normalize("d7 takes e8 queen");
    expect(parseIntent(tokens)).toEqual([]);
  });
});

describe("IntentParser — negative and edge cases", () => {
  it("returns [] for an empty token array", () => {
    expect(parseIntent([])).toEqual([]);
  });

  it("returns [] for an incomplete phrase (piece with no square)", () => {
    const tokens = normalize("knight");
    expect(parseIntent(tokens)).toEqual([]);
  });

  it("returns [] for unrecognized gibberish", () => {
    const tokens = normalize("gibberish nonsense");
    expect(parseIntent(tokens)).toEqual([]);
  });

  it("distinguishes explicit 'pawn' (piece: 'P') from an omitted piece word (piece: null)", () => {
    const withPawn = parseIntent(normalize("pawn e4"));
    const withoutPawn = parseIntent(normalize("e4"));
    expect(withPawn[0].piece).toBe("P");
    expect(withoutPawn[0].piece).toBeNull();
    // Both should agree on the destination square regardless.
    expect(withPawn[0].to).toEqual(withoutPawn[0].to);
  });
});
