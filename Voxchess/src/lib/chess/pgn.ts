/**
 * lib/chess/pgn.ts
 *
 * Single source of truth for every PGN modification performed by VoxChess.
 *
 * The PGN produced here is the CANONICAL PGN stored in the database — not an
 * "export format." It must be complete and standards-compliant the moment a
 * game is saved, so that export/copy/download/re-import/display can all just
 * read `game.pgn` straight out of the DB with zero further processing.
 *
 * Hard rule: never manipulate PGN strings with regex or manual string
 * replacement. All changes go through chess.js's header API
 * (setHeader / removeHeader / getHeaders / pgn()).
 *
 * No PGN modification logic should exist anywhere else in the project.
 * Every future PGN enhancement (export, copy, download, normalization,
 * additional headers) belongs in this file.
 *
 * `preparePlatformPgn` is idempotent: conditionally-present headers
 * (Termination, ECO, Opening) are explicitly set-or-removed on every call,
 * so calling it twice on the same Chess instance — even as game state
 * changes between calls (e.g. ongoing → completed) — produces a correct
 * result rather than accumulating stale headers from a previous call.
 * Always-present headers (standard tags, Vox metadata) use a plain
 * setHeader, since chess.js overwrites existing values and removal would
 * add nothing.
 *
 * Note: this mutates the Chess instance passed in (it sets headers
 * directly on it) before reading back `chess.pgn()`.
 *
 * Header order in the output PGN is whatever chess.js's own pgn() method
 * produces — this is intentional. The goal is valid, standards-compliant,
 * readable PGN, not byte-for-byte visual matching of any particular layout.
 * Don't fight the library over cosmetic ordering.
 */

import type { Chess } from "chess.js";
import type { OpeningResult } from "./openings";
import { APP_VERSION } from "./constants";

export type GameResult = "white" | "black" | "draw" | "ongoing";
export type PlayerColor = "w" | "b";

export interface PreparePlatformPgnOptions {
  result: GameResult;
  playerColor: PlayerColor;
  playerName: string;
  /**
   * The bot's display name, used both for the White/Black header and for
   * VoxBotPersonality. VoxChess currently has one name per bot — character,
   * personality, and display name are all the same string today, so there's
   * nothing to gain by tracking them separately. If a bot ever has a fixed
   * character with a separately configurable personality (e.g. "Sterling"
   * the character running an "Aggressive" personality preset), introduce a
   * distinct field then rather than duplicating this value under two names
   * now.
   */
  botDisplayName: string;
  /** Resolved Elo number, e.g. 2300 — never the internal eloIndex. */
  botElo: number;
  /** Resolved strength label from ELO_CONFIG, e.g. "Candidate Master". */
  botStrength: string;
  /** Result of detectOpening(fenHistory). May be null/undefined if none found. */
  opening?: OpeningResult | null;
  /**
   * PGN Event tag. Defaults to "VoxChess Bot Game". Override for other
   * game contexts as they're added (Analysis Position, Imported Game,
   * Study Chapter, Human vs Human) without touching this utility.
   */
  event?: string;
}

const DEFAULT_EVENT = "VoxChess Bot Game";

/**
 * Converts the DB's objective result representation into a PGN Result tag.
 * Independent of player color by design — "white"/"black" here refer to
 * the chess color that won, not which side the human played.
 */
function resultToPgn(result: GameResult): "1-0" | "0-1" | "1/2-1/2" | "*" {
  switch (result) {
    case "white":
      return "1-0";
    case "black":
      return "0-1";
    case "draw":
      return "1/2-1/2";
    case "ongoing":
      return "*";
  }
}

/** PGN date format: YYYY.MM.DD */
function formatPgnDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

/**
 * Builds the finished, canonical PGN for a VoxChess game.
 *
 * Applies, in order:
 *   1. Standard Seven Tag Roster headers
 *   2. Termination (only for completed games)
 *   3. Opening headers (ECO / Opening) — omitted entirely if unknown
 *   4. VoxChess-specific metadata headers
 *
 * Conditionally-present headers (Termination, ECO, Opening) are explicitly
 * set-or-removed so the function stays idempotent on a given Chess instance
 * even across changing game state (e.g. ongoing → completed).
 *
 * Mutates the supplied Chess instance by updating its PGN headers before
 * serializing it via chess.pgn(). The instance passed in is not left
 * unchanged — callers relying on its prior header state should read that
 * state before calling this function.
 *
 * Returns the final PGN string via chess.js's own `game.pgn()` — never
 * hand-assembled. Header ORDER in that string is whatever chess.js
 * produces; only the header CONTENTS are this function's responsibility.
 */
export function preparePlatformPgn(
  chess: Chess,
  options: PreparePlatformPgnOptions
): string {
  const {
    result,
    playerColor,
    playerName,
    botDisplayName,
    botElo,
    botStrength,
    opening,
    event = DEFAULT_EVENT,
  } = options;

  // --- Standard Seven Tag Roster ---------------------------------------
  chess.setHeader("Event", event);
  chess.setHeader("Site", "VoxChess");
  chess.setHeader("Date", formatPgnDate(new Date()));
  chess.setHeader("Round", "-");

  if (playerColor === "w") {
    chess.setHeader("White", playerName);
    chess.setHeader("Black", botDisplayName);
  } else {
    chess.setHeader("White", botDisplayName);
    chess.setHeader("Black", playerName);
  }

  chess.setHeader("Result", resultToPgn(result));

  // --- Termination -------------------------------------------------------
  // Only meaningful once the game has actually concluded. With no clocks,
  // no PvP, and no abandonment handling yet, "Normal" covers every
  // completed game. Omit entirely for in-progress games (Result "*").
  if (result !== "ongoing") {
    chess.setHeader("Termination", "Normal");
  } else {
    chess.removeHeader("Termination");
  }

  // --- Opening -------------------------------------------------------
  // Never reconstruct/replay the game here — `opening` is the output of
  // the project's existing detectOpening(fenHistory), passed in as-is.
  if (opening?.eco) {
    chess.setHeader("ECO", opening.eco);
  } else {
    chess.removeHeader("ECO");
  }

  if (opening?.name) {
    chess.setHeader("Opening", opening.name);
  } else {
    chess.removeHeader("Opening");
  }

  // --- VoxChess metadata -------------------------------------------------
  // Resolved, display-facing values only. Never internal engine
  // implementation details (eloIndex, depth, movetime, skillLevel,
  // MultiPV, delay, cpTolerance, blunderRate, errorRate, etc.).
  //
  // APP_VERSION comes from the project's single version source — callers
  // of preparePlatformPgn never need to know this header exists, let
  // alone supply a value for it.
  //
  // These headers are always present (unlike Termination/ECO/Opening,
  // which are conditional), so a plain setHeader is sufficient — same as
  // the standard White/Black/Event/Site/Round headers above.
  chess.setHeader("VoxBotPersonality", botDisplayName);
  chess.setHeader("VoxBotElo", String(botElo));
  chess.setHeader("VoxBotStrength", botStrength);
  chess.setHeader("VoxVersion", APP_VERSION);

  return chess.pgn();
}