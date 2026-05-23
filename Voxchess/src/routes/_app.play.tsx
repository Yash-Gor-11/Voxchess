import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback } from "react";
import { Bot, User, Plus, Undo2, Save, Flag, ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Chessboard } from "react-chessboard";
import { GameOverDialog } from "@/components/chess/GameOverDialog";
import { ChessVoiceButton } from "@/components/voice/ChessVoiceButton";
import { TranscriptDisplay } from "@/components/voice/TranscriptDisplay";
import { useChessGame } from "@/hooks/useChessGame";
import { useChessVoice } from "@/hooks/useChessVoice";
import { useStockfish } from "@/hooks/useStockfish";
import { useSettingsStore, BOARD_THEMES } from "@/stores/settingsStore";
import { saveGame } from "@/lib/supabase/games";
import { PromotionPickerModal } from "@/components/chess/PromotionPickerModal";
import { Chess } from "chess.js";
export const Route = createFileRoute("/_app/play")({
  head: () => ({
    meta: [{ title: "Play — VoxChess" }],
  }),
  component: PlayPage,
});

type Difficulty = "easy" | "medium" | "hard" | "master";

type DifficultyConfig = {
  label: string;
  delay: number;
  pickIndex: (n: number) => number;
};

const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: { label: "Easy", delay: 1200, pickIndex: (n) => Math.floor(Math.random() * n) },
  medium: { label: "Medium", delay: 700, pickIndex: (n) => (Math.random() < 0.25 && n > 1 ? 1 : 0) },
  hard: { label: "Hard", delay: 350, pickIndex: () => 0 },
  master: { label: "Master", delay: 100, pickIndex: () => 0 },
};
function getGameResult(
  game: import("chess.js").Chess,
): "white" | "black" | "draw" | "ongoing" {
  if (!game.isGameOver()) return "ongoing";
  if (game.isCheckmate()) return game.turn() === "w" ? "black" : "white";
  return "draw";
}

function getGameOverLabel(game: import("chess.js").Chess): string {
  if (game.isCheckmate()) return "Checkmate";
  if (game.isStalemate()) return "Stalemate";
  if (game.isThreefoldRepetition()) return "Draw by repetition";
  if (game.isInsufficientMaterial()) return "Draw — insufficient material";
  if (game.isDraw()) return "Draw";
  return "Game over";
}

function calcPlayBoardSize(): number {
  if (typeof window === "undefined") return 400;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isPortrait = vw < vh;
  if (isPortrait) {
    return Math.min(Math.max(vw - 48, 180), 480);
  }
  const sidebarW = vw >= 768 ? 240 : 0;
  const sidePanelsW = vw >= 1024 ? 480 : 0; // move list + voice panel
  const padding = 48;
  const availW = vw - sidebarW - sidePanelsW - padding;
  const availH = vh - 64 - 56 - 48; // header + status bar + padding
  return Math.min(Math.max(Math.min(availH, availW), 180), 480);
}

