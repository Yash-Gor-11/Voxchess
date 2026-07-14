// src/lib/voice/adapters/ChessAdapter.ts
//
// The ONLY module in src/lib/voice/ permitted to import chess.js (v3
// §5.10). Nothing in controller/, matching/, or confirmation/ builds
// chess logic itself — they call through this seam. Two concrete
// implementations are expected long-term: Play (backed by the page's
// useMemo'd Chess instance) and Analysis (backed by AnalysisTree) — this
// file provides the Play-shaped factory plus a FEN-only convenience
// factory for fixture-driven testing, since Phase 3 explicitly has "no
// live ASR yet" and no board UI to hook into.

import { Chess } from "chess.js";
import type { LegalMove, PieceLetter, PromotionLetter } from "../types";

export interface ChessAdapter {
  getLegalMoves(): LegalMove[];
  /** Delegates to the caller-supplied executeMove — this adapter never mutates board state itself for Play mode. */
  executeMove(move: { from: string; to: string; promotion?: string }): void;
  currentFen(): string;
}

const PIECE_LETTER_MAP: Readonly<Record<string, PieceLetter>> = {
  p: "P",
  n: "N",
  b: "B",
  r: "R",
  q: "Q",
  k: "K",
};

const PROMOTION_LETTER_MAP: Readonly<Record<string, PromotionLetter>> = {
  q: "Q",
  r: "R",
  b: "B",
  n: "N",
};

/**
 * Converts a chess.js verbose move object into our own LegalMove shape.
 * Isolated here so the chess.js dependency stays contained to this one
 * function, per the file's own header rule.
 */
function toLegalMove(m: {
  from: string;
  to: string;
  piece: string;
  captured?: string;
  promotion?: string;
  flags: string;
  san: string;
}): LegalMove {
  return {
    from: m.from,
    to: m.to,
    piece: PIECE_LETTER_MAP[m.piece],
    // Mirrors the existing app's own capture-detection pattern (see
    // play.tsx's clickToMoveSquareStyles: `!!mv.captured || mv.flags?.includes("e")`)
    // — en passant captures don't populate `captured` on every chess.js
    // version/config, so the flag check is kept as a belt-and-suspenders
    // fallback rather than trusting `captured` alone.
    captured:
      m.captured || m.flags.includes("e")
        ? PIECE_LETTER_MAP[m.captured ?? "p"] // en passant always captures a pawn
        : undefined,
    promotion: m.promotion ? PROMOTION_LETTER_MAP[m.promotion] : undefined,
    isCastleKingside: m.flags.includes("k"),
    isCastleQueenside: m.flags.includes("q"),
    san: m.san,
  };
}

/**
 * The Play-mode adapter shape: reads flow through a caller-supplied FEN
 * getter (mirroring the page's existing useMemo'd Chess instance, per v3
 * §2's "read-only Chess instances" principle — this adapter never keeps
 * its own mutable board state); writes flow through a caller-supplied
 * executeMove (the page's existing shared move pipeline, same function
 * drag-and-drop and click-to-move already call).
 *
 * A fresh throwaway Chess instance is constructed per getLegalMoves() call
 * from the current FEN, rather than held as adapter state — this mirrors
 * the existing codebase's own pattern (see play.tsx's executeMove: "builds
 * its own throwaway Chess instance from fenRef.current") and avoids the
 * adapter silently drifting out of sync with the page's real board state.
 */
export function createChessAdapter(options: {
  getFen: () => string;
  executeMove: (move: { from: string; to: string; promotion?: string }) => void;
}): ChessAdapter {
  return {
    getLegalMoves(): LegalMove[] {
      const chess = new Chess(options.getFen());
      return chess.moves({ verbose: true }).map(toLegalMove);
    },
    executeMove(move) {
      options.executeMove(move);
    },
    currentFen() {
      return options.getFen();
    },
  };
}

/**
 * Convenience factory for fixture-driven testing (Phase 3's "tested
 * against static FEN fixtures, no live ASR yet"). Wraps a fixed FEN string
 * with a no-op-by-default executeMove that records calls for test
 * assertions, since there's no real page pipeline to delegate to yet.
 */
export function createTestChessAdapter(
  fen: string,
  onExecuteMove?: (move: { from: string; to: string; promotion?: string }) => void,
): ChessAdapter {
  return createChessAdapter({
    getFen: () => fen,
    executeMove: (move) => {
      onExecuteMove?.(move);
    },
  });
}
