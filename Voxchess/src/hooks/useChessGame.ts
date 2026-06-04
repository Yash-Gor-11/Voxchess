import { useCallback, useRef, useState } from "react";
import { Chess } from "chess.js";

export function useChessGame() {
  const gameRef = useRef<Chess>(new Chess());
  const [, setRevision] = useState(0);

  const bump = useCallback(() => setRevision((r) => r + 1), []);

  const move = useCallback(
    (from: string, to: string, promotion = "q") => {
      try {
        const m = gameRef.current.move({ from, to, promotion });
        if (!m) return false;
        bump();
        return true;
      } catch {
        return false;
      }
    },
    [bump],
  );

  const moveSan = useCallback(
    (san: string) => {
      try {
        const m = gameRef.current.move(san);
        if (!m) return false;
        bump();
        return true;
      } catch {
        return false;
      }
    },
    [bump],
  );

  const undo = useCallback(() => {
    gameRef.current.undo();
    bump();
  }, [bump]);

  const reset = useCallback((fromFen?: string) => {
    if (fromFen) {
      gameRef.current.load(fromFen);
    } else {
      gameRef.current.reset();
    }
    bump();
  }, [bump]);

  const exportPgn = useCallback(() => gameRef.current.pgn(), []);

  const loadPgn = useCallback(
  (pgn: string, startFen?: string | null) => {
    const chess = new Chess();

    // zero-move custom position
    if (!pgn?.trim()) {
      if (startFen) {
        try {
          chess.load(startFen);
        } catch {}
      }

      gameRef.current = chess;
      bump();
      return;
    }

    try {
      chess.loadPgn(pgn);
    } catch {
      // fallback path for malformed PGN or transitional data
      if (startFen) {
        try {
          chess.load(startFen);
        } catch {}
      }
    }

    gameRef.current = chess;
    bump();
  },
  [bump],
);
  const loadMoves = useCallback((moves: string[]) => {
    gameRef.current = new Chess();
    for (const san of moves) {
      try { gameRef.current.move(san); } catch { break; }
    }
    bump();
  }, [bump]);

  const game = gameRef.current;

  return {
    game,
    fen: game.fen(),
    history: game.history(),
    move,
    moveSan,
    undo,
    reset,
    loadMoves,   // ← add
    loadPgn,    // ← add
    exportPgn,
    isCheck: game.isCheck(),
    isGameOver: game.isGameOver(),
    turn: game.turn() === "w" ? ("white" as const) : ("black" as const),
  };
}