function PlayPage() {
  const { game, fen, history, move, moveSan, undo, reset, exportPgn, isCheck, isGameOver, turn } =
    useChessGame();
  const { evaluation, evaluate } = useStockfish();
  const { boardThemeIndex } = useSettingsStore();
  const boardTheme = BOARD_THEMES[boardThemeIndex] ?? BOARD_THEMES[0];

  const [gameStarted, setGameStarted] = useState(false);
  const [playerColor, setPlayerColor] = useState<"w" | "b">("w");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [computerThinking, setComputerThinking] = useState(false);
  const [overOpen, setOverOpen] = useState(false);
  const [boardSize, setBoardSize] = useState(calcPlayBoardSize);
  const [isPortrait, setIsPortrait] = useState(
    typeof window !== "undefined" ? window.innerWidth < window.innerHeight : false,
  );
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: string; to: string;
  } | null>(null);
  const computerThinkingRef = useRef(false);

  const { activate, isActive } = useChessVoice({ game, onMove: (san) => moveSan(san) });

  const computerColor = playerColor === "w" ? "b" : "w";
  const isComputerTurn =
    gameStarted &&
    !isGameOver &&
    turn === (computerColor === "w" ? "white" : "black");

  // Resize handler
  useEffect(() => {
    function onResize() {
      const portrait = window.innerWidth < window.innerHeight;
      setIsPortrait(portrait);
      setBoardSize(calcPlayBoardSize());
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Trigger evaluation when it's computer's turn
  useEffect(() => {
    if (!isComputerTurn || computerThinkingRef.current) return;
    computerThinkingRef.current = true;
    setComputerThinking(true);
    evaluate(fen);
  }, [isComputerTurn, fen, evaluate]);

  // Make computer move when evaluation arrives
  useEffect(() => {
    if (!computerThinking || !evaluation || !isComputerTurn) return;
    const moves = evaluation.bestMoves.filter(Boolean);
    if (moves.length === 0) return;

    const config = DIFFICULTY_CONFIG[difficulty];
    const idx = config.pickIndex(moves.length);
    const best = moves[Math.min(idx, moves.length - 1)].move;

    const timer = setTimeout(() => {
      const from = best.slice(0, 2);
      const to = best.slice(2, 4);
      move(from, to);
      computerThinkingRef.current = false;
      setComputerThinking(false);
    }, config.delay);

    return () => clearTimeout(timer);
  }, [evaluation, computerThinking, isComputerTurn, difficulty, move]);

  useEffect(() => {
    if (isGameOver) {
      computerThinkingRef.current = false;
      setComputerThinking(false);
      setOverOpen(true);
    }
  }, [isGameOver]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const inputFocused =
        !!el &&
        (el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          el.isContentEditable);
      if (e.code !== "Space" || inputFocused) return;
      e.preventDefault();
      activate();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activate]);

  function handleNewGame() {
    reset();
    computerThinkingRef.current = false;
    setComputerThinking(false);
    setOverOpen(false);
  }
  function handlePromotionPick(piece: "q" | "r" | "b" | "n") {
    if (!pendingPromotion) return;
    move(pendingPromotion.from, pendingPromotion.to, piece);
    setPendingPromotion(null);
  }
  function startGame() {
    reset();
    computerThinkingRef.current = false;
    setComputerThinking(false);
    setOverOpen(false);
    setGameStarted(true);
  }

  // ── Setup screen ───────────────────────────────────────────────────────────
  if (!gameStarted) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-6 max-w-sm mx-auto space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Play vs Computer</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Choose your settings and start.
            </p>
          </div>

          <Card className="p-5 space-y-3">
            <div className="text-sm font-medium">Play as</div>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { color: "w" as const, label: "White", symbol: "♙" },
                  { color: "b" as const, label: "Black", symbol: "♟" },
                ] as const
              ).map(({ color, label, symbol }) => (
                <button
                  key={color}
                  onClick={() => setPlayerColor(color)}
                  className={`p-4 rounded-lg border-2 transition-all text-center ${playerColor === color
                    ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]"
                    : "border-border hover:border-foreground/40"
                    }`}
                >
                  <div className="text-3xl mb-1">{symbol}</div>
                  <div className="text-sm font-medium">{label}</div>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="text-sm font-medium">Difficulty</div>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setDifficulty(key)}
                  className={`p-3 rounded-lg border-2 transition-all text-center text-sm font-medium ${difficulty === key
                    ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]"
                    : "border-border hover:border-foreground/40 text-muted-foreground"
                    }`}
                >
                  {DIFFICULTY_CONFIG[key].label}
                </button>
              ))}
            </div>
          </Card>

          <Button className="w-full" size="lg" onClick={startGame}>
            Start Game
          </Button>
        </div>
      </div>
    );
  }

  // ── Game screen ────────────────────────────────────────────────────────────
  const moveCount = history.length;

  return (
    <div
      className={`flex flex-col p-3 gap-3 ${isPortrait ? "overflow-y-auto" : "h-full overflow-hidden"
        }`}
    >
      {/* Status / action bar */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <Button variant="ghost" size="sm" onClick={() => setGameStarted(false)}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Setup
        </Button>
        <div className="flex items-center gap-2 flex-wrap">
          {isComputerTurn ? (
            <Badge variant="outline" className={computerThinking ? "animate-pulse" : ""}>
              <Bot className="h-3 w-3 mr-1" />
              {computerThinking ? "Thinking…" : "Computer's turn"}
            </Badge>
          ) : (
            <Badge variant="outline">
              <User className="h-3 w-3 mr-1" /> Your turn
            </Badge>
          )}
          {isCheck && <Badge variant="destructive">Check</Badge>}
          <Badge variant="secondary">{DIFFICULTY_CONFIG[difficulty].label}</Badge>
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={moveCount < 2}
            onClick={() => {
              // Undo 2 plies: player move + computer response
              undo();
              undo();
              computerThinkingRef.current = false;
              setComputerThinking(false);
            }}
          >
            <Undo2 className="h-3.5 w-3.5 mr-1.5" /> Undo
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await saveGame(exportPgn(), getGameResult(game));
                toast.success("Game saved");
              } catch {
                toast.error("Could not save");
              }
            }}
          >
            <Save className="h-3.5 w-3.5 mr-1.5" /> Save
          </Button>
          <Button size="sm" onClick={handleNewGame}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New
          </Button>
        </div>
      </div>

      {/* Main layout */}
      <div
        className={
          isPortrait
            ? "flex flex-col gap-3"
            : "flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[220px_1fr_220px] gap-3 overflow-hidden"
        }
      >
        {/* Move list */}
        <Card
          className={`p-4 ${isPortrait ? "min-h-24" : "flex flex-col overflow-hidden"}`}
        >
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 shrink-0">
            Moves
          </div>
          <ScrollArea className={isPortrait ? "h-32" : "flex-1 min-h-0"}>
            <table className="w-full text-xs font-mono">
              <tbody>
                {Array.from(
                  { length: Math.ceil(history.length / 2) },
                  (_, i) => (
                    <tr key={i} className="border-b border-border/20 last:border-0">
                      <td className="py-1 pr-2 text-muted-foreground w-8">{i + 1}.</td>
                      <td className="py-1 pr-2 w-[45%]">{history[i * 2] ?? ""}</td>
                      <td className="py-1 w-[45%] text-muted-foreground">
                        {history[i * 2 + 1] ?? ""}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </ScrollArea>
        </Card>

        {/* Board */}
        <Card
          className={`p-3 flex items-center justify-center ${isPortrait ? "" : "overflow-hidden"
            }`}
        >
          <div className="flex flex-col items-center gap-2 w-full">
            {/* Opponent */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Bot className="h-4 w-4" />
              <span>Computer · {DIFFICULTY_CONFIG[difficulty].label}</span>
            </div>

            {/* Board */}
            <div style={{ width: boardSize, height: boardSize }}>
              <Chessboard
                options={{
                  position: fen,
                  boardOrientation: playerColor === "b" ? "black" : "white",
                  onPieceDrop: (args) => {
                    if (isComputerTurn || !args.targetSquare) return false;
                    const chess = new Chess(fen);
                    const piece = chess.get(args.sourceSquare as Parameters<typeof chess.get>[0]);
                    const isPromotion =
                      piece?.type === "p" &&
                      ((piece.color === "w" && args.targetSquare[1] === "8") ||
                        (piece.color === "b" && args.targetSquare[1] === "1"));
                    if (isPromotion) {
                      setPendingPromotion({ from: args.sourceSquare, to: args.targetSquare });
                      return false;
                    }
                    return move(args.sourceSquare, args.targetSquare);
                  },
                  boardStyle: { borderRadius: 6, overflow: "hidden" },
                  darkSquareStyle: { backgroundColor: boardTheme.dark },
                  lightSquareStyle: { backgroundColor: boardTheme.light },
                }}
              />
            </div>

            {/* Player */}
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4" />
              <span>You · {playerColor === "w" ? "White" : "Black"}</span>
            </div>
          </div>
        </Card>

        {/* Voice + resign */}
        <Card
          className={`p-4 ${isPortrait ? "" : "flex flex-col overflow-hidden"
            }`}
        >
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 shrink-0">
            Voice
          </div>
          <div className="flex flex-col items-center gap-3">
            <ChessVoiceButton onActivate={activate} isActive={isActive} enabled />
            <div className="text-xs text-muted-foreground text-center leading-relaxed">
              Say your move aloud
              <br />
              or press <span className="font-mono">Space</span>
            </div>
            <TranscriptDisplay mode="chess" />
          </div>

          <div className={`${isPortrait ? "mt-4" : "mt-auto pt-4 border-t border-border/30"}`}>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
              disabled={moveCount < 4}
              onClick={async () => {
                const result = computerColor === "w" ? "white" : "black";
                try {
                  await saveGame(exportPgn(), result);
                } catch { }
                handleNewGame();
                toast("You resigned");
              }}
            >
              <Flag className="h-3.5 w-3.5 mr-1.5" /> Resign
            </Button>
          </div>
        </Card>
      </div>
      {pendingPromotion && (
        <PromotionPickerModal
          color={new Chess(fen).turn()}
          onPick={handlePromotionPick}
          onCancel={() => setPendingPromotion(null)}
        />
      )}
      <GameOverDialog
        open={overOpen}
        result={getGameOverLabel(game)}
        onClose={() => setOverOpen(false)}
        onNew={handleNewGame}
      />
    </div>
  );
}