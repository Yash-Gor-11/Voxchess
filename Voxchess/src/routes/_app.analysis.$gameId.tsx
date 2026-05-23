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
  MessageSquare,
} from "lucide-react";
import { uciPvToSan } from "@/lib/chess/pvUtils";
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

// Compute initial board size from viewport dimensions.

function calcInitialBoardSize(): number {
  if (typeof window === "undefined") return 480;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isPortrait = vw < vh;
  if (isPortrait) {
    return Math.min(Math.max(vw - 80, 180), 500);
  }
  const sidebarW = vw >= 768 ? 240 : 0;
  const rightPanelW = vw >= 1024 ? 316 : 0;
  const evalBarW = 40;
  const padding = 48;
  const availW = vw - sidebarW - rightPanelW - evalBarW - padding;
  const availH = vh - 64 - 40 - 52 - 52 - padding; // header, voicebar, topbar, navctrl, padding
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
  const [isPortrait, setIsPortrait] = useState(
    typeof window !== "undefined" ? window.innerWidth < window.innerHeight : false,
  );
  const [boardSize, setBoardSize] = useState(calcInitialBoardSize);
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; node: TreeNode;
  } | null>(null);
  const [commentModal, setCommentModal] = useState<{
    node: TreeNode; text: string;
  } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Card ref used to clamp drag max to card's inner dimensions
  const boardCardRef = useRef<HTMLDivElement>(null);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<AnalysisTree | null>(null);
  const { setActivateChessCallback } = useVoiceStore();
  const { boardThemeIndex } = useSettingsStore();
  const boardTheme = BOARD_THEMES[boardThemeIndex] ?? BOARD_THEMES[0];

  // Recalculate initial size on window resize (only when user hasn't manually dragged)
  const userResizedRef = useRef(false);
  // Replace the existing resize useEffect with this single one
  useEffect(() => {
    function onResize() {
      const portrait = window.innerWidth < window.innerHeight;
      setIsPortrait(portrait);
      // Reset user resize flag when switching to portrait — no drag handle in portrait
      if (portrait) userResizedRef.current = false;
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

  const onDragHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragStartRef.current = { x: e.clientX, y: e.clientY, size: boardSize };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [boardSize],
  );

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

  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);

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

  const handleVoiceCommand = useCallback(
    (t: string) => {
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
          treeRef.current.goToMainLinePly(moveNum * 2 - 1);
          setCurrentNode({ ...treeRef.current.current });
          setResult({ ok: true, message: `Move ${moveNum}` });
          setStatus("success");
        }
        return;
      }
      setResult({ ok: false, message: `Not recognised: "${t}"` });
      setStatus("error");
    },
    [first, last, prev, next, backToMainLine, setResult, setStatus],
  );

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
        } else {
          setTimeout(() => {
            setActive(null);
            setStatus("idle");
          }, 1500);
        }
      },
      onError: () => {
        setIsListening(false);
        setActive(null);
        setStatus("error");
      },
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

  function handlePieceDrop(from: string, to: string): boolean {
    if (!treeRef.current || !currentNode) return false;
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

  function handleSquareRightClick(square: string) {
    setRightClickFrom(square);
  }

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
    setArrows([]);
    setHighlights([]);
    treeRef.current?.setArrows([]);
    treeRef.current?.setHighlights([]);
  }
  function startLongPress(node: TreeNode, e: React.PointerEvent) {
    longPressTimerRef.current = setTimeout(() => {
      setContextMenu({ x: e.clientX, y: e.clientY, node });
    }, 500);
  }

  function cancelLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function openContextMenu(node: TreeNode, e: React.MouseEvent) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }

  async function handleSaveComment(node: TreeNode, text: string) {
    node.comment = text.trim() || undefined;
    setRevision((r) => r + 1);
    setCommentModal(null);
    setContextMenu(null);
    if (!treeRef.current) return;
    try {
      await saveAnnotations(gameId, treeRef.current.serialize());
      toast.success("Comment saved");
    } catch {
      toast.error("Could not save comment");
    }
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

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading game…</div>;
  if (!tree || !currentNode)
    return <div className="p-6 text-sm text-muted-foreground">No positions found.</div>;

  const mainLine = tree.getMainLinePath();
  const isOnMainLine = currentNode.isMainLine;
  const moveNumber = Math.ceil(currentNode.plyIndex / 2);

  // Replace the entire return with this
  return (
    <div className={`flex flex-col p-3 gap-3 ${isPortrait ? "h-full overflow-y-auto" : "h-full overflow-hidden"}`}>
      {/* Top bar */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
        </Button>
        <h2 className="text-base font-semibold">Analysis</h2>
        <Badge variant="outline" className="hidden sm:inline-flex">
          {currentNode.plyIndex === 0 ? "Start" : `Move ${moveNumber}`}
        </Badge>
        {!isOnMainLine && <Badge variant="secondary" className="hidden sm:inline-flex">Variation</Badge>}
        <div className="ml-auto flex gap-2 shrink-0">
          {!isOnMainLine && (
            <Button size="sm" variant="outline" onClick={backToMainLine}>
              <RotateCcw className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Main line</span>
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={clearAnnotations}>
            Clear
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* Main grid */}
      <div
        className={
          isPortrait
            ? "flex flex-col gap-3"
            : "flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3 overflow-hidden"
        }
      >
        {/* Board card */}
        <Card
          ref={boardCardRef}
          className={`p-3 ${isPortrait ? "shrink-0" : "overflow-hidden"}`}
        >
          <div
            className={`flex flex-col items-center gap-2 ${isPortrait ? "" : "justify-center h-full"
              }`}
          >
            <div className="flex gap-2 items-center">
              {/* Eval bar */}
              <div className="flex-shrink-0" style={{ height: boardSize }}>
                <EvalBar evaluation={evaluation} />
              </div>

              {/* Board */}
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

                {/* Drag handle — landscape only */}
                {!isPortrait && (
                  <div
                    className="absolute bottom-0 right-0 z-20 w-6 h-6 flex items-center justify-center rounded-tl-md bg-background/80 border border-border/50 cursor-nwse-resize opacity-40 hover:opacity-100 transition-opacity touch-none select-none"
                    onPointerDown={onDragHandlePointerDown}
                    onPointerMove={onDragHandlePointerMove}
                    onPointerUp={onDragHandlePointerUp}
                    title="Drag to resize board"
                  >
                    <GripIcon className="w-3 h-3 text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>

            {/* Nav controls */}
            <div className="flex items-center gap-2 shrink-0">
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
          </div>
        </Card>

        {/* Right panel */}
        <div
          className={`flex flex-col gap-3 ${isPortrait ? "" : "min-h-0 overflow-hidden lg:h-full"
            }`}
        >
          {/* Engine card */}
          <Card className="p-4 shrink-0">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
              Engine
            </div>
            {evaluation ? (
              <div className="space-y-2">
                {evaluation.bestMoves.map((m, i) => {
                  const sanMoves = uciPvToSan(currentNode.fen, m.pv).slice(0, 6);
                  const scoreLabel =
                    m.mate !== null
                      ? `${m.mate > 0 ? "+" : "-"}M${Math.abs(m.mate)}`
                      : `${m.score >= 0 ? "+" : ""}${(m.score / 100).toFixed(1)}`;
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-sm py-1 border-b border-border/30 last:border-0"
                    >
                      <div className="flex items-center gap-2 shrink-0 pt-0.5">
                        <Badge
                          variant="outline"
                          className="text-[10px] w-5 h-5 p-0 flex items-center justify-center"
                        >
                          {i + 1}
                        </Badge>
                        <span
                          className={`font-mono text-xs font-semibold w-12 ${m.score > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : m.score < 0
                              ? "text-destructive"
                              : "text-muted-foreground"
                            }`}
                        >
                          {scoreLabel}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground leading-relaxed">
                        {sanMoves.join(" ")} {sanMoves.length === 6 ? "..." : ""}
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

          {/* Moves card */}
          <Card
            className={`p-4 flex flex-col ${isPortrait ? "min-h-64" : "flex-1 min-h-0"
              }`}
          >
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 shrink-0">
              Moves
            </div>
            <ScrollArea className={isPortrait ? "h-64" : "flex-1 min-h-0"}>
              <table className="w-full text-xs font-mono">
                <tbody>
                  {Array.from(
                    { length: Math.ceil((mainLine.length - 1) / 2) },
                    (_, i) => {
                      const whiteNode = mainLine[i * 2 + 1];
                      const blackNode = mainLine[i * 2 + 2];
                      const whiteVars = whiteNode?.parent?.children.slice(1) ?? [];
                      const blackVars = blackNode?.parent?.children.slice(1) ?? [];
                      const wComment = whiteNode?.comment;
                      const bComment = blackNode?.comment;

                      const makeMoveTd = (node: TreeNode | undefined, colSpan = 1) =>
                        node ? (
                          <td className={`py-1 pr-2 ${colSpan === 2 ? "w-[90%]" : "w-[45%]"}`} colSpan={colSpan}>
                            <button
                              onClick={() => goToNode(node)}
                              onContextMenu={(e) => openContextMenu(node, e)}
                              onPointerDown={(e) => startLongPress(node, e)}
                              onPointerUp={cancelLongPress}
                              onPointerCancel={cancelLongPress}
                              className={`px-1.5 py-0.5 rounded w-full text-left hover:bg-muted transition-colors ${currentNode.id === node.id
                                ? "bg-[var(--accent-chess)]/20 text-[var(--accent-chess)] font-semibold"
                                : ""
                                }`}
                            >
                              {node.san}
                            </button>
                          </td>
                        ) : (
                          <td colSpan={colSpan} />
                        );

                      const commentRow = (node: TreeNode) => (
                        <tr key={`comment-${node.id}`}>
                          <td colSpan={3} className="pb-1.5 px-1">
                            <div
                              className="text-[11px] text-muted-foreground italic leading-relaxed bg-muted/40 rounded px-2 py-1 cursor-pointer hover:bg-muted/70 transition-colors"
                              onContextMenu={(e) => openContextMenu(node, e)}
                              onPointerDown={(e) => startLongPress(node, e)}
                              onPointerUp={cancelLongPress}
                              onPointerCancel={cancelLongPress}
                            >
                              <MessageSquare className="inline h-3 w-3 mr-1 opacity-60" />
                              {node.comment}
                            </div>
                          </td>
                        </tr>
                      );

                      const varRow = (whiteVars.length > 0 || blackVars.length > 0) && (
                        <tr key={`vars-${i}`}>
                          <td colSpan={3} className="py-1 pl-4 pb-2">
                            <div className="text-muted-foreground italic leading-6">
                              {whiteVars.map((v) => (
                                <span key={v.id}>{"("}{renderMoveTree([v], currentNode.id, goToNode)}{") "}</span>
                              ))}
                              {blackVars.map((v) => (
                                <span key={v.id}>{"("}{renderMoveTree([v], currentNode.id, goToNode)}{") "}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );

                      // Case 1: no comments — normal paired row
                      if (!wComment && !bComment) {
                        return (
                          <Fragment key={i}>
                            <tr className="border-b border-border/20 last:border-0">
                              <td className="py-1 pr-2 text-muted-foreground w-8">{i + 1}.</td>
                              {makeMoveTd(whiteNode)}
                              {makeMoveTd(blackNode)}
                            </tr>
                            {varRow}
                          </Fragment>
                        );
                      }

                      // Case 2: white has comment, black doesn't
                      if (wComment && !bComment) {
                        return (
                          <Fragment key={i}>
                            <tr className="border-b border-border/20">
                              <td className="py-1 pr-2 text-muted-foreground w-8">{i + 1}.</td>
                              {makeMoveTd(whiteNode)}
                              <td className="py-1 pr-2 w-[45%] text-muted-foreground px-1.5">…</td>
                            </tr>
                            {commentRow(whiteNode)}
                            {blackNode && (
                              <tr className="border-b border-border/20 last:border-0">
                                <td className="py-1 pr-2 text-muted-foreground w-8">{i + 1}…</td>
                                <td className="py-1 pr-2 w-[45%] text-muted-foreground px-1.5">…</td>
                                {makeMoveTd(blackNode)}
                              </tr>
                            )}
                            {varRow}
                          </Fragment>
                        );
                      }

                      // Case 3: black has comment, white doesn't
                      if (!wComment && bComment) {
                        return (
                          <Fragment key={i}>
                            <tr className="border-b border-border/20">
                              <td className="py-1 pr-2 text-muted-foreground w-8">{i + 1}.</td>
                              {makeMoveTd(whiteNode)}
                              {makeMoveTd(blackNode)}
                            </tr>
                            {commentRow(blackNode!)}
                            {varRow}
                          </Fragment>
                        );
                      }

                      // Case 4: both have comments
                      return (
                        <Fragment key={i}>
                          <tr className="border-b border-border/20">
                            <td className="py-1 pr-2 text-muted-foreground w-8">{i + 1}.</td>
                            {makeMoveTd(whiteNode)}
                            <td className="py-1 pr-2 w-[45%] text-muted-foreground px-1.5">…</td>
                          </tr>
                          {commentRow(whiteNode!)}
                          {blackNode && (
                            <tr className="border-b border-border/20">
                              <td className="py-1 pr-2 text-muted-foreground w-8">{i + 1}…</td>
                              <td className="py-1 pr-2 w-[45%] text-muted-foreground px-1.5">…</td>
                              {makeMoveTd(blackNode)}
                            </tr>
                          )}
                          {commentRow(blackNode!)}
                          {varRow}
                        </Fragment>
                      );
                    },
                  )}
                </tbody>
              </table>
            </ScrollArea>
          </Card>
        </div>
      </div>
      {/* Context menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-50 bg-card border border-border rounded-md shadow-md py-1 text-sm"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button
              className="w-full text-left px-4 py-2 hover:bg-muted transition-colors"
              onClick={() =>
                setCommentModal({ node: contextMenu.node, text: contextMenu.node.comment ?? "" })
              }
            >
              {contextMenu.node.comment ? "Edit comment" : "Add comment"}
            </button>
          </div>
        </>
      )}

      {/* Comment modal */}
      {commentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card border border-border rounded-xl shadow-xl p-5 w-80 flex flex-col gap-3">
            <div className="text-sm font-medium">
              {commentModal.node.comment ? "Edit comment" : "Add comment"}
              <span className="text-muted-foreground font-normal ml-2 text-xs">
                — move {Math.ceil(commentModal.node.plyIndex / 2)}
                {commentModal.node.plyIndex % 2 === 1 ? " (White)" : " (Black)"}
              </span>
            </div>
            <textarea
              autoFocus
              className="w-full rounded-md border border-border bg-background text-sm p-2 resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]"
              rows={3}
              placeholder="Write a comment…"
              value={commentModal.text}
              onChange={(e) => setCommentModal({ ...commentModal, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                  handleSaveComment(commentModal.node, commentModal.text);
                if (e.key === "Escape") setCommentModal(null);
              }}
            />
            <div className="flex justify-between gap-2">
              <div>
                {commentModal.node.comment && (
                  <button
                    className="text-sm px-3 py-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors"
                    onClick={() => handleSaveComment(commentModal.node, "")}
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  className="text-sm px-3 py-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
                  onClick={() => setCommentModal(null)}
                >
                  Cancel
                </button>
                <button
                  className="text-sm px-4 py-1.5 rounded-md bg-[var(--accent-blue)] text-white hover:opacity-90 transition-opacity"
                  onClick={() => handleSaveComment(commentModal.node, commentModal.text)}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
