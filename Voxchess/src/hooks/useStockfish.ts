import { useEffect, useRef, useState } from "react";
import { StockfishEngine, type StockfishEval } from "@/lib/chess/stockfish";

export function useStockfish() {
  const engineRef = useRef<StockfishEngine | null>(null);
  const [evaluation, setEvaluation] = useState<StockfishEval | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const engine = new StockfishEngine();
    engineRef.current = engine;

    engine.init((e) => {
      setEvaluation(e);
      if (!ready) setReady(true);
    });

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  function evaluate(fen: string) {
    engineRef.current?.evaluate(fen);
  }

  function stop() {
    engineRef.current?.stop();
  }

  return { evaluation, ready, evaluate, stop };
}