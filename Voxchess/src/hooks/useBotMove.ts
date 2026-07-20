// src/hooks/useBotMove.ts
//
// Bot move orchestrator — owns the lazy MultiPV expansion sequence (3→8),
// the opening-book short-circuit, the survival-mode hybrid pipeline for
// losing positions, AND (new) the Immediate Punishment realism check, so
// play.tsx doesn't need to manage any of that itself. Also exposes the
// raw evaluate()/evaluation passthrough from useStockfish for existing
// hint-system code in play.tsx.
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
//
// Survival pipeline (hybrid losing-position mode):
//   - The quality-weighted model (win% based) saturates once a position
//     is badly lost — large centipawn differences between candidates
//     collapse into tiny win% differences, so it can no longer tell
//     sensible defense from outright collapse.
//   - Once bestWinPercent drops below SURVIVAL_ENTER_THRESHOLD, the bot
//     switches to picking randomly among every candidate within
//     config.cpTolerance centipawns of PV1 — no quality roll, no lazy
//     expansion, just the initial 3-PV pool.
//   - A hysteresis band (enter <20%, exit >25%) prevents the mode from
//     flickering move-to-move when win% oscillates near a single cutoff.
//   - Mode state (modeRef) and the "is this the first decision of the
//     session" flag (firstDecisionRef) are internal to this hook and are
//     NOT reset via FEN/ply inference — the app calls resetBotSession()
//     explicitly whenever a new bot session begins (new game, loaded
//     game, continue-from-position, imported PGN/FEN). Undo does NOT
//     call this, since undo revisits the same session/position rather
//     than starting a new one.
//
// Immediate Punishment (realism check):
//   - Runs AFTER a candidate is selected by the quality pipeline (exact
//     match or upward fallback), BEFORE it's committed via onMoveReady.
//   - Fully synchronous — no engine re-search, no new phase in this
//     hook's state machine (idle/initial/expanded is unchanged). See
//     ImmediatePunishment.ts for why: it only reads candidate.mate
//     (already produced by the MultiPV search) and runs SEE, a static
//     computation, on the resulting position.
//   - The actual resolution logic (checking a candidate, climbing the
//     fallback ladder on rejection, guaranteeing a playable move even
//     if every candidate is eventually rejected) lives in
//     resolveAgainstRealism.ts, not in this hook — it's pure, has no
//     React dependency, and this hook and its tests share exactly one
//     implementation of it rather than risking two copies drifting
//     apart. This hook only calls resolveExactAgainstRealism (initial
//     3-PV pool — returns null if no exact quality match exists, so the
//     pool gets expanded instead of settling early) and
//     resolveAgainstRealism (expanded 8-PV pool — always resolves via
//     the ladder, no more expansion possible). Neither this hook nor
//     resolveAgainstRealism.ts knows or cares WHY a candidate was
//     rejected (SEE vs mate vs any future signal) — only whether it was
//     accepted. That's what makes adding a future realism signal free:
//     it changes ImmediatePunishment.ts only, never this hook.
//   - Survival-mode picks (buildCpTolerancePool / pickFromCpPool) are
//     NOT run through Immediate Punishment. That pipeline already
//     samples close to the best defense in an objectively bad position;
//     the premise there is damage control, not the same "obviously
//     inhuman oversight" concern this check targets.
//
// Position characterization (rollAdjustedQuality):
//   - Quality is no longer rolled at requestBotMove() time. It used to
//     be — rollQuality(config.qualityWeights) ran synchronously before
//     evaluate() was even called, since a plain roll only needs the
//     tier's static weights. rollAdjustedQuality needs the actual
//     MultiPV candidates (PV1/PV2) to characterize the position first,
//     which don't exist until the FIRST evaluation callback fires — so
//     the roll now happens inside the effect, at the start of the
//     "initial" phase, once `moves` is available, and is cached in
//     desiredQualityRef from there for the rest of that move (reused by
//     the "expanded" phase exactly as the old pre-rolled value was).
//   - Skipped for full-strength tiers (no qualityWeights) and while in
//     survival mode, for the same reasons Immediate Punishment skips
//     them — no quality-tier model applies to either case.
//   - See rollAdjustedQuality.ts for the actual
//     characterizePosition -> adjustWeights -> rollQuality composition;
//     this hook only calls it once and stores the result.

