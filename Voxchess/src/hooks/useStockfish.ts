import { useCallback, useEffect, useRef, useState } from "react";
import { StockfishEngine, type StockfishEval } from "@/lib/chess/stockfish";
import { type EloConfig } from "@/lib/chess/personalities";

const ANALYSIS_CONFIG: EloConfig = {
  label: "Analysis",
  skillLevel: 20,
  depth: 20,
  multiPv: 3,
};

export function useStockfish() {
  const engineRef = useRef<StockfishEngine | null>(null);
  const [evaluation, setEvaluation] = useState<StockfishEval | null>(null);
  const [engineError, setEngineError] = useState(false);
  const lastFenRef = useRef<string>("");
  const lastMultiPvRef = useRef<number>(1);

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

  const evaluate = useCallback((fen: string, config?: EloConfig, options?: { multiPv?: number }) => {
    const activeConfig = config ?? ANALYSIS_CONFIG;
    const multiPv = options?.multiPv ?? activeConfig.multiPv ?? 1;

    // Reset on either fen OR multiPv change — needed so the bot's expanded
    // (wider) re-search doesn't get processed against a stale narrower
    // evaluation still sitting in state.
    if (fen !== lastFenRef.current || multiPv !== lastMultiPvRef.current) {
      lastFenRef.current = fen;
      lastMultiPvRef.current = multiPv;
      setEvaluation(null);
    }

    engineRef.current?.evaluate(fen, activeConfig, options);
  }, []);

  const stop = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  return { evaluation, evaluate, stop, engineError };
}