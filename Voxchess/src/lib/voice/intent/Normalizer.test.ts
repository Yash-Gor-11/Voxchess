// src/lib/voice/intent/Normalizer.test.ts
//
// Run with: bun test
//
// Fixture-driven per v3 blueprint §11 — every case here is verified against
// the real implementation output before being committed (see commit notes),
// not hand-derived from reading the code. That verification step is what
// caught the castle-phrase substring bug during development (see
// Normalizer.ts's CASTLE_PHRASE_REGEX comment) — a fixture built from
// actual output would have masked that bug, so these fixtures were checked
// against expected linguistic behavior first, then run against the fixed
// implementation to confirm agreement.

import { describe, expect, it } from "bun:test";
import { normalize } from "./Normalizer";
import basicFixtures from "../fixtures/parser/normalizer-basic.json";
import homophoneFixtures from "../fixtures/parser/homophones.json";

interface Fixture {
  transcript: string;
  expected: string[];
  _comment?: string;
}

describe("Normalizer.normalize — basic tokenization", () => {
  for (const fixture of basicFixtures as Fixture[]) {
    it(`"${fixture.transcript}" -> ${JSON.stringify(fixture.expected)}`, () => {
      expect(normalize(fixture.transcript)).toEqual(fixture.expected);
    });
  }
});

describe("Normalizer.normalize — homophones and castle phrases", () => {
  for (const fixture of homophoneFixtures as Fixture[]) {
    it(`${fixture._comment ?? ""} "${fixture.transcript}" -> ${JSON.stringify(fixture.expected)}`, () => {
      expect(normalize(fixture.transcript)).toEqual(fixture.expected);
    });
  }
});

describe("Normalizer.normalize — regression: castle phrase substring bug", () => {
  // This exact case is the one that broke during development: sequential
  // substring replacement corrupted "castle-kingside" back into
  // ["castle", "-kingside"] because "castle" (bare) matched as a substring
  // inside the already-replaced token. Kept as an explicit standalone test,
  // not just a fixture entry, since it's the highest-value regression check
  // in this file.
  it("does not corrupt an already-replaced castle token", () => {
    expect(normalize("castle kingside")).toEqual(["castle-kingside"]);
    expect(normalize("castle queenside")).toEqual(["castle-queenside"]);
  });

  it("resolves the longer O-O-O phrase before the shorter O-O prefix", () => {
    expect(normalize("O O O")).toEqual(["castle-queenside"]);
    expect(normalize("O O")).toEqual(["castle-kingside"]);
  });
});

describe("Normalizer.normalize — the 'a' filler-word collision guard", () => {
  // "a" is both a common filler/article AND the a-file letter. aliases.ts
  // deliberately excludes "a"/"an" from FILLER_WORDS to avoid eating a
  // legal file letter. This test guards that decision directly.
  it("does not strip a bare 'a' as filler when it's the a-file letter", () => {
    expect(normalize("rook a one")).toEqual(["rook", "a", "one"]);
  });
});

describe("Normalizer.normalize — edge cases", () => {
  it("returns an empty array for an empty transcript", () => {
    expect(normalize("")).toEqual([]);
  });

  it("returns an empty array for a whitespace-only transcript", () => {
    expect(normalize("   ")).toEqual([]);
  });

  it("splits combined alphanumeric ASR output like 'e5' into separate tokens", () => {
    expect(normalize("pawn e5")).toEqual(["pawn", "e", "5"]);
  });
});
