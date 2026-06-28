/**
 * lib/chess/pgn.ts
 *
 * Single source of truth for PGN writes. The PGN produced here is the
 * canonical PGN stored in the database, not an export format — export/
 * copy/download/display should all read `game.pgn` as-is.
 *
 * Never manipulate PGN strings directly; go through chess.js's header
 * API (setHeader / removeHeader / pgn()). No PGN-writing logic should
 * exist anywhere else in the project.
 *
 * preparePlatformPgn mutates the Chess instance it's given (sets
 * headers on it) and is idempotent: conditional headers (Termination,
 * ECO, Opening) are set-or-removed each call so re-running it as game
 * state changes (e.g. ongoing → completed) doesn't leave stale headers.
 *
 * Header ORDER in the output is whatever chess.js's pgn() produces —
 * intentional; don't fight the library over cosmetic ordering.
 */

import type { Chess } from "chess.js";
import type { OpeningResult } from "./openings";
import { APP_VERSION } from "./constants";
import { PGN_HEADERS } from "./pgnConstants";

export type GameResult = "white" | "black" | "draw" | "ongoing";
export type PlayerColor = "w" | "b";

export interface PreparePlatformPgnOptions {
  result: GameResult;
  playerColor: PlayerColor;
  playerName: string;
  /**
   * Used for both the White/Black header and VoxBotPersonality —
   * character, personality, and display name are all one string today.
   * Split into separate fields only if that ever stops being true.
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
 * Builds the finished, canonical PGN for a VoxChess game: standard
 * headers, Termination (completed games only), Opening/ECO (if known),
 * and VoxChess metadata. Mutates `chess`, then returns chess.pgn().
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
  chess.setHeader(PGN_HEADERS.EVENT, event);
  chess.setHeader(PGN_HEADERS.SITE, "VoxChess");
  chess.setHeader(PGN_HEADERS.DATE, formatPgnDate(new Date()));
  chess.setHeader(PGN_HEADERS.ROUND, "-");

  if (playerColor === "w") {
    chess.setHeader(PGN_HEADERS.WHITE, playerName);
    chess.setHeader(PGN_HEADERS.BLACK, botDisplayName);
  } else {
    chess.setHeader(PGN_HEADERS.WHITE, botDisplayName);
    chess.setHeader(PGN_HEADERS.BLACK, playerName);
  }

  chess.setHeader(PGN_HEADERS.RESULT, resultToPgn(result));

  // Termination only applies once the game has concluded; omit for
  // in-progress games. "Normal" covers every completed game today
  // (no clocks, no PvP, no abandonment handling yet).
  if (result !== "ongoing") {
    chess.setHeader(PGN_HEADERS.TERMINATION, "Normal");
  } else {
    chess.removeHeader(PGN_HEADERS.TERMINATION);
  }

  // `opening` is detectOpening(fenHistory)'s output, passed in as-is —
  // never reconstructed or replayed here.
  if (opening?.eco) {
    chess.setHeader(PGN_HEADERS.ECO, opening.eco);
  } else {
    chess.removeHeader(PGN_HEADERS.ECO);
  }

  if (opening?.name) {
    chess.setHeader(PGN_HEADERS.OPENING, opening.name);
  } else {
    chess.removeHeader(PGN_HEADERS.OPENING);
  }

  // Resolved, display-facing values only — never internal engine
  // implementation details (eloIndex, depth, skillLevel, etc).
  chess.setHeader(PGN_HEADERS.VOX_BOT_PERSONALITY, botDisplayName);
  chess.setHeader(PGN_HEADERS.VOX_BOT_ELO, String(botElo));
  chess.setHeader(PGN_HEADERS.VOX_BOT_STRENGTH, botStrength);
  chess.setHeader(PGN_HEADERS.VOX_VERSION, APP_VERSION);

  return chess.pgn();
}