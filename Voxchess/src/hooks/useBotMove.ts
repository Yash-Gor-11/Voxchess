// src/hooks/useBotMove.ts
//
// Bot move orchestrator — owns the lazy MultiPV expansion sequence (3→8)
// AND the opening-book short-circuit, so play.tsx doesn't need to manage
// any of that itself. Also exposes the raw evaluate()/evaluation
// passthrough from useStockfish so existing hint-system code in play.tsx
// keeps working unchanged.
//
// Opening book integration:
//   - bookMoves(fen) (openings.ts) returns every legal move from the
//     current position that leads into a known book position.
//   - Book does NOT play a move outright. It CONSTRAINS the candidate pool
//     the quality-weighted selector chooses from — a 300-rated bot in book
//     still rolls Inaccuracy/Mistake/Blunder and, if possible, plays a
//     book move of that quality rather than always the objectively best
//     book line. This keeps opening play consistent with the bot's rating
//     instead of making every tier look like a memorized-theory expert for
//     a few moves.
//   - bookPlyLimit (EloConfig) controls how many plies of book each rating
//     tier uses before falling back to pure engine-quality selection.
//   - The book set is computed once per requestBotMove call (not per
//     phase), since it depends only on the starting fen for that move, not
//     on which MultiPV width Stockfish happens to be searching at.

