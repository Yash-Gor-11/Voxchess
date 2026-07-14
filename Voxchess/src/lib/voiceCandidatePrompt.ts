// src/lib/voiceCandidatePrompt.ts
//
// Turns a MoveCandidate into user-facing text for confirmation prompts.
// SAN is already voice-engine-correct (chess.js disambiguates same-square
// moves by file/rank, e.g. "Nce5" vs "Nge5" -- contrary to an earlier
// review comment, two knights reaching the same square do NOT produce
// identical SAN). The one place raw SAN is genuinely unfriendly is
// promotion: "e8=Q" vs "e8=R" vs "e8=B" vs "e8=N" all share the same
// from/to squares and differ only in a one-letter suffix, which is easy
// to misread in a quick toast/sidebar glance. This helper special-cases
// that; everything else passes through close to SAN with from/to spelled
// out for clarity.

import type { MoveCandidate } from "@/lib/voice/types";

const PIECE_NAMES: Record<string, string> = {
  N: "Knight",
  B: "Bishop",
  R: "Rook",
  Q: "Queen",
  K: "King",
};

export function describeCandidate(candidate: MoveCandidate): string {
  const { move, san } = candidate;

  if (move.promotion) {
    const promoName = PIECE_NAMES[move.promotion.toUpperCase()] ?? move.promotion;
    return `Promote to ${promoName} (${move.from}-${move.to})`;
  }
  if (san === "O-O") return "Castle kingside";
  if (san === "O-O-O") return "Castle queenside";

  const pieceLetter = /^[NBRQK]/.test(san) ? san[0] : null;
  const pieceName = pieceLetter ? PIECE_NAMES[pieceLetter] : "Pawn";
  // The origin square is deliberately kept even though it reads a little
  // less naturally than "Knight to e5" -- this string is ONLY ever shown
  // when MoveRanker left a tie unresolved (see this file's own header),
  // and the most common tie is two of the same piece type reaching the
  // same square (e.g. two knights, both able to play Ne5). Dropping the
  // origin square, as a review comment suggested, would make those two
  // candidates read identically and defeat the only reason this string
  // exists. "Knight c4 to e5" keeps the natural-language verb while still
  // disambiguating.
  const verb = san.includes("x") ? "takes" : "to";
  return `${pieceName} ${move.from} ${verb} ${move.to}`;
}

/**
 * `timerMs` should come from VoiceEngine.getConfig().timerMs -- NOT
 * hardcoded -- since a null/undefined timerMs means the engine's
 * ConfirmationManager waits indefinitely rather than auto-committing.
 * Saying "wait to auto-pick #1" when that isn't true would be actively
 * misleading once Settings can turn the timer off.
 */
export function buildConfirmationPrompt(
  candidates: readonly MoveCandidate[],
  timerMs: number | null | undefined,
): string {
  const lines = candidates.map((c, i) => `${i + 1}. ${describeCandidate(c)}`);
  const tail =
    typeof timerMs === "number" && timerMs > 0
      ? `Say a number, or wait to auto-pick #1.`
      : `Say a number to choose.`;
  return `Which one?\n${lines.join("\n")}\n${tail}`;
}