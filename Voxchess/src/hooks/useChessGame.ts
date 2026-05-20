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

  const reset = useCallback(() => {
    gameRef.current.reset();
    bump();
  }, [bump]);

  const exportPgn = useCallback(() => gameRef.current.pgn(), []);

  const game = gameRef.current;

  return {
    game,
    fen: game.fen(),
    history: game.history(),
    move,
    moveSan,
    undo,
    reset,
    exportPgn,
    isCheck: game.isCheck(),
    isGameOver: game.isGameOver(),
    turn: game.turn() === "w" ? ("white" as const) : ("black" as const),
  };
}
