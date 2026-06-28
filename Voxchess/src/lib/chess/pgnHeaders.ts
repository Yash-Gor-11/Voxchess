/**
 * lib/chess/pgnHeaders.ts
 *
 * Reads PGN tag pairs only — no database, metadata, or UI knowledge,
 * and no fallback logic (that's gameCard.ts). Returns whatever's
 * actually in the PGN; missing tags are simply absent.
 *
 * Uses a small dedicated tag-pair parser instead of chess.js's
 * loadPgn(), since that validates/replays movetext and can throw on
 * malformed movetext even when the tag pairs are fine — irrelevant to
 * reading headers.
 *
 * Tag names come from pgnConstants.ts, not literals here, so this
 * reader and pgn.ts (the writer) can't drift on spelling.
 */

import { PGN_HEADERS } from "./pgnConstants";

export interface ParsedPgnHeaders {
  white?: string;
  black?: string;

  whiteElo?: string;
  blackElo?: string;

  whiteTitle?: string;
  blackTitle?: string;

  event?: string;
  site?: string;
  date?: string;
  round?: string;

  opening?: string;
  eco?: string;

  result?: string;
  termination?: string;

  setUp?: boolean;
  fen?: string;

  voxBotPersonality?: string;
  voxBotElo?: string;
  voxBotStrength?: string;
  voxVersion?: string;
}

/**
 * Matches a single PGN tag pair line, e.g.:
 *   [White "Yash"]
 *   [VoxBotElo "2300"]
 *
 * PGN tag pair grammar: a tag name (no quotes/spaces), then a
 * double-quoted value. Values may contain escaped quotes/backslashes
 * per the PGN spec (`\"` and `\\`), which the value group below allows
 * for and the unescape step resolves.
 */