import { useCallback, useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { useStockfish } from "./useStockfish";
import {
  classifyCandidates,
  computeBestWinPercent,
  nextBotStrengthMode,
  buildCpTolerancePool,
  pickFromCpPool,
  SURVIVAL_ENTER_THRESHOLD,
  INITIAL_MULTI_PV,
  EXPANDED_MULTI_PV,
  type PvCandidate,
  type ClassifiedCandidate,
  type BotStrengthMode,
} from "@/lib/chess/botMoveSelection";
import { rollAdjustedQuality } from "@/lib/chess/rollAdjustedQuality";
import {
  resolveAgainstRealism,
  resolveExactAgainstRealism,
} from "@/lib/chess/resolveAgainstRealism";
import type { ImmediatePunishmentConfig } from "@/lib/chess/ImmediatePunishment";
import { bookMoves } from "@/lib/chess/openings";
import type { EloConfig } from "@/lib/chess/personalities";
import type { MoveQuality } from "@/lib/chess/evaluation";
import type { StockfishEval } from "@/lib/chess/stockfish";

// --- TEMPORARY self-play diagnostic switch ---------------------------
//
// Flip to true, play a few games, read the console. Flip back to false
// when done — this is not meant to ship on. Logs every Immediate
// Punishment decision (accepted AND rejected) for every bot move, so
// you can compute the actual rejection rate per rating tier directly,
// rather than inferring it from post-game review stats (which reflect
// the ENGINE'S classification of the move that was ultimately played,
// not whether Immediate Punishment intervened to get there).
//
// Read: how many REJECTED lines appear per game, at which elo, and
// whether `reason` is mostly "see" or "mate" — that tells you which
// threshold band (seeThresholdForElo / mateThresholdForElo) to look at
// first, if either turns out to be the actual cause of a rating tier
// playing stronger than intended.
const IMMEDIATE_PUNISHMENT_DEBUG = false;

const immediatePunishmentDebugConfig: ImmediatePunishmentConfig | undefined =
  IMMEDIATE_PUNISHMENT_DEBUG
    ? {
        logging: true,
        enableMateFilter: true,
        enableSeeFilter: true,
        onDecision: (decision) => {
          const tag = decision.accepted ? "accepted" : "REJECTED";
          console.log(
            `[ImmediatePunishment] elo=${decision.elo} move=${decision.move} ${tag}` +
              (decision.accepted
                ? ""
                : decision.reason === "mate"
                  ? ` reason=mate distance=${decision.mateDistance} threshold=${decision.mateThreshold}`
                  : ` reason=see loss=${decision.seeLossCentipawns}cp threshold=${decision.seeThreshold}cp`),
          );
        },
      }
    : undefined;

type BotMovePhase = "idle" | "initial" | "expanded";

export interface BotMoveRequest {
  fen: string;
  elo: number;
  config: EloConfig;
}

export interface UseBotMoveReturn {
  requestBotMove: (request: BotMoveRequest) => void;
  cancelPendingMove: () => void;
  resetBotSession: () => void;
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
  const activeEloRef = useRef<number>(0);
  // Set of book-move UCIs available from this position, or null if book
  // doesn't apply to this move (ply beyond bookPlyLimit, or no
  // qualityWeights). Computed once per requestBotMove call, reused across
  // the initial/expanded phases of that same move.
  const bookSetRef = useRef<Set<string> | null>(null);
  const cancelledRef = useRef(false);
  const thinkingRef = useRef(false);

  // Survival/quality hysteresis state — see file header. Session-scoped,
  // reset only via resetBotSession(), never inferred from position.
  const modeRef = useRef<BotStrengthMode>("quality");
  const firstDecisionRef = useRef(true);

  const setThinkingBoth = useCallback((val: boolean) => {
    thinkingRef.current = val;
    setThinking(val);
  }, []);

  const requestBotMove = useCallback((request: BotMoveRequest) => {
    if (thinkingRef.current) return;
    const { fen, elo, config } = request;

    cancelledRef.current = false;
    phaseRef.current = "initial";
    activeFenRef.current = fen;
    activeConfigRef.current = config;
    activeEloRef.current = elo;

    // Quality is no longer rolled here — see the file header's
    // "Position characterization" section. Clear any stale value from a
    // previous move defensively; it'll be freshly computed once the
    // first evaluation callback arrives, in the "initial" phase branch
    // below.
    desiredQualityRef.current = null;

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

  // Called by the app whenever a new bot session begins — New Game, Load
  // Game, Continue Position, Import PGN, Import FEN. NOT called by undo,
  // which revisits the same session rather than starting a new one.
  // Resets the survival/quality state machine so a new session never
  // inherits mode state from whatever came before it.
  const resetBotSession = useCallback(() => {
    firstDecisionRef.current = true;
    modeRef.current = "quality"; // inert — overwritten on first decision —
    // avoids leaving a stale "survival" value
    // sitting around between sessions.
  }, []);

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

  /**
   * Raw-candidate sibling of bookScopedPool, for the survival pipeline —
   * the cp-tolerance pool is built from PvCandidate[] directly, never
   * classified into quality tiers, so it needs its own filter.
   */
  function bookScopedRawPool(pool: PvCandidate[]): PvCandidate[] {
    const bookSet = bookSetRef.current;
    if (!bookSet || bookSet.size === 0) return pool;
    const filtered = pool.filter((c) => bookSet.has(c.move));
    return filtered.length > 0 ? filtered : pool;
  }

  useEffect(() => {
    if (cancelledRef.current) return;
    if (phaseRef.current === "idle") return;
    if (!evaluation) return;

    const moves = evaluation.bestMoves.filter(Boolean) as PvCandidate[];
    if (moves.length === 0) return;

    const config = activeConfigRef.current;
    const fen = activeFenRef.current;
    const elo = activeEloRef.current;

    // Full-strength tier (no qualityWeights) — always PV1, no expansion,
    // no book filtering, no survival mode, no realism check (a full-
    // strength engine playing PV1 has no "realism" model to apply to).
    // Checked via config.qualityWeights directly, NOT via desiredQualityRef
    // — that ref isn't populated yet at this point (see the "Position
    // characterization" header section), so it can no longer be used to
    // detect the full-strength case the way the pre-rolled value once was.
    if (!config?.qualityWeights) {
      phaseRef.current = "idle";
      setThinkingBoth(false);
      onMoveReady(moves[0].move);
      return;
    }

    if (phaseRef.current === "initial") {
      const bestWinPercent = computeBestWinPercent(moves);

      if (firstDecisionRef.current) {
        modeRef.current = bestWinPercent < SURVIVAL_ENTER_THRESHOLD ? "survival" : "quality";
        firstDecisionRef.current = false;
      } else {
        modeRef.current = nextBotStrengthMode(modeRef.current, bestWinPercent);
      }

      if (modeRef.current === "survival") {
        const cpTolerance = config.cpTolerance ?? 0;
        const cpPool = buildCpTolerancePool(moves, cpTolerance);
        const scoped = bookScopedRawPool(cpPool);
        const chosen = pickFromCpPool(scoped.length > 0 ? scoped : cpPool);
        phaseRef.current = "idle";
        setThinkingBoth(false);
        onMoveReady(chosen.move);
        return;
      }

      // Quality mode: characterize the position from the candidates we
      // now have in hand, adjust this tier's base qualityWeights
      // accordingly, and roll — computed once per move, right here,
      // since this is the earliest point bestMoves actually exist.
      // Cached in desiredQualityRef so the "expanded" phase (a later,
      // separate run of this effect once the wider search returns)
      // reuses the SAME rolled quality rather than rolling again.
      const desired = rollAdjustedQuality(fen, moves, config.qualityWeights);
      desiredQualityRef.current = desired;

      const classified = classifyCandidates(moves);
      console.table(
  classified.map((c) => ({
    move: c.pv.move,
    score: c.pv.score,
    mate: c.pv.mate,
    quality: c.quality,
  })),
);
      const pool = bookScopedPool(classified);
      const chosen = resolveExactAgainstRealism(pool, desired, fen, elo, immediatePunishmentDebugConfig);
      if (chosen) {
        phaseRef.current = "idle";
        setThinkingBoth(false);
        onMoveReady(chosen.move);
        return;
      }

      // No exact match in the initial 3-PV pool (book-scoped or not) —
      // expand once, same depth, to broaden the candidate pool.
      phaseRef.current = "expanded";
      const legalCount = (() => {
        try { return new Chess(fen).moves().length; } catch { return EXPANDED_MULTI_PV; }
      })();
      expandedPoolTargetRef.current = Math.min(EXPANDED_MULTI_PV, legalCount);
      evaluate(fen, config, { multiPv: expandedPoolTargetRef.current });
      return;
    }

    if (phaseRef.current === "expanded") {
      // Don't resolve against a half-streamed pool.
      if (moves.length < expandedPoolTargetRef.current) return;

      // desired was rolled and cached during this move's "initial" phase
      // (a separate, earlier run of this effect) — read back from the
      // ref rather than re-rolling, so the quality tier stays fixed for
      // the whole move even though the candidate pool got wider.
      const desired = desiredQualityRef.current;
      if (desired == null) return; // defensive: initial phase always sets this before expanding

      const classified = classifyCandidates(moves);
      const pool = bookScopedPool(classified);
      const chosen = resolveAgainstRealism(pool, desired, fen, elo, immediatePunishmentDebugConfig);
      phaseRef.current = "idle";
      setThinkingBoth(false);
      onMoveReady(chosen.move);
    }
  }, [evaluation, onMoveReady, evaluate, setThinkingBoth]);

  return { requestBotMove, cancelPendingMove, resetBotSession, thinking, evaluation, evaluate, engineError };
}