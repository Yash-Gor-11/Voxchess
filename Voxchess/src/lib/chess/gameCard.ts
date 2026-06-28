/**
 * lib/chess/gameCard.ts
 *
 * Converts a database Game row into UI-ready GameCardData. pgn.ts only
 * writes, pgnHeaders.ts only reads — all fallback logic lives here,
 * resolved field-by-field (PGN -> metadata -> DB -> derived), not by
 * branching on "old game vs new game." GameCardData is domain data, not
 * presentation data (no whiteSubtitle, no isBot, no routing fields like
 * sourceType/studyId). Never mutates the Game it's given.
 *
 * `metadata.White`/`Black`/`Event`/`Date` are legacy PGN-header-style
 * fields from imports that predate rich VoxBot* headers. They're real
 * fallbacks, never primary — PGN headers always win when present.
 */

import type { Game, GameMetadata } from "@/lib/supabase/games";
import { parsePgnHeaders, countMoves, type ParsedPgnHeaders } from "./pgnHeaders";
import { getPersonality, ELO_CONFIG, ELO_VALUES } from "./personalities";
import type { PersonalityId, EloValue } from "./personalities";

export type { Game, GameMetadata };

/** The vocabulary GameCardData.result uses, regardless of source. */
export type SemanticResult = "white" | "black" | "draw" | "ongoing";

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

/** Everything a card needs about one side. The React layer decides layout. */
export interface PlayerInfo {
  /** Display name, e.g. "Yash" or "Sterling". */
  name?: string;
  /**
   * Elo, e.g. 2300 — a bot's engine-strength rating. Named `elo` (not
   * `rating`) since that's what this concretely is today; a future
   * human online rating would be a different concept and field.
   */
  elo?: number;
  /**
   * Resolved strength label, e.g. "Candidate Master". Kept even though
   * it's derivable from `elo`: pgn.ts freezes this into the PGN at save
   * time, so if ELO_CONFIG's labels are ever renamed later, old games
   * keep showing the label they actually earned.
   */
  strength?: string;
  /** FIDE-style title, e.g. "GM" — only if the PGN carries it. */
  title?: string;
}

export interface GameCardData {
  id: string;

  white: PlayerInfo;
  black: PlayerInfo;

  /**
   * PGN Event tag, then metadata.Event (legacy import fallback). No
   * invented "Imported Game"/"Study Game" text — that's a page-level
   * framing choice, and a real Event value would be obscured by it.
   */
  event?: string;

  opening?: string;
  eco?: string;

  /** "white" | "black" | "draw" | "ongoing", from PGN Result (preferred) or the DB column. */
  result?: SemanticResult;

  /**
   * From `created_at`, not the game's own date — created_at is when
   * VoxChess saved/imported the row (a full timestamp, supports
   * "Today"/"Yesterday" UI). See `gameDate` for when the game was
   * actually played.
   */
  createdAt: string;

  /**
   * PGN Date header, then metadata.Date — the game's own date (e.g. a
   * historical game imported today still reports when it was played,
   * not when it was imported). Calendar-day granularity, PGN format
   * (YYYY.MM.DD), passed through as-is with no parsing.
   */
  gameDate?: string;

  /** True for a bare saved position: a starting FEN with no moves. */
  isPositionOnly: boolean;

  /** metadata.name, for saved positions only. No invented fallback text. */
  title?: string;

  /**
   * metadata.ChapterName, then metadata.Event — a study chapter's own
   * title, distinct from `event` (the game's actual chess event) and
   * `title` (a saved position's name). Undefined outside study chapters.
   */
  chapterName?: string;

  /** Full moves (not plies), from the PGN. */
  moveCount: number;

  /** True if the game started from a non-standard position. */
  isCustomPosition: boolean;

  /** Always undefined today — no source data indicates review state yet. */
  isReviewed?: boolean;

  /**
   * VoxVersion header, when present. Not shown on the card — for future
   * migration/compatibility checks (e.g. gating review on app version).
   */
  voxVersion?: string;
}

// ---------------------------------------------------------------------------
// Field resolvers
// ---------------------------------------------------------------------------

/** True for a bare saved position: a starting FEN with no moves. */
function isPositionOnly(game: Game): boolean {
  return Boolean(game.fen) && !game.pgn;
}

/**
 * Bot display name: VoxBotPersonality header, then
 * metadata.personalityId via getPersonality(). Reuses `personality.name`
 * rather than a separate displayName, matching what pgn.ts writes.
 */
