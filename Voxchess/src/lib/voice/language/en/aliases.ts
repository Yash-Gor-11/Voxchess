// src/lib/voice/language/en/aliases.ts
//
import { CHESS_FILE_LETTERS, NATO_ALPHABET } from "./phonetics";
//
// Pure data. No parsing logic lives here — see intent/Normalizer.ts for how
// these are applied, and intent/IntentParser.ts (§5.5 of the v3 blueprint)
// for grammar-level interpretation.
//
// Scope boundary (deliberate): this file resolves ASR *spelling noise* —
// homophones and mis-transcriptions of a single word — not grammar
// ambiguity. For example "won" is always a mis-hearing of "one", so it's
// resolved here. But "to" is genuinely ambiguous between the preposition
// ("knight to f3") and a mis-hearing of "two" (a rank digit) — that
// ambiguity is structural, not a spelling variant, and resolving it
// requires knowing where the word sits in the grammar. So "to"/"too"/"two"
// are deliberately NOT collapsed into one canonical token here; IntentParser
// decides based on position. This is also why v3 §11 lists "to" vs "two" as
// a dedicated regression fixture rather than something Normalizer should
// have already erased.

/**
 * Chess piece name homophones/mis-transcriptions → canonical piece word.
 * Canonical words are the full piece names (not SAN letters) — SAN
 * conversion happens in IntentParser/grammar, not here.
 */
export const PIECE_ALIASES: Record<string, string> = {
  knight: "knight",
  night: "knight",
  nite: "knight",
  kn: "knight",

  bishop: "bishop",
  bish: "bishop",

  rook: "rook",
  rock: "rook",
  rooke: "rook",

  queen: "queen",
  quean: "queen",

  king: "king",

  pawn: "pawn",
  porn: "pawn", // common ASR mis-hearing, unfortunately
  pond: "pawn",
};

/**
 * Board-file letter homophones/spellings → canonical single letter (a–h).
 * Built from the shared NATO table (phonetics.ts) plus extra plain-letter
 * mis-hearings ("bee", "sea") that aren't NATO words but are common ASR
 * output. Only a–h are populated; chess has no files beyond h.
 */
const EXTRA_FILE_LETTER_HOMOPHONES: Record<string, string> = {
  a: "a",
  ay: "a",
  b: "b",
  bee: "b",
  be: "b",
  c: "c",
  see: "c",
  sea: "c",
  d: "d",
  dee: "d",
  e: "e",
  ee: "e",
  f: "f",
  eff: "f",
  g: "g",
  gee: "g",
  h: "h",
  aitch: "h",
  h8: "h", // seen in the wild from ASR "aitch" -> "h8" auto-correct chains
};

export const FILE_LETTER_ALIASES: Record<string, string> = {
  ...Object.fromEntries(
    CHESS_FILE_LETTERS.map((letter) => [NATO_ALPHABET[letter], letter]),
  ),
  ...EXTRA_FILE_LETTER_HOMOPHONES,
};

/**
 * Number-word homophones/spellings → canonical number word (NOT digit —
 * digit conversion is a grammar-level concern, see file header). Covers
 * ranks 1-8 only, since that's the full range chess needs.
 */
export const NUMBER_WORD_ALIASES: Record<string, string> = {
  one: "one",
  won: "one",
  wun: "one",

  two: "two",
  // "to" and "too" intentionally excluded — see file header.

  three: "three",
  tree: "three",

  four: "four",
  for: "four",
  fore: "four",

  five: "five",

  six: "six",
  sicks: "six",

  seven: "seven",

  eight: "eight",
  ate: "eight",
};

/**
 * Capture-intent words → canonical "takes". "x" is included since some
 * ASR configurations transcribe a spoken "takes" or emphasized capture
 * as a literal letter x in casual speech patterns.
 */
export const CAPTURE_ALIASES: Record<string, string> = {
  takes: "takes",
  take: "takes",
  captures: "takes",
  capture: "takes",
  x: "takes",
};

/**
 * Castling phrase homophones → canonical castle-direction tokens.
 * These map multi-word phrases; Normalizer handles the multi-word
 * matching before falling back to single-word alias lookup.
 */
export const CASTLE_PHRASE_ALIASES: Record<string, string> = {
  castle: "castle",
  "castle kingside": "castle-kingside",
  "short castle": "castle-kingside",
  "castle king side": "castle-kingside",
  "o o": "castle-kingside",
  "castle queenside": "castle-queenside",
  "long castle": "castle-queenside",
  "castle queen side": "castle-queenside",
  "o o o": "castle-queenside",
};

/**
 * Filler words stripped entirely during normalization — they carry no
 * grammatical content for move or command parsing.
 */
// NOTE: "a" and "an" are deliberately NOT in this list. "a" collides with
// the a-file letter alias above ("rook a one" must not lose its "a"), and
// resolving that collision correctly requires grammar-level position
// awareness that Normalizer (a pure, context-free function) doesn't have.
// Rather than add positional guard logic to a function that's supposed to
// stay simple, the safer default is to never strip "a"/"an" at all — a
// stray article reaching IntentParser is harmless noise; an eaten file
// letter is a silent correctness bug.
export const FILLER_WORDS: ReadonlySet<string> = new Set([
  "um",
  "uh",
  "uhh",
  "erm",
  "like",
  "please",
  "the",
  "okay",
  "ok",
  "so",
]);
