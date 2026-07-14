// src/lib/voice/commands/CommandParser.ts
//
// Detects undo/resign/offer-draw/flip-board (v3 §5.9). Deliberately a
// separate pipeline from IntentParser, not a mode IntentParser learns —
// commands and moves have fundamentally different shapes (fixed phrases
// vs. piece/square grammar), and mixing them would mean grammar.ts
// patterns and command phrases competing for the same token stream with
// no principled way to disambiguate. This mirrors the explicit
// recommendation to keep:
//
//   Transcript
//         |
//         +-- Move parser   (intent/IntentParser.ts)
//         +-- Command parser (this file)
//
// rather than teaching IntentParser about non-move commands.
//
// Dependency rules (v3 §5.0): commands/ sits at the same layer as
// confirmation/ (lateral siblings — see grammar.ts's dependency-layer
// note from Phase 2). May import types/. Must NOT import chess.js,
// controller/, or matching/.

import type { VoiceCommand } from "../types";

/**
 * Exact-match phrase sets, checked against the space-joined, already-
 * normalized token array (so "Undo!" / "undo please" / "UNDO" all reduce
 * to the same "undo" string before reaching this module — normalization
 * is Normalizer's job, not repeated here).
 */
const UNDO_PHRASES: ReadonlySet<string> = new Set([
  "undo",
  // NOTE: "take back" is NOT listed as written — Normalizer's
  // CAPTURE_ALIASES generically maps "take" -> "takes" for ANY token
  // (it has no notion of "this word is inside a command phrase, don't
  // touch it"), so "take back" always reaches this module already
  // normalized to "takes back". Listing the raw "take back" form here
  // would silently never match. Found via direct testing, not by
  // inspection — see CommandParser.test.ts's regression test for this
  // exact case.
  "takes back",
  "takeback",
  "undo move",
  "undo that",
  "undo last move",
]);

const RESIGN_PHRASES: ReadonlySet<string> = new Set([
  "resign",
  "i resign",
  // NOTE: NOT "resign the game" — Normalizer strips "the" as filler, so
  // that input always reaches this module as "resign game" already,
  // which is listed below. Listing the un-stripped form would be dead
  // code (never actually produced), not a functional gap.
  "resign game",
]);

const OFFER_DRAW_PHRASES: ReadonlySet<string> = new Set([
  "draw",
  "offer draw",
  "offer a draw",
  "propose draw",
  "propose a draw",
]);

const FLIP_BOARD_PHRASES: ReadonlySet<string> = new Set([
  "flip",
  "flip board",
  // ASR sometimes merges two short adjacent words into one -- same
  // reasoning as UNDO_PHRASES's "takeback" above. Found via a real
  // "Flipboard." transcript failing to parse.
  "flipboard",
  // NOTE: NOT "flip the board" — same "the" is filler-stripped reasoning
  // as RESIGN_PHRASES above; "flip board" already covers this input.
]);

/**
 * Which of these commands are "dangerous" — consequential enough that
 * VoiceSession routes them through a confirmation round before acting
 * (v3 §5.9: "route through ConfirmationManager's existing yes/no flow").
 * Undo and flip-board are reversible/low-stakes and execute immediately.
 */
export const DANGEROUS_COMMAND_TYPES: ReadonlySet<VoiceCommand["type"]> = new Set([
  "resign",
  "offer-draw",
]);

export function isDangerousCommand(command: VoiceCommand): boolean {
  return DANGEROUS_COMMAND_TYPES.has(command.type);
}

/**
 * parseCommand(tokens) -> VoiceCommand | null
 *
 * Operates on already-normalized tokens (output of Normalizer.normalize).
 * Exact phrase matching only — no partial/substring matching — to avoid
 * a command phrase accidentally firing on unrelated input that happens to
 * contain one of these words as a fragment.
 */
export function parseCommand(tokens: string[]): VoiceCommand | null {
  if (tokens.length === 0) return null;
  const joined = tokens.join(" ");

  if (UNDO_PHRASES.has(joined)) return { type: "undo" };
  if (RESIGN_PHRASES.has(joined)) return { type: "resign" };
  if (OFFER_DRAW_PHRASES.has(joined)) return { type: "offer-draw" };
  if (FLIP_BOARD_PHRASES.has(joined)) return { type: "flip-board" };

  return null;
}