function resolveBotName(
  headers: ParsedPgnHeaders,
  metadata: GameMetadata | null
): string | undefined {
  if (headers.voxBotPersonality) return headers.voxBotPersonality;

  if (metadata?.personalityId) {
    try {
      return getPersonality(metadata.personalityId as PersonalityId).name;
    } catch (err) {
      // Unknown/removed personalityId — degrade to undefined. Dev-only
      // warning so a removed/renamed personality doesn't silently
      // erase old games' bot names with zero signal.
      if (import.meta.env.DEV) {
        console.warn(
          `[gameCard] getPersonality("${metadata.personalityId}") failed`,
          err
        );
      }
      return undefined;
    }
  }

  return undefined;
}

/**
 * Bot Elo: VoxBotElo header (parsed), then metadata.eloIndex via
 * ELO_VALUES. Returns undefined (not NaN) if nothing parses cleanly.
 */
function resolveBotElo(
  headers: ParsedPgnHeaders,
  metadata: GameMetadata | null
): number | undefined {
  if (headers.voxBotElo) {
    const elo = Number.parseInt(headers.voxBotElo, 10);
    if (Number.isFinite(elo)) return elo;
  }

  if (typeof metadata?.eloIndex === "number") {
    const elo = ELO_VALUES[metadata.eloIndex];
    if (typeof elo === "number") return elo;
  }

  return undefined;
}

/**
 * Bot strength label: VoxBotStrength header, then ELO_CONFIG keyed by
 * the already-resolved Elo — same lookup pattern as the Play page.
 */
function resolveBotStrength(
  headers: ParsedPgnHeaders,
  elo: number | undefined
): string | undefined {
  if (headers.voxBotStrength) return headers.voxBotStrength;
  if (elo === undefined) return undefined;
  return ELO_CONFIG[elo as EloValue]?.label;
}

/**
 * Which side (white/black) the bot is playing.
 *
 * Two narrow steps, no further guessing:
 *   1. metadata.playerColor (highest confidence) — bot is the other side.
 *   2. headers.voxBotPersonality === headers.white/black. Both come from
 *      the same preparePlatformPgn() call, so this compares two values
 *      with identical provenance — not a guess across sources.
 *
 * Deliberately NOT here: comparing a name resolved via
 * metadata.personalityId -> getPersonality() against PGN White/Black.
 * That mixes values that can drift apart (renamed personality, two bots
 * sharing a display name) and was removed for exactly that reason.
 *
 * metadata.playerColor is typed as `string` on the real GameMetadata
 * (it's written from a generic play-settings object), so this checks
 * the value rather than relying on a "w" | "b" literal type.
 */
function resolveBotColor(
  headers: ParsedPgnHeaders,
  metadata: GameMetadata | null
): "w" | "b" | undefined {
  if (metadata?.playerColor === "w") return "b";
  if (metadata?.playerColor === "b") return "w";

  if (headers.voxBotPersonality) {
    if (headers.voxBotPersonality === headers.white) return "w";
    if (headers.voxBotPersonality === headers.black) return "b";
  }

  return undefined;
}

/** Inverse of the DB's own "white"/"black"/"draw"/"ongoing" vocabulary. */
const PGN_RESULT_TO_SEMANTIC = {
  "1-0": "white",
  "0-1": "black",
  "1/2-1/2": "draw",
  "*": "ongoing",
} as const satisfies Record<string, SemanticResult>;

function isKnownPgnResult(result: string): result is keyof typeof PGN_RESULT_TO_SEMANTIC {
  return result in PGN_RESULT_TO_SEMANTIC;
}

const SEMANTIC_RESULTS = new Set(["white", "black", "draw", "ongoing"] as const);

function isSemanticResult(value: string): value is SemanticResult {
  return SEMANTIC_RESULTS.has(value as SemanticResult);
}

/**
 * Result in GameCardData's vocabulary: PGN Result tag (converted) wins
 * when present, falling back to the DB column (validated, not assumed,
 * since it's plain `string | null` at the type level). Anything that
 * isn't one of the four known values — a malformed PGN Result, a stray
 * DB value — resolves to undefined rather than being surfaced as-is;
 * there's currently no consumer that would do anything with it.
 * `dbResult` is nullable on the real Game type (e.g. position-only
 * saves have no meaningful result).
 */
function resolveResult(
  headers: ParsedPgnHeaders,
  dbResult: string | null
): SemanticResult | undefined {
  if (headers.result) {
    return isKnownPgnResult(headers.result)
      ? PGN_RESULT_TO_SEMANTIC[headers.result]
      : undefined;
  }
  return dbResult && isSemanticResult(dbResult) ? dbResult : undefined;
}

