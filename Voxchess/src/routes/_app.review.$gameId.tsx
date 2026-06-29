// src/routes/_app/review.$gameId.tsx

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { Chess } from "chess.js";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

import { useStockfish } from "@/hooks/useStockfish";
import { getGame, updateGamePgn } from "@/lib/supabase/games";

import {
  buildReviewModel,
  buildAnnotatedPgn,
  classifyMove,
  countMaterial,
  parseMoveAnnotation,
  getReviewVersion,
  getReviewDepth,
  reviewNeedsUpgrade,
  type ReviewModel,
  type MoveReview,
  type EngineLine,
  type MaterialCount,
} from "@/lib/chess/reviewEngine";
import { detectOpening } from "@/lib/chess/openings";
import { uciPvToSan } from "@/lib/chess/pvUtils";
import { buildGameCardData } from "@/lib/chess/gameCard";

import { ReviewOverview } from "@/components/review/ReviewOverview";
import { ReviewBoard } from "@/components/review/ReviewBoard";
import type { PersonalityId, EloConfig } from "@/lib/chess/personalities";

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_app/review/$gameId")({
  head: () => ({ meta: [{ title: "Game Review — VoxChess" }] }),
  component: ReviewPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type ReviewPhase = "setup" | "computing" | "overview" | "board";

type DepthPreset = "quick" | "balanced" | "deep";

const DEPTH_PRESETS: Record<DepthPreset, { label: string; depth: number; description: string }> = {
  quick: { label: "Quick", depth: 12, description: "~5–10 seconds" },
  balanced: { label: "Balanced", depth: 18, description: "~20–40 seconds" },
  deep: { label: "Deep", depth: 24, description: "~60–120 seconds" },
};

/**
 * Stockfish result for a single board position.
 * N+1 of these are built before any MoveReview is derived.
 */
type PositionAnalysis = {
  readonly ply: number;          // 0 = starting position
  readonly fen: string;
  readonly evaluation: {
    readonly cp: number | null;       // centipawns, White's perspective
    readonly mate: number | null;     // forced-mate count, White's perspective
  };
  readonly bestLine: readonly {
    readonly move: string;             // UCI
    readonly pv: string;             // full PV
    readonly score: number;          // already side-to-move perspective
    readonly mate: number | null;
  }[];
  readonly material: MaterialCount;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReviewEloConfig(depth: number): EloConfig {
  return { label: "Review", depth, requestedDepth: depth };
}

function uciToSan(fen: string, uci: string): string {
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? (uci[4] as "q" | "r" | "b" | "n") : undefined,
    });
    return move?.san ?? uci;
  } catch {
    return uci;
  }
}

// ─── PGN utilities ────────────────────────────────────────────────────────────

function getPgnHeader(pgn: string, key: string): string | null {
  const match = pgn.match(new RegExp(`\\[${key}\\s+"([^"]*)"\\]`));
  return match ? match[1] : null;
}

function buildFenHistory(pgn: string, startFen: string | null): string[] {
  const chess = startFen ? new Chess(startFen) : new Chess();
  const fens: string[] = [chess.fen()];
  try {
    const temp = startFen ? new Chess(startFen) : new Chess();
    temp.loadPgn(pgn);
    for (const san of temp.history()) {
      chess.move(san);
      fens.push(chess.fen());
    }
  } catch { /* return whatever was built before the error */ }
  return fens;
}

function extractSanMoves(pgn: string, startFen: string | null): string[] {
  try {
    const chess = startFen ? new Chess(startFen) : new Chess();
    chess.loadPgn(pgn);
    return chess.history();
  } catch {
    return [];
  }
}

function sanToUci(fen: string, san: string): string | null {
  try {
    const chess = new Chess(fen);
    const move = chess.move(san);
    if (!move) return null;
    return `${move.from}${move.to}${move.promotion ?? ""}`;
  } catch {
    return null;
  }
}

// ─── Existing review parser ───────────────────────────────────────────────────

