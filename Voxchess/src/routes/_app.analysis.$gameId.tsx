import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { Chess } from "chess.js";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  RotateCcw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Chessboard } from "react-chessboard";
import { BoardOverlay } from "@/components/chess/BoardOverlay";
import { EvalBar } from "@/components/chess/EvalBar";
import { ChessVoiceButton } from "@/components/voice/ChessVoiceButton";
import { TranscriptDisplay } from "@/components/voice/TranscriptDisplay";
import { getGame } from "@/lib/supabase/games";
import { saveAnnotations, getAnnotations } from "@/lib/supabase/annotations";
import { AnalysisTree, type TreeNode } from "@/lib/chess/analysisEngine";
import { useStockfish } from "@/hooks/useStockfish";
import { useVoiceStore } from "@/stores/voiceStore";
import { isSpeechSupported, startRecognition } from "@/lib/voice/speechRecognition";

export const Route = createFileRoute("/_app/analysis/$gameId")({
  head: () => ({ meta: [{ title: "Analysis — VoxChess" }] }),
  component: AnalysisPage,
});

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

// Add this function above AnalysisPage, or just before the return statement
function renderMoveTree(
  nodes: TreeNode[],
  currentNodeId: string,
  goToNode: (n: TreeNode) => void,
  depth = 0,
): React.ReactNode {
  return nodes.map((node) => {
    const moveNum = Math.ceil(node.plyIndex / 2);
    const isWhite = node.plyIndex % 2 === 1;
    const isActive = currentNodeId === node.id;
    const isVariation = !node.isMainLine;

    const moveButton = (
      <button
        key={node.id}
        onClick={() => goToNode(node)}
        className={`px-1 py-0.5 rounded hover:bg-muted transition-colors
          ${isVariation ? "italic text-muted-foreground" : ""}
          ${
            isActive
              ? isVariation
                ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold"
                : "bg-[var(--accent-chess)]/20 text-[var(--accent-chess)] font-semibold"
              : ""
          }`}
      >
        {isWhite && <span className="text-muted-foreground mr-0.5 not-italic">{moveNum}.</span>}
        {node.san}
      </button>
    );

    const mainChild = node.children.find((c) => c.isMainLine) ?? node.children[0];
    const varChildren = node.children.slice(1);

    return (
      <span key={node.id}>
        {moveButton}
        {/* Render variation branches inline in parens before continuing main line */}
        {varChildren.map((varNode) => (
          <span key={varNode.id} className="text-muted-foreground">
            {" ("}
            {renderMoveTree([varNode], currentNodeId, goToNode, depth + 1)}
            {")"}
          </span>
        ))}
        {mainChild && renderMoveTree([mainChild], currentNodeId, goToNode, depth)}
      </span>
    );
  });
}
function AnalysisPage() {
  const { gameId } = Route.useParams();
  const navigate = useNavigate();
  const { evaluation, evaluate, engineError } = useStockfish();
  const { setActive, setStatus, setTranscript, setResult } = useVoiceStore();
  const [revision, setRevision] = useState(0);
  const [tree, setTree] = useState<AnalysisTree | null>(null);
  const [currentNode, setCurrentNode] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [arrows, setArrows] = useState<Array<{ from: string; to: string }>>([]);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [rightClickFrom, setRightClickFrom] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const boardContainerRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<AnalysisTree | null>(null);

  // Keep treeRef in sync
  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);

  // Load game and annotations
  useEffect(() => {
    async function load() {
      try {
        const game = await getGame(gameId);
        if (!game.pgn) {
          toast.error("No moves in this game");
          return;
        }

        const chess = new Chess();
        chess.loadPgn(game.pgn);
        const history = chess.history();
        const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

        const t = new AnalysisTree(startFen);
        t.loadMainLine(history);
        treeRef.current = t;
        setTree(t);
        setCurrentNode(t.root);

        // Load saved annotations
        try {
          const saved = await getAnnotations(gameId);
          if (saved?.tree) {
            const restoredRoot = AnalysisTree.deserialize(saved.tree);
            t.root = restoredRoot;
            t.current = restoredRoot;
            setCurrentNode(restoredRoot);
          }
        } catch {
          /* no annotations yet */
        }
      } catch {
        toast.error("Could not load game");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [gameId]);

  // Evaluate position when node changes
  useEffect(() => {
    if (currentNode) {
      evaluate(currentNode.fen);
      setArrows(currentNode.arrows);
      setHighlights(currentNode.highlights);
    }
  }, [currentNode, evaluate]);

  const goToNode = useCallback((node: TreeNode) => {
    if (!treeRef.current) return;
    treeRef.current.goToNode(node);
    setCurrentNode({ ...node });
  }, []);

  const next = useCallback(() => {
    if (!treeRef.current) return;
    const node = treeRef.current.next();
    if (node) setCurrentNode({ ...node });
  }, []);

  const prev = useCallback(() => {
    if (!treeRef.current) return;
    const node = treeRef.current.prev();
    if (node) setCurrentNode({ ...node });
  }, []);

  const first = useCallback(() => {
    if (!treeRef.current) return;
    const node = treeRef.current.goToStart();
    setCurrentNode({ ...node });
  }, []);

  const last = useCallback(() => {
    if (!treeRef.current) return;
    const node = treeRef.current.goToEnd();
    setCurrentNode({ ...node });
  }, []);

  const backToMainLine = useCallback(() => {
    if (!treeRef.current) return;
    const node = treeRef.current.backToMainLine();
    setCurrentNode({ ...node });
    toast("Back to main line");
  }, []);

  // Drag and drop to create variations
  function handlePieceDrop(from: string, to: string): boolean {
    if (!treeRef.current || !currentNode) return false;

    // Detect pawn promotion
    const chess = new Chess(currentNode.fen);
    const piece = chess.get(from as Parameters<typeof chess.get>[0]);
    const isPromotion =
      piece?.type === "p" &&
      ((piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1"));

    const uci = isPromotion ? `${from}${to}q` : `${from}${to}`;
    const node = treeRef.current.makeMove(uci);
    if (!node) {
      toast.error("Illegal move");
      return false;
    }
    setRevision((r) => r + 1);
    setCurrentNode({ ...node });
    return true;
  }

  // Arrow drawing — right click
  function handleSquareRightClick(square: string) {
    setRightClickFrom(square);
  }

  function handleMouseUp(square: string) {
    if (!rightClickFrom) return;

    if (rightClickFrom === square) {
      // Same square — toggle highlight
      setHighlights((prev) => {
        const next = prev.includes(square) ? prev.filter((s) => s !== square) : [...prev, square];
        treeRef.current?.setHighlights(next);
        return next;
      });
    } else {
      // Different square — toggle arrow
      setArrows((prev) => {
        const exists = prev.find((a) => a.from === rightClickFrom && a.to === square);
        const next = exists
          ? prev.filter((a) => !(a.from === rightClickFrom && a.to === square))
          : [...prev, { from: rightClickFrom!, to: square }];
        treeRef.current?.setArrows(next);
        return next;
      });
    }

    setRightClickFrom(null);
  }

  function clearAnnotations() {
    setArrows([]);
    setHighlights([]);
    treeRef.current?.setArrows([]);
    treeRef.current?.setHighlights([]);
  }

  async function handleSave() {
    if (!treeRef.current) return;
    setSaving(true);
    try {
      await saveAnnotations(gameId, treeRef.current.serialize());
      toast.success("Analysis saved");
    } catch {
      toast.error("Could not save analysis");
    }
    setSaving(false);
  }

  // Arrow keys + Space
  const activateVoice = useCallback(() => {
    if (!isSpeechSupported()) {
      toast.error("Voice requires Chrome or Edge");
      return;
    }
    if (isListening) return;
    setIsListening(true);
    setActive("chess");
    setStatus("listening");
    setTranscript("");
    setResult(null);

    let resultReceived = false;
    let handle: { stop: () => void } | null = null;

    handle = startRecognition({
      onResult: (t, isFinal) => {
        setTranscript(t);
        if (!isFinal) return;
        resultReceived = true;
        handle?.stop();
        handleVoiceCommand(t.toLowerCase().trim());
      },
      onEnd: () => {
        setIsListening(false);
        if (!resultReceived) {
          setActive(null);
          setStatus("idle");
        } else
          setTimeout(() => {
            setActive(null);
            setStatus("idle");
          }, 1500);
      },
      onError: () => {
        setIsListening(false);
        setActive(null);
        setStatus("error");
      },
    });
  }, [
    isListening,
    setActive,
    setStatus,
    setTranscript,
    setResult,
    first,
    last,
    prev,
    next,
    backToMainLine,
  ]);

  function handleVoiceCommand(t: string) {
    let normalized = t;
    Object.entries(NUMBER_WORDS).forEach(([word, num]) => {
      normalized = normalized.replace(new RegExp(`\\b${word}\\b`, "g"), String(num));
    });

    if (/\b(first|start|beginning)\b/.test(normalized)) {
      first();
      setResult({ ok: true, message: "First move" });
      setStatus("success");
      return;
    }
    if (/\b(last|end|final)\b/.test(normalized)) {
      last();
      setResult({ ok: true, message: "Last move" });
      setStatus("success");
      return;
    }
    if (/\b(back|previous|prev)\b/.test(normalized)) {
      prev();
      setResult({ ok: true, message: "Previous" });
      setStatus("success");
      return;
    }
    if (/\b(next|forward)\b/.test(normalized)) {
      next();
      setResult({ ok: true, message: "Next" });
      setStatus("success");
      return;
    }
    if (/\b(main line|mainline)\b/.test(normalized)) {
      backToMainLine();
      setResult({ ok: true, message: "Main line" });
      setStatus("success");
      return;
    }

    const jumpMatch = normalized.match(/(?:go to|jump to|move|goto)\s+(\d+)/);
    if (jumpMatch) {
      const moveNum = parseInt(jumpMatch[1]);
      if (treeRef.current) {
        treeRef.current.goToMainLinePly((moveNum - 1) * 2);
        setCurrentNode({ ...treeRef.current.current });
        setResult({ ok: true, message: `Move ${moveNum}` });
        setStatus("success");
      }
      return;
    }

    setResult({ ok: false, message: `Not recognised: "${t}"` });
    setStatus("error");
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const inputFocused =
        !!el &&
        (el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          el.isContentEditable);
      if (inputFocused) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      }
      if (e.code === "Space") {
        e.preventDefault();
        activateVoice();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, activateVoice]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading game…</div>;

  if (!tree || !currentNode)
    return <div className="p-6 text-sm text-muted-foreground">No positions found.</div>;

  const mainLine = tree.getMainLinePath();
  const isOnMainLine = currentNode.isMainLine;
  const moveNumber = Math.ceil(currentNode.plyIndex / 2);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/saved-games" })}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
        </Button>
        <h2 className="text-base font-semibold">Analysis</h2>
        <Badge variant="outline">
          {currentNode.plyIndex === 0 ? "Start" : `Move ${moveNumber}`}
        </Badge>
        {!isOnMainLine && <Badge variant="secondary">Variation</Badge>}
        <div className="ml-auto flex gap-2">
          {!isOnMainLine && (
            <Button size="sm" variant="outline" onClick={backToMainLine}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Main line
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={clearAnnotations}>
            Clear
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save analysis"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr_300px] gap-4">
        {/* Eval bar */}
        <div className="flex justify-center lg:justify-start lg:items-stretch">
          <EvalBar evaluation={evaluation} />
        </div>

        {/* Board */}
        <Card className="p-3">
          <div
            ref={boardContainerRef}
            className="relative w-full max-w-[560px] mx-auto aspect-square"
            onMouseUp={(e) => {
              // Find which square the mouse was released over
              const el = document.elementFromPoint(e.clientX, e.clientY);
              const square = el?.closest("[data-square]")?.getAttribute("data-square");
              if (square) handleMouseUp(square);
              else setRightClickFrom(null);
            }}
          >
            <Chessboard
              options={{
                position: currentNode.fen,
                onPieceDrop: (args) => {
                  if (!args.targetSquare) return false;
                  return handlePieceDrop(args.sourceSquare, args.targetSquare);
                },
                onSquareRightClick: (args) => handleSquareRightClick(args.square),
                boardStyle: { borderRadius: 6, overflow: "hidden" },
                darkSquareStyle: { backgroundColor: "#769656" },
                lightSquareStyle: { backgroundColor: "#EEEED2" },
              }}
            />
            <BoardOverlay arrows={arrows} highlights={highlights} boardRef={boardContainerRef} />
          </div>

          {/* Controls */}
          <div className="mt-3 flex items-center justify-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={first}
              disabled={currentNode.plyIndex === 0}
            >
              <ChevronFirst className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={prev}
              disabled={currentNode.plyIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground font-mono w-20 text-center">
              {currentNode.plyIndex} / {mainLine.length - 1}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={next}
              disabled={currentNode.children.length === 0}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={last}
              disabled={currentNode.children.length === 0}
            >
              <ChevronLast className="h-4 w-4" />
            </Button>
          </div>
        </Card>

        {/* Right panel */}
        <div className="space-y-3">
          {/* Engine eval */}
          <Card className="p-4">
            <div
              className="text-xs font-medium uppercase tracking-wider
    text-muted-foreground mb-3"
            >
              Engine
            </div>
            {evaluation ? (
              <div className="space-y-2">
                {evaluation.bestMoves.map((m, i) => {
                  const chess = new Chess(currentNode.fen);
                  let san = m.move;
                  try {
                    const from = m.move.slice(0, 2);
                    const to = m.move.slice(2, 4);
                    const promo = m.move.slice(4) || undefined;
                    const result = chess.move({ from, to, promotion: promo });
                    if (result) san = result.san;
                  } catch {
                    /* keep uci */
                  }

                  const scoreLabel =
                    m.mate !== null
                      ? `${m.mate > 0 ? "+" : "-"}M${Math.abs(m.mate)}`
                      : `${m.score >= 0 ? "+" : ""}${(m.score / 100).toFixed(1)}`;

                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between
            text-sm py-1 border-b border-border/30 last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="text-[10px] w-5
                h-5 p-0 flex items-center justify-center"
                        >
                          {i + 1}
                        </Badge>
                        <span className="font-mono">{san}</span>
                      </div>
                      <span
                        className={`font-mono text-xs font-semibold ${
                          m.score > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : m.score < 0
                              ? "text-destructive"
                              : "text-muted-foreground"
                        }`}
                      >
                        {scoreLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : engineError ? (
              <div className="text-xs text-destructive">Engine failed to load</div>
            ) : (
              <div className="text-xs text-muted-foreground">Analysing…</div>
            )}
          </Card>

          {/* Move list with variations */}
          <Card className="p-4">
            <div
              className="text-xs font-medium uppercase tracking-wider
              text-muted-foreground mb-3"
            >
              Moves
            </div>
            <ScrollArea className="h-48">
              <div className="font-mono text-xs pr-2 leading-6">
                {tree.root.children.length > 0 ? (
                  renderMoveTree([tree.root.children[0]], currentNode.id, goToNode)
                ) : (
                  <span className="text-muted-foreground">No moves</span>
                )}
              </div>
            </ScrollArea>
          </Card>

          {/* Voice */}
          <Card className="p-4 text-center">
            <div
              className="text-xs text-muted-foreground uppercase
              tracking-wider mb-3"
            >
              Voice navigation
            </div>
            <ChessVoiceButton onActivate={activateVoice} isActive={isListening} enabled />
            <div className="text-xs text-muted-foreground mt-2">
              Space · "next" · "previous" · "go to move 5" · "main line"
            </div>
            <TranscriptDisplay mode="chess" />
          </Card>
        </div>
      </div>
    </div>
  );
}
