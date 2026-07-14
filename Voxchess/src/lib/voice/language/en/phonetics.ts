// src/lib/voice/language/en/phonetics.ts
//
// The full NATO phonetic alphabet, kept as a standalone reference distinct
// from aliases.ts. Only a–h feed into FILE_LETTER_ALIASES today (chess has
// no files beyond h), but the full table is kept here rather than trimmed,
// since command/UI-affordance phrases in later phases (e.g. spelling out
// something in an error message) may want the complete set, and a partial
// NATO table is a worse foundation to build on than a complete one.

export const NATO_ALPHABET: Readonly<Record<string, string>> = {
  a: "alpha",
  b: "bravo",
  c: "charlie",
  d: "delta",
  e: "echo",
  f: "foxtrot",
  g: "golf",
  h: "hotel",
  i: "india",
  j: "juliett",
  k: "kilo",
  l: "lima",
  m: "mike",
  n: "november",
  o: "oscar",
  p: "papa",
  q: "quebec",
  r: "romeo",
  s: "sierra",
  t: "tango",
  u: "uniform",
  v: "victor",
  w: "whiskey",
  x: "xray",
  y: "yankee",
  z: "zulu",
};

/** Reverse lookup: NATO word -> letter. Built once, not per-call. */
export const NATO_WORD_TO_LETTER: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(NATO_ALPHABET).map(([letter, word]) => [word, letter]),
);

/** The subset of the alphabet chess actually uses (a-h). */
export const CHESS_FILE_LETTERS: readonly string[] = ["a", "b", "c", "d", "e", "f", "g", "h"];