function parseExistingReview(pgn: string, startFen: string | null): ReviewModel | null {
  const version = getReviewVersion(pgn);
  if (version === null) return null;

  const depth = getReviewDepth(pgn) ?? 18;
  const fenHistory = buildFenHistory(pgn, startFen);
  const sanMoves = extractSanMoves(pgn, startFen);
  if (sanMoves.length === 0) return null;

  const reviewedMoveCount = parseInt(getPgnHeader(pgn, "VoxReviewMoveCount") ?? "0", 10);
  if (reviewedMoveCount !== sanMoves.length) return null;

  const moveTokenRegex =
    /\d+\.{1,3}\s*|([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[KQRBN])?[+#]?|O-O(?:-O)?[+#]?)(\s*\$(\d+))?(?:\s*\{([^}]*)\})?/g;

  const parsedAnnotations: ReturnType<typeof parseMoveAnnotation>[] = [];
  let match: RegExpExecArray | null;
  while ((match = moveTokenRegex.exec(pgn)) !== null) {
    const san = match[1];
    const nagStr = match[3] ? `$${match[3]}` : null;
    const comment = match[4] ?? "";
    if (!san) continue;
    parsedAnnotations.push(parseMoveAnnotation(comment, nagStr));
  }
  if (parsedAnnotations.length < sanMoves.length) return null;

  // Pass the full fenHistory (including starting position at index 0).
  // lastBookPly is then directly comparable to the 1-indexed ply number.
  const { eco, name, lastBookPly } = detectOpening(fenHistory);

  const partialMoves: Omit<MoveReview, "phase">[] = sanMoves.map((san, i) => {
    const ann = parsedAnnotations[i];
    const ply = i + 1;
    const fenBefore = fenHistory[i];
    const fenAfter = fenHistory[i + 1] ?? fenHistory[fenHistory.length - 1];
    const uci = sanToUci(fenBefore, san) ?? "";
    const isBook = ply <= lastBookPly;

    return {
      ply,
      san,
      uci,
      fenBefore,
      fenAfter,
      evalBefore: null,
      evalAfter: ann.eval,
      mateBefore: null,
      mateAfter: ann.mate,
      bestMove: uci,
      bestMoveSan: ann.bestMoveSan ?? san,
      bestMoveEval: ann.bestMoveEval,
      bestMoveMate: ann.bestMoveMate,
      cpLoss: 0,
      // Recovered from the [%wpl] PGN tag (parseMoveAnnotation). PGNs saved
      // before this tag existed have no [%wpl] match and fall back to 0
      // inside parseMoveAnnotation — but those PGNs are version < 4 anyway,
      // so reviewNeedsUpgrade() already forces the "setup" phase prompting
      // re-analysis before this value would be used in an accuracy
      // computation.
      winPercentLoss: ann.winPercentLoss,
      classification: ann.classification ?? (isBook ? "book" : "good"),
      isBook,
      engineLines: [],
    };
  });

  return buildReviewModel({ depth, moves: partialMoves, opening: name, eco, lastBookPly });
}

// ─── Component ────────────────────────────────────────────────────────────────

function ReviewPage() {
  const { gameId } = Route.useParams();
  const navigate = useNavigate();
  const { evaluate, evaluation } = useStockfish();

  // ── Game data ─────────────────────────────────────────────────────────────
  const [pgn, setPgn] = useState<string>("");
  const [startFen, setStartFen] = useState<string | null>(null);
  const [gameResult, setGameResult] = useState<string | null>(null);
  const [personalityId, setPersonalityId] = useState<PersonalityId | null>(null);
  const [playerColor, setPlayerColor] = useState<"white" | "black">("white");
  const [whiteName, setWhiteName] = useState<string | undefined>(undefined);
  const [blackName, setBlackName] = useState<string | undefined>(undefined);
  const [fenHistory, setFenHistory] = useState<readonly string[]>([]);
  const [sanMoves, setSanMoves] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Review state ──────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<ReviewPhase>("setup");
  const [depthPreset, setDepthPreset] = useState<DepthPreset>("balanced");
  const [review, setReview] = useState<ReviewModel | null>(null);
  const [stashedReview, setStashedReview] = useState<ReviewModel | null>(null);
  const [progress, setProgress] = useState(0);
  const [overviewPly, setOverviewPly] = useState(0);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const cancelledRef = useRef(false);
  // Holds the resolve function for the currently in-flight evaluateAsync() call.
  const pendingEvalRef = useRef<((result: NonNullable<typeof evaluation>) => void) | null>(null);
  const pendingDepthRef = useRef(0);

  // ── Load game ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const g = await getGame(gameId);
        if (cancelled) return;

        const resolvedPgn = g.pgn ?? "";
        const resolvedStartFen = g.start_fen ?? null;
        const result = g.result ?? null;
        const meta = g.metadata as { personalityId?: string; playerColor?: string } | null;
        const pid = (meta?.personalityId as PersonalityId | undefined) ?? null;
        const pc = meta?.playerColor === "black" ? "black" : "white";

        // Single source of truth for display names (PGN header -> legacy
        // metadata -> bot personality fallback chain) — same resolver My
        // Games / Imported Games / Study Detail / Profile already use.
        const cardData = buildGameCardData(g);

        setPgn(resolvedPgn);
        setStartFen(resolvedStartFen);
        setGameResult(result);
        setPersonalityId(pid);
        setPlayerColor(pc);
        setWhiteName(cardData.white.name);
        setBlackName(cardData.black.name);

        const fens = buildFenHistory(resolvedPgn, resolvedStartFen);
        const sans = extractSanMoves(resolvedPgn, resolvedStartFen);
        setFenHistory(fens);
        setSanMoves(sans);

        const existing = parseExistingReview(resolvedPgn, resolvedStartFen);
        if (existing) {
          setReview(existing);
          setPhase(reviewNeedsUpgrade(resolvedPgn) ? "setup" : "overview");
        } else {
          setPhase("setup");
        }
      } catch {
        if (!cancelled) setLoadError("Could not load game.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [gameId]);

  // ── Evaluation promise bridge ─────────────────────────────────────────────
  // Each time Stockfish produces a result, resolve the pending evaluateAsync promise.
  useEffect(() => {
    if (!evaluation || !pendingEvalRef.current) return;

    // Wait until Stockfish reaches the requested depth.
    if (evaluation.depth < pendingDepthRef.current) return;

    const resolve = pendingEvalRef.current;
    pendingEvalRef.current = null;
    resolve(evaluation);
  }, [evaluation]);

  const evaluateAsync = useCallback(
    (fen: string, config: EloConfig): Promise<NonNullable<typeof evaluation>> =>
      new Promise((resolve) => {
        if (pendingEvalRef.current) {
          throw new Error("evaluateAsync called while another evaluation is pending");
        }

        pendingDepthRef.current = config.depth ?? 20;
        pendingEvalRef.current = resolve;
        evaluate(fen, config);
      }),
    [evaluate],
  );

  // ── startReview ───────────────────────────────────────────────────────────
  const startReview = useCallback(async () => {
    if (sanMoves.length === 0) { toast.error("No moves to analyse."); return; }
    if (review) setStashedReview(review);

    cancelledRef.current = false;

    const depth = DEPTH_PRESETS[depthPreset].depth;
    const config = makeReviewEloConfig(depth);
    const positions = fenHistory;

    setProgress(0);
    setPhase("computing");

    // ── Stage 1: evaluate every position exactly once ──────────────────────
    // N moves → N+1 positions.  Each position is passed to Stockfish once.
    // MoveReview pairs are derived afterwards from consecutive entries.
    const analyses: PositionAnalysis[] = [];

    try {
      const terminal = new Chess(positions.at(-1)!);

      const positionsToEvaluate = terminal.isGameOver()
        ? positions.length - 1
        : positions.length;


      for (let ply = 0; ply < positionsToEvaluate; ply++) {
        if (cancelledRef.current) return;

        const result = await evaluateAsync(positions[ply], config);

        analyses.push({
          ply,
          fen: positions[ply],
          evaluation: { cp: result.score ?? null, mate: result.mate ?? null },
          bestLine: result.bestMoves ?? [],
          material: countMaterial(positions[ply]),
        });

        setProgress((ply + 1) / positions.length);
      }


      if (terminal.isGameOver()) {
        // For checkmate specifically, synthesize a signed mate value (White's
        // perspective, matching evaluation.mate's contract elsewhere) instead
        // of leaving it null. Without this, classifyMove's missedWin check
        // (mateBefore > 0 && mateAfter === null) cannot distinguish "the
        // game ended in checkmate" from "we didn't evaluate this terminal
        // position" — both produce mateAfter === null — so the actual
        // mating move gets misclassified as a missed win instead of best.
        //
        // Other terminal states (stalemate, insufficient material, etc.)
        // correctly leave mate as null: no mate was delivered, so a forced
        // mate that was missed in favor of a draw should still surface as
        // a genuine missedWin.
        const isCheckmate = terminal.isCheckmate();
        // terminal.turn() is the side with no legal moves — i.e. the side
        // who got checkmated. If White got mated, that's bad for White
        // (negative); if Black got mated, White delivered it (positive).
        const matedSide = terminal.turn();
        const syntheticMate = isCheckmate ? (matedSide === "w" ? -1 : 1) : null;

        analyses.push({
          ply: positions.length - 1,
          fen: positions.at(-1)!,
          evaluation: { cp: null, mate: syntheticMate },
          bestLine: [],
          material: countMaterial(positions.at(-1)!),
        });
      }
    } catch {
      if (!cancelledRef.current) {
        toast.error("Analysis failed.");
        // Restore previous review if one existed, otherwise return to setup.
        if (review) {
          setReview(review);
          setStashedReview(null);
          setPhase("overview");
        } else {
          setPhase("setup");
        }
      }
      return;
    }

    if (cancelledRef.current) return;

    // ── Stage 2: detect opening once ──────────────────────────────────────
    const { eco, name, lastBookPly } = detectOpening(positions);

    // ── Stage 3: derive MoveReview[] from consecutive PositionAnalysis pairs
    const moves: Omit<MoveReview, "phase">[] = sanMoves.map((san, moveIdx) => {
      const before = analyses[moveIdx];
      const after = analyses[moveIdx + 1];

      // Extract side-to-move directly from FEN field 2 — avoids a Chess() instance.
      const sideToMove = before.fen.split(" ")[1] as "w" | "b";

      // useStockfish contract (verified against applyHumanError, which only
      // reorders bestMoves[] entries without transforming score/mate —
      // meaning each entry's score and mate must already share one
      // consistent perspective, since they're treated as an atomic unit):
      //   evaluation.cp / evaluation.mate   — White's perspective
      //   bestLine[].score / bestLine[].mate — side-to-move perspective
      //
      // Both evaluation.cp AND evaluation.mate are flipped here — they share
      // the White's-perspective contract. (Earlier code only flipped cp and
      // left mate unflipped, which silently inverted "missed forced mate"
      // detection for Black — fixed here.)
      // Do NOT apply flipSign to bestLine[].score or bestLine[].mate — they
      // are already side-to-move and flipping them would silently break
      // move classification.
      const flipSign = sideToMove === "b" ? -1 : 1;

      const uci = sanToUci(before.fen, san) ?? "";
      const bestEntry = before.bestLine[0];
      const bestMoveUci = bestEntry?.move ?? uci;
      const bestMoveSan = uciToSan(before.fen, bestMoveUci);
      // Flip mate as well for consistency.
      const bestMoveMate =
        bestEntry?.mate != null
          ? bestEntry.mate * flipSign
          : null;

      const evalBeforeSide = (before.evaluation.cp ?? 0) * flipSign;
      const evalAfterSide = (after.evaluation.cp ?? 0) * flipSign;
      // Flip best eval to side-to-move perspective.
      const bestEvalSide =
        bestEntry
          ? bestEntry.score * flipSign
          : evalAfterSide;

      const mateBeforeSide = before.evaluation.mate !== null ? before.evaluation.mate * flipSign : null;
      const mateAfterSide = after.evaluation.mate !== null ? after.evaluation.mate * flipSign : null;

      const isBook = (moveIdx + 1) <= lastBookPly;
      const secondEntry = before.bestLine[1];
      // Flip second PV as well.
      const secondBestEval =
        secondEntry
          ? secondEntry.score * flipSign
          : null;
      const secondBestMate =
        secondEntry?.mate != null
          ? secondEntry.mate * flipSign
          : null;


      const { classification, cpLoss, winPercentLoss } = classifyMove({
        uci,
        bestMove: bestMoveUci,
        evalBefore: evalBeforeSide,
        evalAfter: evalAfterSide,
        bestMoveEval: bestEvalSide,
        bestMoveMate,
        mateBefore: mateBeforeSide,
        mateAfter: mateAfterSide,
        materialBefore: before.material,
        materialAfter: after.material,
        sideToMove,
        isBook,
        secondBestEval,
        secondBestMate,
      });

      // Full PV lines — same model as the analysis page (uciPvToSan, slice 6).
      const engineLines: EngineLine[] = before.bestLine.slice(0, 3).map((bm) => ({
        moves: bm.pv.split(" "),
        san: uciPvToSan(before.fen, bm.pv).slice(0, 6),
        eval: bm.score ?? null,
        mate: bm.mate ?? null,
        depth,
      }));

      return {
        ply: moveIdx + 1,
        san,
        uci,
        fenBefore: before.fen,
        fenAfter: after.fen,
        evalBefore: before.evaluation.cp,
        evalAfter: after.evaluation.cp,
        mateBefore: before.evaluation.mate,
        mateAfter: after.evaluation.mate,
        bestMove: bestMoveUci,
        bestMoveSan,
        bestMoveEval: bestEntry?.score ?? null,
        bestMoveMate,
        cpLoss,
        winPercentLoss,
        classification,
        isBook,
        engineLines,
      };
    });

    // ── Stage 4: build ReviewModel ─────────────────────────────────────────
    const model = buildReviewModel({ depth, moves, opening: name, eco, lastBookPly });

    // ── Stage 5: persist annotated PGN ────────────────────────────────────
    const headers: Record<string, string> = {};
    const headerRegex = /\[(\w+)\s+"([^"]*)"\]/g;
    let headerMatch: RegExpExecArray | null;
    while ((headerMatch = headerRegex.exec(pgn)) !== null) {
      headers[headerMatch[1]] = headerMatch[2];
    }

    const annotatedPgn = buildAnnotatedPgn(headers, model.moves, depth);
    try {
      await updateGamePgn(gameId, annotatedPgn, gameResult ?? "*");
    } catch {
      toast.error("Could not save review annotations.");
    }

    setReview(model);
    setStashedReview(null);
    setPhase("overview");
  }, [sanMoves, fenHistory, depthPreset, review, evaluateAsync, pgn, gameId, gameResult]);

  // ── cancelReview ──────────────────────────────────────────────────────────
  const cancelReview = useCallback(() => {
    cancelledRef.current = true;
    // Leave pendingEvalRef.current intact. When Stockfish finishes, the promise
    // resolves normally, the loop checks cancelledRef and returns cleanly.
    // Clearing it here would leave the await in startReview permanently hung.

    if (stashedReview) {
      setReview(stashedReview);
      setStashedReview(null);
      setPhase("overview");
    } else {
      setPhase("setup");
    }
  }, [stashedReview]);

  // ── Re-analyse ────────────────────────────────────────────────────────────
  const handleReanalyse = useCallback(() => {
    setPhase("setup");
  }, []);

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading game…</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Button variant="outline" onClick={() => navigate({ to: "/games/my-games" })}>
          Back to Games
        </Button>
      </div>
    );
  }

  // ── Setup / computing screen ──────────────────────────────────────────────

  if (phase === "setup" || phase === "computing") {
    const isComputing = phase === "computing";
    const progressPct = Math.round(progress * 100);
    const totalMoves = sanMoves.length;
    const doneMoves = Math.round(progress * totalMoves);

    return (
      <div className="h-full overflow-y-auto">
        <div className="p-6 max-w-md mx-auto space-y-5">

          {/* Header */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate({ to: "/games/my-games" })}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div>
              <h2 className="text-lg font-semibold">Game Review</h2>
              <p className="text-xs text-muted-foreground">
                {getPgnHeader(pgn, "White") ?? "White"} vs{" "}
                {getPgnHeader(pgn, "Black") ?? "Black"} · {totalMoves} moves
              </p>
            </div>
          </div>

          {/* Existing review notice */}
          {review && !isComputing && (
            <div className="px-3 py-2.5 rounded-lg bg-[var(--accent-blue)]/10
                            border border-[var(--accent-blue)]/30 text-xs
                            text-[var(--accent-blue)]">
              A review at depth {review.depth} already exists.
              Choose a depth below to re-analyse.
            </div>
          )}

          {/* Depth picker */}
          {!isComputing && (
            <Card className="p-5 space-y-3">
              <div className="text-sm font-medium">Analysis Depth</div>
              <div className="grid grid-cols-3 gap-2">
                {(Object.entries(DEPTH_PRESETS) as [DepthPreset, typeof DEPTH_PRESETS[DepthPreset]][]).map(
                  ([key, preset]) => (
                    <button
                      key={key}
                      onClick={() => setDepthPreset(key)}
                      className={`p-3 rounded-lg border-2 transition-all text-center ${depthPreset === key
                        ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10"
                        : "border-border hover:border-foreground/40"
                        }`}
                    >
                      <div className="text-sm font-semibold">{preset.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {preset.description}
                      </div>
                    </button>
                  ),
                )}
              </div>
            </Card>
          )}

          {/* Progress */}
          {isComputing && (
            <Card className="p-5 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Analysing…</span>
                <span className="text-muted-foreground font-mono">
                  {doneMoves} / {totalMoves}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-[var(--accent-blue)] transition-all duration-300 rounded-full"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Depth {DEPTH_PRESETS[depthPreset].depth} · {DEPTH_PRESETS[depthPreset].description}
              </p>
            </Card>
          )}

          {/* Actions */}
          {isComputing ? (
            <Button variant="outline" className="w-full" onClick={cancelReview}>
              Cancel
            </Button>
          ) : (
            <Button className="w-full" size="lg" onClick={startReview}>
              {review ? "Re-analyse" : "Start Review"}
            </Button>
          )}

        </div>
      </div>
    );
  }

  // ── Overview ──────────────────────────────────────────────────────────────

  if (phase === "overview" && review) {
    return (
      <ReviewOverview
        review={review}
        gameResult={gameResult}
        totalMoves={sanMoves.length}
        playerColor={playerColor}
        personalityId={personalityId}
        onReviewGame={() => setPhase("board")}
        onReanalyse={handleReanalyse}
        currentPly={overviewPly}
        onSelectPly={setOverviewPly}
      />
    );
  }

  // ── Board ─────────────────────────────────────────────────────────────────

  if (phase === "board" && review) {
    return (
      <ReviewBoard
        review={review}
        fenHistory={fenHistory}
        playerColor={playerColor}
        personalityId={personalityId}
        whiteName={whiteName}
        blackName={blackName}
        onBackToOverview={() => setPhase("overview")}
      />
    );
  }

  return null;
}