// src/lib/voice/intent/Normalizer.ts
//
// Pure function: transcript string -> normalized token array. No grammar,
// no chess.js, no ambiguity resolution. See language/en/aliases.ts for the
// scope boundary between "spelling noise" (resolved here) and "grammar
// ambiguity" (deliberately left for IntentParser).
//
// Per the v3 blueprint's dependency rules (§5.0), this module sits in the
// `intent/` layer and must not import from `matching/`, `confirmation/`,
// `controller/`, or `adapters/ChessAdapter`.

import {
  CAPTURE_ALIASES,
  CASTLE_PHRASE_ALIASES,
  FILE_LETTER_ALIASES,
  FILLER_WORDS,
  NUMBER_WORD_ALIASES,
  PIECE_ALIASES,
} from "../language/en/aliases";

/**
 * Multi-word castle phrases must be matched before single-word tokenization
 * splits them apart. Sorted longest (by word count) first, then compiled
 * into a single alternation regex — NOT applied as sequential independent
 * replacements. Sequential replacement is unsafe here: after "castle
 * kingside" -> "castle-kingside", a later single-word "castle" entry would
 * match as a *substring* inside the already-replaced token and corrupt it
 * (this was caught by fixture testing, not by inspection — see
 * Normalizer.test.ts). A single regex pass with word boundaries, tried in
 * longest-first order, avoids re-scanning already-replaced text.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CASTLE_PHRASES_BY_LENGTH: readonly string[] = Object.keys(CASTLE_PHRASE_ALIASES).sort(
  (a, b) => b.split(" ").length - a.split(" ").length,
);

const CASTLE_PHRASE_REGEX = new RegExp(
  `\\b(${CASTLE_PHRASES_BY_LENGTH.map(escapeRegExp).join("|")})\\b`,
  "g",
);

/**
 * Splits a combined alphanumeric token like "e5" or "f3" into ["e", "5"].
 * Web Speech API transcripts are usually spoken-word ("e five"), but some
 * ASR configurations or literal-digit speech produce combined tokens, and
 * downstream grammar (IntentParser) expects file and rank as separate
 * tokens either way.
 */
function splitAlphaNumeric(word: string): string[] {
  const match = word.match(/^([a-h])([1-8])$/);
  if (match) return [match[1], match[2]];
  return [word];
}

/**
 * Applies the single-word alias tables, in a fixed priority order. A word
 * only ever matches one table — piece names, file letters, and number
 * words don't overlap in practice, but the order is still meaningful for
 * maintainability: piece names first since they're the least ambiguous,
 * then file letters, then numbers.
 */
function applyWordAliases(word: string): string {
  if (word in PIECE_ALIASES) return PIECE_ALIASES[word];
  if (word in FILE_LETTER_ALIASES) return FILE_LETTER_ALIASES[word];
  if (word in NUMBER_WORD_ALIASES) return NUMBER_WORD_ALIASES[word];
  if (word in CAPTURE_ALIASES) return CAPTURE_ALIASES[word];
  return word;
}

/**
 * normalize(transcript) -> string[]
 *
 * Pipeline:
 *   1. Lowercase, strip punctuation (keep only letters, digits, spaces).
 *   2. Collapse whitespace.
 *   3. Match and replace known multi-word castle phrases first (as single
 *      hyphenated tokens: "castle-kingside" / "castle-queenside").
 *   4. Split the remainder into words.
 *   5. Drop filler words.
 *   6. Split any combined alphanumeric words ("e5" -> "e", "5").
 *   7. Apply single-word alias tables (piece/file/number/capture spelling
 *      normalization).
 *
 * Deliberately NOT done here (see aliases.ts header for rationale):
 *   - Resolving "to" vs "two" vs "too" — left as-is for IntentParser.
 *   - Converting number words to digits — grammar's job, not tokenization's.
 *   - Any legality/chess.js awareness.
 */
export function normalize(transcript: string): string[] {
  if (!transcript) return [];

  let working = transcript.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  if (!working) return [];

  // Step 3: multi-word castle phrases, single pass, longest-match-first
  // (see CASTLE_PHRASE_REGEX comment above for why this must be one pass).
  working = working
    .replace(CASTLE_PHRASE_REGEX, (match) => ` ${CASTLE_PHRASE_ALIASES[match]} `)
    .replace(/\s+/g, " ")
    .trim();

  const rawWords = working.split(" ");

  const tokens: string[] = [];
  for (const word of rawWords) {
    if (!word) continue;
    if (word.startsWith("castle-")) {
      // Already-resolved castle token from step 3 — pass through untouched.
      tokens.push(word);
      continue;
    }
    if (FILLER_WORDS.has(word)) continue;

    for (const piece of splitAlphaNumeric(word)) {
      tokens.push(applyWordAliases(piece));
    }
  }

  return tokens;
}
