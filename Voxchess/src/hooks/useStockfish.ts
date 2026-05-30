import { useCallback, useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { StockfishEngine, type StockfishEval } from "@/lib/chess/stockfish";
import { type EloConfig } from "@/lib/chess/personalities";

const ANALYSIS_CONFIG: EloConfig = {
  label: "Analysis",
  skillLevel: 20,
  depth: 20,
  multiPv: 3,
};

// ── Human error model ─────────────────────────────────────────────────────────
// Simulates real player mistakes by occasionally picking suboptimal or random
// moves instead of the engine's best choice. Only active for play vs bot —
// analysis page uses ANALYSIS_CONFIG which has no blunderRate/errorRate so it
// always receives full-strength evaluation unmodified.
//
// Three layers (applied in order, first match wins):
//   1. Blunder    — completely random legal move (drops pieces, misses mates)
//   2. Mistake    — picks a non-best line from the MultiPV results
//   3. cpTolerance — narrows mistake candidates to moves within X cp of best,
//                    so mistakes feel like missed tactics rather than random noise
//
// play.tsx always reads bestMoves[0].move, so we just reorder the array here
// and nothing else in the codebase needs to change.
function applyHumanError(
  eval_: StockfishEval,
  fen: string,
  config: EloConfig,
): StockfishEval {
  const { blunderRate = 0, errorRate = 0, cpTolerance = 0 } = config;
  if (!blunderRate && !errorRate) return eval_;

  // Layer 1 — Blunder: completely random legal move
  if (blunderRate > 0 && Math.random() < blunderRate) {
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });
    if (moves.length > 0) {
      const m = moves[Math.floor(Math.random() * moves.length)];
      const blunderUci = m.from + m.to + (m.promotion ?? "");
      return {
        ...eval_,
        bestMoves: [
          { move: blunderUci, score: eval_.bestMoves[0]?.score ?? 0, mate: null, pv: blunderUci },
          ...eval_.bestMoves,
        ],
      };
    }
  }

  // Layer 2 — Mistake: pick a suboptimal line from MultiPV results
  if (errorRate > 0 && Math.random() < errorRate && eval_.bestMoves.length > 1) {
    let candidates = eval_.bestMoves.slice(1); // exclude best move at index 0

    // Layer 3 — cpTolerance: only consider moves within X cp of best
    // This makes mistakes feel like "missed a tactic" rather than random drops
    if (cpTolerance > 0) {
      const bestScore = eval_.bestMoves[0].score;
      const withinTolerance = eval_.bestMoves.slice(1).filter(
        (m) => m.mate === null && bestScore - m.score <= cpTolerance,
      );
      if (withinTolerance.length > 0) candidates = withinTolerance;
    }

    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    const rest = eval_.bestMoves.filter((m) => m !== chosen);
    return { ...eval_, bestMoves: [chosen, ...rest] };
  }

  return eval_;
}

export function useStockfish() {
  const engineRef = useRef<StockfishEngine | null>(null);
  const [evaluation, setEvaluation] = useState<StockfishEval | null>(null);
  const [engineError, setEngineError] = useState(false);
  const lastFenRef = useRef<string>("");
  const lastConfigRef = useRef<EloConfig>(ANALYSIS_CONFIG);

  useEffect(() => {
    const engine = new StockfishEngine();
    engineRef.current = engine;
    void engine.init(
      (e) => {
        const humanized = applyHumanError(e, lastFenRef.current, lastConfigRef.current);
        setEvaluation(humanized);
      },
      () => setEngineError(true),
    );
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const evaluate = useCallback((fen: string, config?: EloConfig) => {
    const activeConfig = config ?? ANALYSIS_CONFIG;
    lastConfigRef.current = activeConfig;
    if (fen !== lastFenRef.current) {
      lastFenRef.current = fen;
      setEvaluation(null);
    }
    engineRef.current?.evaluate(fen, activeConfig);
  }, []);

  const stop = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  return { evaluation, evaluate, stop, engineError };
}