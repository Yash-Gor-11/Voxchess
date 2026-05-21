import { Chess } from "chess.js";

export function uciPvToSan(fen: string, pv: string): string[] {
  const chess = new Chess(fen);
  const uciMoves = pv.trim().split(" ");
  const sanMoves: string[] = [];

  for (const uci of uciMoves) {
    try {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length === 5 ? uci[4] : undefined,
      });
      if (!move) break;
      sanMoves.push(move.san);
    } catch {
      break; // stop at first illegal move
    }
  }

  return sanMoves;
}