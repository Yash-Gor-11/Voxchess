/**
 * lib/chess/pgnConstants.ts
 *
 * Single source of truth for PGN tag NAMES (the string inside
 * `[TagName "value"]`), shared between pgn.ts (writer) and
 * pgnHeaders.ts (reader).
 *
 * Without this, the same string literal ("VoxBotElo", "Opening", etc.)
 * has to be typed correctly in two unrelated files, and nothing catches
 * a typo or a future rename in one of them. Importing from here means a
 * rename is a one-line change instead of a search-and-replace across the
 * writer and reader.
 *
 * This file knows nothing about chess.js, the database, or React — it's
 * just names.
 */

export const PGN_HEADERS = {
  // Standard Seven Tag Roster
  EVENT: "Event",
  SITE: "Site",
  DATE: "Date",
  ROUND: "Round",
  WHITE: "White",
  BLACK: "Black",
  RESULT: "Result",

  // Common optional standard tags VoxChess writes/reads
  WHITE_ELO: "WhiteElo",
  BLACK_ELO: "BlackElo",
  WHITE_TITLE: "WhiteTitle",
  BLACK_TITLE: "BlackTitle",
  TERMINATION: "Termination",
  ECO: "ECO",
  OPENING: "Opening",
  SET_UP: "SetUp",
  FEN: "FEN",

  // VoxChess-specific tags
  VOX_BOT_PERSONALITY: "VoxBotPersonality",
  VOX_BOT_ELO: "VoxBotElo",
  VOX_BOT_STRENGTH: "VoxBotStrength",
  VOX_VERSION: "VoxVersion",
} as const;

export type PgnHeaderName = (typeof PGN_HEADERS)[keyof typeof PGN_HEADERS];