const TAG_PAIR_RE = /^\s*\[([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]/;

/**
 * Tag names are case-sensitive in the PGN spec (and that's what
 * chess.js/VoxChess write), but we normalize the lookup key to lowercase
 * so a parser reading slightly-differently-cased third-party PGNs (e.g.
 * from an imported file) still maps onto the right field.
 */
function unescapeTagValue(raw: string): string {
  return raw.replace(/\\(.)/g, "$1");
}

/**
 * Maps a lowercased tag name to its ParsedPgnHeaders field. Built from
 * PGN_HEADERS rather than hardcoded literals, so there's one place
 * tag-name spelling lives. Partial<Record> since most strings aren't
 * valid keys — only the ones listed below have a value.
 */
const TAG_TO_FIELD: Partial<Record<string, keyof ParsedPgnHeaders>> = {
  [PGN_HEADERS.WHITE.toLowerCase()]: "white",
  [PGN_HEADERS.BLACK.toLowerCase()]: "black",
  [PGN_HEADERS.WHITE_ELO.toLowerCase()]: "whiteElo",
  [PGN_HEADERS.BLACK_ELO.toLowerCase()]: "blackElo",
  [PGN_HEADERS.WHITE_TITLE.toLowerCase()]: "whiteTitle",
  [PGN_HEADERS.BLACK_TITLE.toLowerCase()]: "blackTitle",
  [PGN_HEADERS.EVENT.toLowerCase()]: "event",
  [PGN_HEADERS.SITE.toLowerCase()]: "site",
  [PGN_HEADERS.DATE.toLowerCase()]: "date",
  [PGN_HEADERS.ROUND.toLowerCase()]: "round",
  [PGN_HEADERS.OPENING.toLowerCase()]: "opening",
  [PGN_HEADERS.ECO.toLowerCase()]: "eco",
  [PGN_HEADERS.RESULT.toLowerCase()]: "result",
  [PGN_HEADERS.TERMINATION.toLowerCase()]: "termination",
  [PGN_HEADERS.SET_UP.toLowerCase()]: "setUp",
  [PGN_HEADERS.FEN.toLowerCase()]: "fen",
  [PGN_HEADERS.VOX_BOT_PERSONALITY.toLowerCase()]: "voxBotPersonality",
  [PGN_HEADERS.VOX_BOT_ELO.toLowerCase()]: "voxBotElo",
  [PGN_HEADERS.VOX_BOT_STRENGTH.toLowerCase()]: "voxBotStrength",
  [PGN_HEADERS.VOX_VERSION.toLowerCase()]: "voxVersion",
};

/**
 * Parses every `[Tag "Value"]` pair into ParsedPgnHeaders. Unknown tags
 * are ignored; movetext is never inspected. No defaults or fallbacks —
 * that's gameCard.ts's job.
 */
export function parsePgnHeaders(pgn: string): ParsedPgnHeaders {
  const headers: ParsedPgnHeaders = {};
  if (!pgn) return headers;

  const lines = pgn.split(/\r?\n/);

  for (const line of lines) {
    const match = TAG_PAIR_RE.exec(line);
    if (!match) continue;

    const [, rawKey, rawValue] = match;
    const key = rawKey.toLowerCase();
    const value = unescapeTagValue(rawValue);

    const field = TAG_TO_FIELD[key];
    if (!field) {
      // Unknown/unsupported tag — ignored by design. This parser only
      // surfaces tags VoxChess actually consumes today; add an entry to
      // PGN_HEADERS and TAG_TO_FIELD (and a field on ParsedPgnHeaders)
      // when a new one matters.
      continue;
    }

    if (field === "setUp") {
      // PGN spec stores SetUp as the literal string "0" or "1".
      headers.setUp = value === "1";
    } else {
      // Every other field is a plain string; this cast is safe because
      // TAG_TO_FIELD never maps anything but SET_UP to "setUp".
      (headers as Record<string, string>)[field] = value;
    }
  }

  return headers;
}

/**
 * Counts full moves (e.g. "1. e4 e5" is one move) by counting White's
 * move-number markers ("1.", "2.", ...) in the movetext. Handles both
 * "1. e4" and minified "1.e4" spacing. Skips "..." (Black-resumption)
 * markers and ignores move-number-like text inside comments.
 *
 * Returns 0 for an empty/missing PGN or a PGN with no movetext.
 */
export function countMoves(pgn: string): number {
  if (!pgn) return 0;

  const withoutTags = pgn
    .split(/\r?\n/)
    .filter((line) => !/^\s*\[/.test(line))
    .join(" ");

  const withoutComments = withoutTags
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\$\d+/g, " ");

  // Anchored on a preceding start-of-string or whitespace so this
  // matches an actual move-number marker, not any digit-dot run that
  // happens to appear elsewhere. `(?!\.)` excludes "..." markers.
  const moveNumberMarkers = withoutComments.match(/(?:^|\s)\d+\.(?!\.)/g);

  return moveNumberMarkers ? moveNumberMarkers.length : 0;
}

/**
 * Counts half-moves (plies) in a PGN's movetext. Kept alongside
 * countMoves — analysis code may want plies specifically.
 *
 * Returns 0 for an empty/missing PGN or a PGN with no movetext.
 */
export function countPlies(pgn: string): number {
  if (!pgn) return 0;

  const withoutTags = pgn
    .split(/\r?\n/)
    .filter((line) => !/^\s*\[/.test(line))
    .join(" ");

  const withoutComments = withoutTags
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\$\d+/g, " ");

  // Strip the result marker so it's never counted as a move token.
  // Anchored on whitespace/start rather than \b, since \b doesn't work
  // before '*' (not a word character).
  const withoutResult = withoutComments.replace(
    /(?:^|\s)(1-0|0-1|1\/2-1\/2|\*)\s*$/,
    ""
  );

  const tokens = withoutResult.trim().split(/\s+/).filter(Boolean);

  let plies = 0;
  for (const token of tokens) {
    if (/^\d+\.+$/.test(token)) continue; // standalone move-number token
    const stripped = token.replace(/^\d+\.+/, ""); // glued "1.e4" -> "e4"
    if (!stripped) continue;
    plies++;
  }

  return plies;
}