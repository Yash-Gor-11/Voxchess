import { useCallback, useEffect, useRef, useState } from "react";
import { StockfishEngine, type StockfishEval } from "@/lib/chess/stockfish";
import { type EloConfig } from "@/lib/chess/personalities";

const ANALYSIS_CONFIG: EloConfig = { label: "Analysis", skillLevel: 20, depth: 20 };

export function useStockfish() {
  const engineRef = useRef<StockfishEngine | null>(null);
  const [evaluation, setEvaluation] = useState<StockfishEval | null>(null);
  const [engineError, setEngineError] = useState(false);
  const lastFenRef = useRef<string>("");

  useEffect(() => {
    const engine = new StockfishEngine();
    engineRef.current = engine;
    void engine.init(
      (e) => setEvaluation(e),
      () => setEngineError(true),
    );
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const evaluate = useCallback((fen: string, config?: EloConfig) => {
    if (fen !== lastFenRef.current) {
      lastFenRef.current = fen;
      setEvaluation(null);
    }
    engineRef.current?.evaluate(fen, config ?? ANALYSIS_CONFIG);
  }, []);

  const stop = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  return { evaluation, evaluate, stop, engineError };
}