import { useCallback, useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { useStockfish } from "./useStockfish";
import {
  classifyCandidates,
  pickExactQuality,
  resolveUpwardFallback,
  rollQuality,
  INITIAL_MULTI_PV,
  EXPANDED_MULTI_PV,
  type PvCandidate,
  type ClassifiedCandidate,
} from "@/lib/chess/botMoveSelection";
import { bookMoves } from "@/lib/chess/openings";
import type { EloConfig } from "@/lib/chess/personalities";
import type { MoveQuality } from "@/lib/chess/evaluation";
import type { StockfishEval } from "@/lib/chess/stockfish";

type BotMovePhase = "idle" | "initial" | "expanded";

export interface UseBotMoveReturn {
  requestBotMove: (fen: string, config: EloConfig) => void;
  cancelPendingMove: () => void;
  thinking: boolean;
  evaluation: StockfishEval | null;
  evaluate: (fen: string, config?: EloConfig, options?: { multiPv?: number }) => void;
  engineError: boolean;
}

/**
 * Derives how many half-moves have already been played from a FEN's
 * fullmove counter + side to move — avoids constructing a Chess instance
 * just to count plies.
 */
function pliesPlayedFromFen(fen: string): number {
  const parts = fen.split(" ");
  const turn = parts[1];
  const fullmove = parseInt(parts[5] ?? "1", 10) || 1;
  return (fullmove - 1) * 2 + (turn === "b" ? 1 : 0);
}

export function useBotMove(onMoveReady: (uciMove: string) => void): UseBotMoveReturn {
  const { evaluation, evaluate, stop, engineError } = useStockfish();
  const [thinking, setThinking] = useState(false);

  const phaseRef = useRef<BotMovePhase>("idle");
  const desiredQualityRef = useRef<MoveQuality | null>(null);
  const expandedPoolTargetRef = useRef<number>(EXPANDED_MULTI_PV);
  const activeConfigRef = useRef<EloConfig | null>(null);
  const activeFenRef = useRef<string>("");
  // Set of book-move UCIs available from this position, or null if book
  // doesn't apply to this move (ply beyond bookPlyLimit, or no
  // qualityWeights). Computed once per requestBotMove call, reused across
  // the initial/expanded phases of that same move.
  const bookSetRef = useRef<Set<string> | null>(null);
  const cancelledRef = useRef(false);
  const thinkingRef = useRef(false);

  const setThinkingBoth = useCallback((val: boolean) => {
    thinkingRef.current = val;
    setThinking(val);
  }, []);

  const requestBotMove = useCallback((fen: string, config: EloConfig) => {
    if (thinkingRef.current) return;

    cancelledRef.current = false;
    phaseRef.current = "initial";
    activeFenRef.current = fen;
    activeConfigRef.current = config;

    // Roll quality once per move — reused across initial + expanded search.
    desiredQualityRef.current = config.qualityWeights
      ? rollQuality(config.qualityWeights)
      : null;

    // Book only constrains the candidate pool for quality-weighted tiers —
    // full-strength tiers (no qualityWeights) always just play PV1 and get
    // no benefit from filtering, so skip the lookup entirely for them.
    const nextMoveNumber = pliesPlayedFromFen(fen) + 1;
    bookSetRef.current =
      config.qualityWeights && nextMoveNumber <= (config.bookPlyLimit ?? 0)
        ? new Set(bookMoves(fen).map((m) => m.uci))
        : null;

    setThinkingBoth(true);
    evaluate(fen, config, { multiPv: config.qualityWeights ? INITIAL_MULTI_PV : 1 });
  }, [evaluate, setThinkingBoth]);

  const cancelPendingMove = useCallback(() => {
    cancelledRef.current = true;
    phaseRef.current = "idle";
    desiredQualityRef.current = null;
    activeConfigRef.current = null;
    bookSetRef.current = null;
    setThinkingBoth(false);
    stop();
  }, [stop, setThinkingBoth]);

  /**
   * Restricts `classified` to book-move candidates when a book set is
   * active and at least one book move is present in the pool. Falls back
   * to the full pool otherwise — this is what lets a rolled quality with
   * no matching book candidate still resolve sensibly (either against a
   * wider book-filtered set after expansion, or against the full pool as
   * a last resort if no book continuation ever appears in the searched
   * lines at all).
   */
  function bookScopedPool(classified: ClassifiedCandidate[]): ClassifiedCandidate[] {
    const bookSet = bookSetRef.current;
    if (!bookSet || bookSet.size === 0) return classified;
    const filtered = classified.filter((c) => bookSet.has(c.pv.move));
    return filtered.length > 0 ? filtered : classified;
  }

  useEffect(() => {
    if (cancelledRef.current) return;
    if (phaseRef.current === "idle") return;
    if (!evaluation) return;

    const moves = evaluation.bestMoves.filter(Boolean) as PvCandidate[];
    if (moves.length === 0) return;

    const desired = desiredQualityRef.current;
    const config = activeConfigRef.current;
    const fen = activeFenRef.current;

    // Full-strength tier (no qualityWeights) — always PV1, no expansion,
    // no book filtering.
    if (!desired || !config?.qualityWeights) {
      phaseRef.current = "idle";
      setThinkingBoth(false);
      onMoveReady(moves[0].move);
      return;
    }

    if (phaseRef.current === "initial") {
      const classified = classifyCandidates(moves);
      const pool = bookScopedPool(classified);
      const exact = pickExactQuality(pool, desired);
      if (exact) {
        phaseRef.current = "idle";
        setThinkingBoth(false);
        onMoveReady(exact.move);
        return;
      }

      // No exact match in the initial 3-PV pool (book-scoped or not) —
      // expand once, same depth, to broaden the candidate pool.
      phaseRef.current = "expanded";
      const legalCount = (() => {
        try { return new Chess(fen).moves().length; } catch { return EXPANDED_MULTI_PV; }
      })();
      expandedPoolTargetRef.current = Math.min(EXPANDED_MULTI_PV, legalCount);
      evaluate(fen, config, { multiPv: EXPANDED_MULTI_PV });
      return;
    }

    if (phaseRef.current === "expanded") {
      // Don't resolve against a half-streamed pool.
      if (moves.length < expandedPoolTargetRef.current) return;

      const classified = classifyCandidates(moves);
      const pool = bookScopedPool(classified);
      const chosen = resolveUpwardFallback(pool, desired);
      phaseRef.current = "idle";
      setThinkingBoth(false);
      onMoveReady(chosen.move);
    }
  }, [evaluation, onMoveReady, evaluate, setThinkingBoth]);

  return { requestBotMove, cancelPendingMove, thinking, evaluation, evaluate, engineError };
}