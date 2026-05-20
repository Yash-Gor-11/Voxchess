import { useCallback, useEffect, useRef, useState } from "react";
import { StockfishEngine, type StockfishEval } from "@/lib/chess/stockfish";

export function useStockfish() {
  const engineRef = useRef<StockfishEngine | null>(null);
  const [evaluation, setEvaluation] = useState<StockfishEval | null>(null);
  const [engineError, setEngineError] = useState(false);
  const lastFenRef = useRef<string>("");

  useEffect(() => {
    const engine = new StockfishEngine();
    engineRef.current = engine;
    engine.init(
      (e) => setEvaluation(e),
      () => setEngineError(true),
    );
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const evaluate = useCallback((fen: string) => {
    if (fen !== lastFenRef.current) {
      lastFenRef.current = fen;
      setEvaluation(null);
    }
    engineRef.current?.evaluate(fen);
  }, []); // stable — only touches refs

  const stop = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  return { evaluation, evaluate, stop, engineError };
}
