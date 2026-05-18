import { useCallback, useState } from "react";
import { Chess } from "chess.js";

export function useChessGame() {
  const [game, setGame] = useState(() => new Chess());

  const sync = useCallback((g: Chess) => {
    setGame(new Chess(g.fen()));
  }, []);

  const move = useCallback((from: string, to: string, promotion = "q") => {
    try {
      const next = new Chess(game.fen());
      const m = next.move({ from, to, promotion });
      if (!m) return false;
      setGame(next);
      return true;
    } catch {
      return false;
    }
  }, [game]);

  const moveSan = useCallback((san: string) => {
    try {
      const next = new Chess(game.fen());
      const m = next.move(san);
      if (!m) return false;
      setGame(next);
      return true;
    } catch {
      return false;
    }
  }, [game]);

  const undo = useCallback(() => {
    const next = new Chess(game.fen());
    next.undo();
    setGame(next);
  }, [game]);

  const reset = useCallback(() => {
    setGame(new Chess());
  }, []);

  const exportPgn = useCallback(() => game.pgn(), [game]);

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