import { useEffect, useRef, useState } from "react";
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
      () => setEngineError(true)
    );
    return () => { engine.destroy(); engineRef.current = null; };
  }, []);

  function evaluate(fen: string) {
    // Only clear stale eval if FEN actually changed
    if (fen !== lastFenRef.current) {
      lastFenRef.current = fen;
      setEvaluation(null);
    }
    engineRef.current?.evaluate(fen);
  }

  function stop() { engineRef.current?.stop(); }

  return { evaluation, evaluate, stop, engineError };
}