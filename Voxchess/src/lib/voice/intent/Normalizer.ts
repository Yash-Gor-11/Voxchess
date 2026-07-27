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
 * Splits compact SAN-style capture notation like "gxh8" or "exd5" into
 * ["takes", destFile, destRank] -- e.g. "gxh8" -> ["takes", "h", "8"].
 *
 * Deliberately DISCARDS the origin file (the "g" in "gxh8") rather than
 * trying to preserve it as an origin-square disambiguation hint. Properly
 * supporting that would require a genuinely new capability -- matching a
 * candidate by origin FILE ONLY, with no rank -- which CandidateGenerator
 * does not do today (it matches by full square or not at all). Adding
 * that is out of scope here: it would mean changing CandidateGenerator's
 * matching behavior, which this pass is explicitly required to leave
 * alone. Discarding the origin file instead means "gxh8 queen" behaves
 * exactly like the already-supported bare "takes h8 queen" -- correct
 * when only one piece can capture there, and gracefully falling back to
 * the existing ambiguity-confirmation flow (not a new one) when it can't
 * be resolved from the destination alone.
 *
 * Checked before splitAlphaNumeric since this is a longer, more specific
 * shape (4 characters: file + x + file + digit) that would otherwise
 * fall through unmatched (splitAlphaNumeric only handles the 2-character
 * file+digit case).
 */
function splitCompactCapture(word: string): string[] | null {
  const match = word.match(/^([a-h])x([a-h])([1-8])$/);
  if (!match) return null;
  return ["takes", match[2], match[3]];
}

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

    const compactCapture = splitCompactCapture(word);
    for (const piece of compactCapture ?? splitAlphaNumeric(word)) {
      tokens.push(applyWordAliases(piece));
    }
  }

  return tokens;
}
