import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback, Fragment } from "react";
import { Chess } from "chess.js";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  RotateCcw,
  GripIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Chessboard } from "react-chessboard";
import { BoardOverlay } from "@/components/chess/BoardOverlay";
import { EvalBar } from "@/components/chess/EvalBar";
import { getGame } from "@/lib/supabase/games";
import { saveAnnotations, getAnnotations } from "@/lib/supabase/annotations";
import { AnalysisTree, type TreeNode } from "@/lib/chess/analysisEngine";
import { useStockfish } from "@/hooks/useStockfish";
import { useVoiceStore } from "@/stores/voiceStore";
import { isSpeechSupported, startRecognition } from "@/lib/voice/speechRecognition";
import { useSettingsStore, BOARD_THEMES } from "@/stores/settingsStore";

export const Route = createFileRoute("/_app/analysis/$gameId")({
  head: () => ({ meta: [{ title: "Analysis — VoxChess" }] }),
  component: AnalysisPage,
});

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

function renderMoveTree(
  nodes: TreeNode[],
  currentNodeId: string,
  goToNode: (n: TreeNode) => void,
  depth = 0,
): React.ReactNode {
  return nodes.map((node) => {
    const moveNum = Math.ceil(node.plyIndex / 2);
    const isWhite = node.plyIndex % 2 === 1;
    const isVariation = !node.isMainLine;
    const moveButton = (
      <button
        key={node.id}
        onClick={() => goToNode(node)}
        className={`px-1 py-0.5 rounded hover:bg-muted transition-colors
          ${isVariation ? "italic text-muted-foreground" : ""}
          ${currentNodeId === node.id
            ? isVariation
              ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold"
              : "bg-[var(--accent-chess)]/20 text-[var(--accent-chess)] font-semibold"
            : ""}`}
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
        {varChildren.map((varNode) => (
          <span key={varNode.id} className="text-muted-foreground">
            {" ("}{renderMoveTree([varNode], currentNodeId, goToNode, depth + 1)}{")"}
          </span>
        ))}
        {mainChild && renderMoveTree([mainChild], currentNodeId, goToNode, depth)}
      </span>
    );
  });
}