/**
 * Custom-position game if the PGN declares SetUp/FEN, or either FEN
 * column on the row is set (start_fen for normal games started from a
 * custom position, fen for bare saved positions).
 */
function resolveIsCustomPosition(headers: ParsedPgnHeaders, game: Game): boolean {
  if (headers.setUp || headers.fen) return true;
  return Boolean(game.start_fen) || Boolean(game.fen);
}

/** PGN Date header, then metadata.Date — see GameCardData.gameDate. */
function resolveGameDate(
  headers: ParsedPgnHeaders,
  metadata: GameMetadata | null
): string | undefined {
  return headers.date ?? metadata?.Date ?? undefined;
}

/** PGN Event header, then metadata.Event (legacy import fallback). */
function resolveEvent(
  headers: ParsedPgnHeaders,
  metadata: GameMetadata | null
): string | undefined {
  return headers.event ?? metadata?.Event ?? undefined;
}

/** metadata.name, for saved positions only. No invented fallback text. */
function resolveTitle(positionOnly: boolean, metadata: GameMetadata | null): string | undefined {
  if (!positionOnly) return undefined;
  return metadata?.name ?? undefined;
}

/**
 * A study chapter's own title: metadata.ChapterName, then metadata.Event.
 * Distinct from `event` (the game's actual chess event, e.g. a real
 * tournament) — a chapter can have both a chapter title and a separate
 * event, and conflating them into one field would lose that distinction.
 */
function resolveChapterName(metadata: GameMetadata | null): string | undefined {
  return metadata?.ChapterName ?? metadata?.Event ?? undefined;
}

/**
 * Builds PlayerInfo for one side. `isBot` gates whether elo/strength
 * populate; it's not part of the returned PlayerInfo itself.
 *
 * name: PGN header, then metadata.White/Black (legacy import fallback —
 * real games saved before rich PGN headers existed, or imports that
 * only ever had bare metadata), then the bot's resolved name if this
 * side is the bot.
 */
function buildPlayerInfo(opts: {
  pgnName: string | undefined;
  legacyMetadataName: string | undefined;
  isBot: boolean;
  botFallbackName: string | undefined;
  elo: number | undefined;
  strength: string | undefined;
  title: string | undefined;
}): PlayerInfo {
  const { pgnName, legacyMetadataName, isBot, botFallbackName, elo, strength, title } = opts;

  return {
    name: pgnName ?? legacyMetadataName ?? (isBot ? botFallbackName : undefined),
    elo: isBot ? elo : undefined,
    strength: isBot ? strength : undefined,
    title,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Converts a database Game row into UI-ready GameCardData. Never mutates `game`. */
export function buildGameCardData(game: Game): GameCardData {
  const headers = parsePgnHeaders(game.pgn);
  const metadata = game.metadata;
  const positionOnly = isPositionOnly(game);

  const botName = resolveBotName(headers, metadata);
  const botElo = resolveBotElo(headers, metadata);
  const botStrength = resolveBotStrength(headers, botElo);
  const botColor = resolveBotColor(headers, metadata);

  // Position-only saves don't represent a played game, so PlayerInfo
  // remains empty and the UI uses `title` instead.
  const white = positionOnly
    ? {}
    : buildPlayerInfo({
        pgnName: headers.white,
        legacyMetadataName: metadata?.White,
        isBot: botColor === "w",
        botFallbackName: botName,
        elo: botElo,
        strength: botStrength,
        title: headers.whiteTitle,
      });

  const black = positionOnly
    ? {}
    : buildPlayerInfo({
        pgnName: headers.black,
        legacyMetadataName: metadata?.Black,
        isBot: botColor === "b",
        botFallbackName: botName,
        elo: botElo,
        strength: botStrength,
        title: headers.blackTitle,
      });

  return {
    id: game.id,

    white,
    black,

    event: resolveEvent(headers, metadata),
    opening: headers.opening,
    eco: headers.eco,

    result: resolveResult(headers, game.result),

    // From the DB, not the game's own date — see createdAt doc comment.
    createdAt: game.created_at,

    gameDate: resolveGameDate(headers, metadata),

    isPositionOnly: positionOnly,

    title: resolveTitle(positionOnly, metadata),

    chapterName: resolveChapterName(metadata),

    moveCount: countMoves(game.pgn),

    isCustomPosition: resolveIsCustomPosition(headers, game),

    // No source data indicates review state yet.
    isReviewed: undefined,

    voxVersion: headers.voxVersion,
  };
}