// Compute initial board size from viewport dimensions.
function calcInitialBoardSize(): number {
  if (typeof window === "undefined") return 480;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const headerH = 64;
  const topBarH = 76;
  const navCtrlH = 52;
  const cardPadding = 24;
  const pagePadding = 24;
  const availH = vh - headerH - topBarH - navCtrlH - cardPadding - pagePadding;
  let availW: number;
  if (vw >= 1024) {
    availW = vw - 240 - 312 - 32 - cardPadding - pagePadding - 16;
  } else if (vw >= 768) {
    availW = vw - 240 - 32 - cardPadding - pagePadding;
  } else {
    availW = vw - 32 - cardPadding - pagePadding;
  }
  return Math.min(Math.max(Math.min(availH, availW), 180), 600);
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

  // Board size — starts from viewport math, overridden by drag
  const [boardSize, setBoardSize] = useState(calcInitialBoardSize);

  // Card ref used to clamp drag max to card's inner dimensions
  const boardCardRef = useRef<HTMLDivElement>(null);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<AnalysisTree | null>(null);
  const { setActivateChessCallback } = useVoiceStore();
  const { boardThemeIndex } = useSettingsStore();
  const boardTheme = BOARD_THEMES[boardThemeIndex] ?? BOARD_THEMES[0];

  // Recalculate initial size on window resize (only when user hasn't manually dragged)
  const userResizedRef = useRef(false);
  useEffect(() => {
    function onResize() {
      if (!userResizedRef.current) {
        setBoardSize(calcInitialBoardSize());
      }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── Drag-to-resize logic ──────────────────────────────────────────────────
  // We track the pointer position delta from where the drag started and
  // add that to the board size at drag start. The board stays square so
  // both width and height grow/shrink by the same amount.
  const dragStartRef = useRef<{ x: number; y: number; size: number } | null>(null);

  const onDragHandlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragStartRef.current = { x: e.clientX, y: e.clientY, size: boardSize };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [boardSize]);

  const onDragHandlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    e.preventDefault();

    // Delta: moving right/down = bigger, left/up = smaller
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const delta = (dx + dy) / 2;
    const newRaw = dragStartRef.current.size + delta;

    // Clamp: min 180px, max = smaller of card's inner width/height minus eval bar
    const card = boardCardRef.current;
    let maxSize = 600;
    if (card) {
      const rect = card.getBoundingClientRect();
      // Card inner size minus eval bar (32px) minus gap (8px) minus nav controls (52px) minus padding (24px)
      const maxW = rect.width - 32 - 8 - 24;
      const maxH = rect.height - 52 - 24;
      maxSize = Math.min(maxW, maxH, 600);
    }

    userResizedRef.current = true;
    setBoardSize(Math.min(Math.max(newRaw, 180), maxSize));
  }, []);

  const onDragHandlePointerUp = useCallback(() => {
    dragStartRef.current = null;
  }, []);

  useEffect(() => { treeRef.current = tree; }, [tree]);

  useEffect(() => {
    async function load() {
      try {
        const game = await getGame(gameId);
        if (!game.pgn) { toast.error("No moves in this game"); return; }
        const chess = new Chess();
        chess.loadPgn(game.pgn);
        const history = chess.history();
        const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        const t = new AnalysisTree(startFen);
        t.loadMainLine(history);
        treeRef.current = t;
        setTree(t);
        setCurrentNode(t.root);
        try {
          const saved = await getAnnotations(gameId);
          if (saved?.tree) {
            const restoredRoot = AnalysisTree.deserialize(saved.tree);
            t.root = restoredRoot;
            t.current = restoredRoot;
            setCurrentNode(restoredRoot);
          }
        } catch { /* no annotations yet */ }
      } catch { toast.error("Could not load game"); }
      finally { setLoading(false); }
    }
    load();
  }, [gameId]);

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

  const handleVoiceCommand = useCallback((t: string) => {
    let normalized = t;
    Object.entries(NUMBER_WORDS).forEach(([word, num]) => {
      normalized = normalized.replace(new RegExp(`\\b${word}\\b`, "g"), String(num));
    });
    if (/\b(first|start|beginning)\b/.test(normalized)) {
      first(); setResult({ ok: true, message: "First move" }); setStatus("success"); return;
    }
    if (/\b(last|end|final)\b/.test(normalized)) {
      last(); setResult({ ok: true, message: "Last move" }); setStatus("success"); return;
    }
    if (/\b(back|previous|prev)\b/.test(normalized)) {
      prev(); setResult({ ok: true, message: "Previous" }); setStatus("success"); return;
    }
    if (/\b(next|forward)\b/.test(normalized)) {
      next(); setResult({ ok: true, message: "Next" }); setStatus("success"); return;
    }
    if (/\b(main line|mainline)\b/.test(normalized)) {
      backToMainLine(); setResult({ ok: true, message: "Main line" }); setStatus("success"); return;
    }
    const jumpMatch = normalized.match(/(?:go to|jump to|move|goto)\s+(\d+)/);
    if (jumpMatch) {
      const moveNum = parseInt(jumpMatch[1]);
      if (treeRef.current) {
        treeRef.current.goToMainLinePly(moveNum * 2 - 1);
        setCurrentNode({ ...treeRef.current.current });
        setResult({ ok: true, message: `Move ${moveNum}` });
        setStatus("success");
      }
      return;
    }
    setResult({ ok: false, message: `Not recognised: "${t}"` });
    setStatus("error");
  }, [first, last, prev, next, backToMainLine, setResult, setStatus]);

  const activateVoice = useCallback(() => {
    if (!isSpeechSupported()) { toast.error("Voice requires Chrome or Edge"); return; }
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
        if (!resultReceived) { setActive(null); setStatus("idle"); }
        else { setTimeout(() => { setActive(null); setStatus("idle"); }, 1500); }
      },
      onError: () => { setIsListening(false); setActive(null); setStatus("error"); },
    });
  }, [isListening, handleVoiceCommand, setActive, setStatus, setTranscript, setResult]);

  useEffect(() => {
    setActivateChessCallback(activateVoice);
    return () => setActivateChessCallback(null);
  }, [activateVoice, setActivateChessCallback]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const inputFocused =
        !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable);
      if (inputFocused) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      if (e.code === "Space") { e.preventDefault(); activateVoice(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, activateVoice]);

  function handlePieceDrop(from: string, to: string): boolean {
    if (!treeRef.current || !currentNode) return false;
    const chess = new Chess(currentNode.fen);
    const piece = chess.get(from as Parameters<typeof chess.get>[0]);
    const isPromotion =
      piece?.type === "p" &&
      ((piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1"));
    const uci = isPromotion ? `${from}${to}q` : `${from}${to}`;
    const node = treeRef.current.makeMove(uci);
    if (!node) { toast.error("Illegal move"); return false; }
    setRevision((r) => r + 1);
    setCurrentNode({ ...node });
    return true;
  }

  function handleSquareRightClick(square: string) { setRightClickFrom(square); }

  function handleMouseUp(square: string) {
    if (!rightClickFrom) return;
    if (rightClickFrom === square) {
      setHighlights((prev) => {
        const next = prev.includes(square) ? prev.filter((s) => s !== square) : [...prev, square];
        treeRef.current?.setHighlights(next);
        return next;
      });
    } else {
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
    setArrows([]); setHighlights([]);
    treeRef.current?.setArrows([]); treeRef.current?.setHighlights([]);
  }

  async function handleSave() {
    if (!treeRef.current) return;
    setSaving(true);
    try {
      await saveAnnotations(gameId, treeRef.current.serialize());
      toast.success("Analysis saved");
    } catch { toast.error("Could not save analysis"); }
    setSaving(false);
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading game…</div>;
  if (!tree || !currentNode)
    return <div className="p-6 text-sm text-muted-foreground">No positions found.</div>;

  const mainLine = tree.getMainLinePath();
  const isOnMainLine = currentNode.isMainLine;
  const moveNumber = Math.ceil(currentNode.plyIndex / 2);

  return (
    <div className="flex flex-col h-full overflow-hidden p-3 gap-3">

      {/* Top bar */}
      <div className="flex items-center gap-3 flex-wrap shrink-0">
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
          <Button size="sm" variant="outline" onClick={clearAnnotations}>Clear</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save analysis"}
          </Button>
        </div>
      </div>

      {/* Main grid */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3 overflow-hidden">

        {/* Board card */}
        <Card ref={boardCardRef} className="p-3 overflow-hidden">
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <div className="flex gap-2 items-center">

              {/* Eval bar */}
              <div className="flex-shrink-0" style={{ height: boardSize }}>
                <EvalBar evaluation={evaluation} />
              </div>

              {/* Board + drag handle */}
              <div className="relative flex-shrink-0">
                <div
                  ref={boardContainerRef}
                  style={{ width: boardSize, height: boardSize }}
                  onMouseUp={(e) => {
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
                      darkSquareStyle: { backgroundColor: boardTheme.dark },
                      lightSquareStyle: { backgroundColor: boardTheme.light },
                    }}
                  />
                  <BoardOverlay
                    arrows={arrows}
                    highlights={highlights}
                    boardRef={boardContainerRef}
                  />
                </div>

                {/* Drag handle — bottom-right corner of the board */}
                <div
                  className="absolute bottom-0 right-0 z-20 w-6 h-6 flex items-center justify-center rounded-tl-md bg-background/80 border border-border/50 cursor-nwse-resize opacity-40 hover:opacity-100 transition-opacity touch-none select-none"
                  onPointerDown={onDragHandlePointerDown}
                  onPointerMove={onDragHandlePointerMove}
                  onPointerUp={onDragHandlePointerUp}
                  title="Drag to resize board"
                >
                  <GripIcon className="w-3 h-3 text-muted-foreground" />
                </div>
              </div>
            </div>

            {/* Nav controls */}
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={first} disabled={currentNode.plyIndex === 0}>
                <ChevronFirst className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={prev} disabled={currentNode.plyIndex === 0}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground font-mono w-20 text-center">
                {currentNode.plyIndex} / {mainLine.length - 1}
              </span>
              <Button size="sm" variant="outline" onClick={next} disabled={currentNode.children.length === 0}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={last} disabled={currentNode.children.length === 0}>
                <ChevronLast className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Right panel */}
        <div className="flex flex-col gap-3 min-h-0 overflow-hidden lg:h-full">
          <Card className="p-4 shrink-0">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Engine</div>
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
                  } catch { /* keep uci */ }
                  const scoreLabel =
                    m.mate !== null
                      ? `${m.mate > 0 ? "+" : "-"}M${Math.abs(m.mate)}`
                      : `${m.score >= 0 ? "+" : ""}${(m.score / 100).toFixed(1)}`;
                  return (
                    <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-border/30 last:border-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] w-5 h-5 p-0 flex items-center justify-center">{i + 1}</Badge>
                        <span className="font-mono">{san}</span>
                      </div>
                      <span className={`font-mono text-xs font-semibold ${m.score > 0 ? "text-emerald-600 dark:text-emerald-400" : m.score < 0 ? "text-destructive" : "text-muted-foreground"}`}>
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

          <Card className="p-4 flex flex-col flex-1 min-h-0">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 shrink-0">Moves</div>
            <ScrollArea className="flex-1 min-h-0">
              <table className="w-full text-xs font-mono">
                <tbody>
                  {Array.from({ length: Math.ceil((mainLine.length - 1) / 2) }, (_, i) => {
                    const whiteNode = mainLine[i * 2 + 1];
                    const blackNode = mainLine[i * 2 + 2];
                    const whiteVars = whiteNode?.parent?.children.slice(1) ?? [];
                    const blackVars = blackNode?.parent?.children.slice(1) ?? [];
                    return (
                      <Fragment key={i}>
                        <tr className="border-b border-border/20 last:border-0">
                          <td className="py-1 pr-2 text-muted-foreground w-8">{i + 1}.</td>
                          <td className="py-1 pr-2 w-[45%]">
                            {whiteNode && (
                              <button
                                onClick={() => goToNode(whiteNode)}
                                className={`px-1.5 py-0.5 rounded w-full text-left hover:bg-muted transition-colors ${currentNode.id === whiteNode.id ? "bg-[var(--accent-chess)]/20 text-[var(--accent-chess)] font-semibold" : ""}`}
                              >
                                {whiteNode.san}
                              </button>
                            )}
                          </td>
                          <td className="py-1 w-[45%]">
                            {blackNode && (
                              <button
                                onClick={() => goToNode(blackNode)}
                                className={`px-1.5 py-0.5 rounded w-full text-left hover:bg-muted transition-colors ${currentNode.id === blackNode.id ? "bg-[var(--accent-chess)]/20 text-[var(--accent-chess)] font-semibold" : ""}`}
                              >
                                {blackNode.san}
                              </button>
                            )}
                          </td>
                        </tr>
                        {(whiteVars.length > 0 || blackVars.length > 0) && (
                          <tr>
                            <td colSpan={3} className="py-1 pl-4 pb-2">
                              <div className="text-muted-foreground italic leading-6">
                                {whiteVars.map((varNode) => (
                                  <span key={varNode.id}>{"("}{renderMoveTree([varNode], currentNode.id, goToNode)}{") "}</span>
                                ))}
                                {blackVars.map((varNode) => (
                                  <span key={varNode.id}>{"("}{renderMoveTree([varNode], currentNode.id, goToNode)}{") "}</span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          </Card>
        </div>
      </div>
    </div>
  );
}