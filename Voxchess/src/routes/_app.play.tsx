// src/routes/_app/play.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState, useRef } from "react";
import {
  Bot, User, Plus, ChevronLeft, MoreHorizontal,
  Undo2, Save, Flag, Lightbulb, Handshake, FlipHorizontal2, Check,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Chessboard } from "react-chessboard";
import { GameOverDialog } from "@/components/chess/GameOverDialog";
import { BoardOverlay } from "@/components/chess/BoardOverlay";
import { useChessGame } from "@/hooks/useChessGame";
import { useChessVoice } from "@/hooks/useChessVoice";
import { useStockfish } from "@/hooks/useStockfish";
import { useSettingsStore, BOARD_THEMES } from "@/stores/settingsStore";
import { useVoiceStore } from "@/stores/voiceStore";
import { saveGame, updateGame, getGame } from "@/lib/supabase/games";
import { PromotionPickerModal } from "@/components/chess/PromotionPickerModal";
import { Chess } from "chess.js";
import {
  PERSONALITIES, ELO_VALUES, ELO_CONFIG, getPersonality, pickRandom,
  type PersonalityId, type AvatarState, type EloValue,
} from "@/lib/chess/personalities";
import { selectVoice } from "@/lib/voice/selectVoice";
import { hashText } from "@/lib/voice/hashText";

type PlaySearch = {
  fen?: string;
  gameId?: string;
  sourceGameId?: string;
  sourceNodeId?: string;
  sourceType?: "analysis" | "imported_fen";
};

type PlayMode = "resume-game" | "continue-position" | "new-game";

export const Route = createFileRoute("/_app/play")({
  validateSearch: (search: Record<string, unknown>): PlaySearch => ({
    fen: typeof search.fen === "string" ? search.fen : undefined,
    gameId: typeof search.gameId === "string" ? search.gameId : undefined,
    sourceGameId: typeof search.sourceGameId === "string" ? search.sourceGameId : undefined,
    sourceNodeId: typeof search.sourceNodeId === "string" ? search.sourceNodeId : undefined,
    sourceType: search.sourceType === "analysis" || search.sourceType === "imported_fen"
      ? search.sourceType
      : undefined,
  }),
  head: () => ({ meta: [{ title: "Play — VoxChess" }] }),
  component: PlayPage,
});

// ── Helpers ────────────────────────────────────────────────────────────────
function getGameResult(game: import("chess.js").Chess): "white" | "black" | "draw" | "ongoing" {
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
  if (typeof window === "undefined") return 420;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isPortrait = vw < vh;
  if (isPortrait) {
    return Math.min(Math.max(vw - 48, 180), 500);
  }
  const sidebarW = vw >= 768 ? 240 : 0;
  const rightPanelW = vw >= 1024 ? 300 : 0;
  const padding = 56;
  const availW = vw - sidebarW - rightPanelW - padding;
  const availH = vh - 64 - 48 - 80 - padding;
  return Math.min(Math.max(Math.min(availH, availW), 180), 580);
}

// Custom lightweight action menu.
interface MenuItemProps {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  checked?: boolean;
  isCheckbox?: boolean;
}

function MenuItem({ label, icon: Icon, onClick, disabled, destructive, checked, isCheckbox }: MenuItemProps) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors
        hover:bg-accent disabled:opacity-40 disabled:pointer-events-none
        ${destructive ? "text-destructive hover:text-destructive" : ""}`}
    >
      {isCheckbox ? (
        <span className="h-4 w-4 flex items-center justify-center">
          {checked && <Check className="h-3 w-3" />}
        </span>
      ) : (
        <Icon className="h-4 w-4 shrink-0" />
      )}
      {label}
    </button>
  );
}

function MenuSeparator() {
  return <div className="my-1 border-t border-border" />;
}

// ── Component ──────────────────────────────────────────────────────────────
function PlayPage() {
  const navigate = useNavigate();
  const { game, fen, history, move, moveSan, undo, reset, loadMoves, loadPgn, exportPgn, isCheck, isGameOver, turn } =
    useChessGame();
  const { evaluation, evaluate } = useStockfish();
  const { boardThemeIndex } = useSettingsStore();
  const setActivateChessCallback = useVoiceStore((s) => s.setActivateChessCallback);
  const boardTheme = BOARD_THEMES[boardThemeIndex] ?? BOARD_THEMES[0];
  const { fen: startFen, gameId: urlGameId, sourceGameId, sourceNodeId, sourceType: routeSourceType } = Route.useSearch();
  const playMode: PlayMode = urlGameId
    ? "resume-game"
    : startFen
      ? "continue-position"
      : "new-game";

  if (urlGameId && startFen) {
    console.error("[PlayMode] Invalid route: both gameId and fen provided. gameId takes precedence.");
  }
  // ── Setup state ──────────────────────────────────────────────────────────
  const [savedGame] = useState(() => {
    try {
      const raw = localStorage.getItem("voxchess_game");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  const [gameStarted, setGameStarted] = useState(
    playMode === "new-game" && !!savedGame
  );
  const [playerColor, setPlayerColor] = useState<"w" | "b">(savedGame?.playerColor ?? "w");
  const [eloIndex, setEloIndex] = useState(savedGame?.eloIndex ?? 5);
  const [personalityId, setPersonalityId] = useState<PersonalityId>(savedGame?.personalityId ?? "frost");
  const [startingFen, setStartingFen] = useState<string | null>(savedGame?.startFen ?? null);
  // ── Game state ───────────────────────────────────────────────────────────
  const [computerThinking, setComputerThinking] = useState(false);
  const [overOpen, setOverOpen] = useState(false);
  const [boardSize, setBoardSize] = useState(calcPlayBoardSize);
  const [isPortrait, setIsPortrait] = useState(
    typeof window !== "undefined" ? window.innerWidth < window.innerHeight : false,
  );
  const [flipped, setFlipped] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);
  const [personalityVisible, setPersonalityVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [gameOverLabel, setGameOverLabel] = useState("");
  const [gameOverAvatarState, setGameOverAvatarState] = useState<AvatarState>("idle");
  const [gameOverAvatarText, setGameOverAvatarText] = useState("");
  const [gameEnded, setGameEnded] = useState(false);
  const [sessionKind, setSessionKind] = useState<"new" | "game">("new");
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  // ── Hint state ───────────────────────────────────────────────────────────
  const [hintStage, setHintStage] = useState<0 | 1 | 2>(0);
  const [hintFrom, setHintFrom] = useState<string | null>(null);
  const [hintTo, setHintTo] = useState<string | null>(null);

  // ── Avatar state ─────────────────────────────────────────────────────────
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  const [avatarText, setAvatarText] = useState<string>("");
  const avatarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const computerThinkingRef = useRef(false);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isComputerTurnRef = useRef(false);
  const fenRef = useRef(fen);
  const hintPendingRef = useRef(false);
  const computerColor = playerColor === "w" ? "b" : "w";
  const isComputerTurn = gameStarted && !isGameOver && turn === (computerColor === "w" ? "white" : "black");
  const restoredRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [fenHistory, setFenHistory] = useState<string[]>(() => [fen]);
  const [viewIndex, setViewIndex] = useState(0);
  const isAtLatest = viewIndex === fenHistory.length - 1;
  const displayFen = fenHistory[viewIndex] ?? fen;

  const isAtLatestRef = useRef(true);
  const fenHistoryLengthRef = useRef(1);
  useEffect(() => { isAtLatestRef.current = isAtLatest; }, [isAtLatest]);
  useEffect(() => { fenHistoryLengthRef.current = fenHistory.length; }, [fenHistory.length]);
  useEffect(() => {
    const initialFen = startingFen ?? new Chess().fen();
    const chess = new Chess(initialFen);
    const fens: string[] = [initialFen];
    for (const san of history) {
      chess.move(san);
      fens.push(chess.fen());
    }
    setFenHistory(fens);
    setViewIndex(fens.length - 1);
  }, [history.length, startingFen]);

  isComputerTurnRef.current = isComputerTurn;
  fenRef.current = fen;

  useEffect(() => {
    if (restoredRef.current || !savedGame || playMode !== "new-game") return;
    restoredRef.current = true;
    if (savedGame.pgn !== undefined) {
      loadPgn(savedGame.pgn ?? "", savedGame.startFen ?? null);
    } else if (savedGame.history?.length) {
      loadMoves(savedGame.history);
    }
  }, []);

  // Keep the chessboard callback stable across unrelated page updates.
  const handlePieceDrop = useCallback(
    (args: any) => {
      if (isComputerTurnRef.current || !args.targetSquare || !isAtLatestRef.current) return false;
      const chess = new Chess(fenRef.current);
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
    [move, setPendingPromotion],
  );

  const elo = ELO_VALUES[eloIndex] as EloValue;
  const eloConfig = ELO_CONFIG[elo];
  const currentPersonality = getPersonality(personalityId);

  const boardOrientation: "white" | "black" = ((playerColor === "b") !== flipped) ? "black" : "white";
  const moveCount = history.length;

  const handleVoiceMove = useCallback((san: string) => moveSan(san), [moveSan]);
  const { activate } = useChessVoice({ game, onMove: handleVoiceMove });

  // The shared voice controls are usable only while a live game is on screen.
  useEffect(() => {
    if (!gameStarted || isGameOver) {
      setActivateChessCallback(null);
      return;
    }

    setActivateChessCallback(activate);
    return () => setActivateChessCallback(null);
  }, [activate, gameStarted, isGameOver, setActivateChessCallback]);

  // Close menu on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  // Resize
  useEffect(() => {
    function onResize() {
      setIsPortrait(window.innerWidth < window.innerHeight);
      setBoardSize(calcPlayBoardSize());
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Space → voice
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const inputFocused = !!el && (
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable
      );
      if (!gameStarted || inputFocused) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setViewIndex(i => Math.max(0, i - 1));
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setViewIndex(i => Math.min(fenHistoryLengthRef.current - 1, i + 1));
        return;
      }
      if (e.code === "Space") {
        if (isGameOver) return;
        e.preventDefault();
        activate();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activate, gameStarted, isGameOver]);

  // ── Avatar helpers ────────────────────────────────────────────────────────
  function speakAvatar(text: string, state: AvatarState = "talking", duration = 4000) {

    setAvatarText(text);
    setAvatarState(state);

    if (avatarTimeoutRef.current) clearTimeout(avatarTimeoutRef.current);
    if (state !== "win" && state !== "lose" && state !== "draw") {
      avatarTimeoutRef.current = setTimeout(() => {
        setAvatarState("idle");
        setAvatarText("");
      }, duration);
    }

    // Fully stop and release any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    // Cancel any queued browser TTS
    window.speechSynthesis?.cancel();

    const volume = currentPersonality.voice.volume ?? 1.0;
    const hash = hashText(text);
    const audio = new Audio(`/characters/${currentPersonality.id}/audio/${hash}.mp3`);
    audio.volume = volume;
    audioRef.current = audio;

    audio.play()
      .then(() => {
        // Audio file is playing — hard cancel TTS in case anything was queued
        window.speechSynthesis?.cancel();
      })
      .catch(() => {
        // Audio file missing or failed — browser TTS only as fallback
        audioRef.current = null;
        if (typeof window === "undefined" || !window.speechSynthesis) return;
        const utt = new SpeechSynthesisUtterance(text);
        const v = currentPersonality.voice;
        utt.pitch = v.pitch;
        utt.rate = v.rate;
        utt.volume = volume;
        const voice = selectVoice(v.preferredVoices);
        if (voice) utt.voice = voice;
        window.speechSynthesis.speak(utt);
      });
  }


  // ── Computer turn ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isComputerTurn || computerThinkingRef.current) return;
    computerThinkingRef.current = true;
    setComputerThinking(true);
    setAvatarState("thinking");
    evaluate(fen, eloConfig);

    // Recovery: if engine gives no result within 12s, unblock
    const recovery = setTimeout(() => {
      if (computerThinkingRef.current) {
        computerThinkingRef.current = false;
        setComputerThinking(false);
        setAvatarState("idle");
      }
    }, 12000);

    return () => clearTimeout(recovery);
  }, [isComputerTurn, fen, evaluate, eloConfig]);

  useEffect(() => {
    if (!computerThinking || !evaluation || !isComputerTurn) return;
    const moves = evaluation.bestMoves.filter(Boolean);
    if (moves.length === 0) return;
    const best = moves[0].move;
    const timer = setTimeout(() => {
      const from = best.slice(0, 2);
      const to = best.slice(2, 4);
      const promotion = best.slice(4) || undefined;
      move(from, to, promotion as "q" | "r" | "b" | "n" | undefined);
      computerThinkingRef.current = false;
      setComputerThinking(false);
      speakAvatar(pickRandom(currentPersonality.responses.moveQuips));
    }, eloConfig.delay ?? 0);
    return () => clearTimeout(timer);
  }, [evaluation, computerThinking, isComputerTurn, eloConfig, currentPersonality]);

  useEffect(() => {
    if (!hintPendingRef.current || !evaluation?.bestMoves[0]) return;
    hintPendingRef.current = false;
    const best = evaluation.bestMoves[0].move;
    setHintFrom(best.slice(0, 2));
    setHintTo(best.slice(2, 4));
    setHintStage(1);
    speakAvatar(pickRandom(currentPersonality.responses.hintPiece));
  }, [evaluation, currentPersonality]);

  // Check reaction
  useEffect(() => {
    if (isCheck && !isComputerTurn && gameStarted) {
      speakAvatar(pickRandom(currentPersonality.responses.check));
    }
  }, [isCheck]); // eslint-disable-line

  useEffect(() => {
    if (!gameStarted || isGameOver) return;
    localStorage.setItem("voxchess_game", JSON.stringify({
      startFen: startingFen,
      pgn: exportPgn(),
      playerColor,
      eloIndex,
      personalityId,
      sessionKind,
      currentGameId,
    }));
  }, [fen, playerColor, eloIndex, personalityId, gameStarted, isGameOver, startingFen, sessionKind, currentGameId]);


  // Game over
  useEffect(() => {
    if (!isGameOver || !gameStarted) return;
    setGameEnded(true);
    computerThinkingRef.current = false;
    setComputerThinking(false);
    setGameOverLabel(getGameOverLabel(game));
    setOverOpen(true);
    const result = getGameResult(game);
    const playerWon = result === (playerColor === "w" ? "white" : "black");
    if (playerWon) {
      const text = pickRandom(currentPersonality.responses.lose);
      setGameOverAvatarState("lose");
      setGameOverAvatarText(text);
      speakAvatar(text, "lose", 0);
    } else if (result === "draw") {
      const text = pickRandom(currentPersonality.responses.drawAccept);
      setGameOverAvatarState("draw");
      setGameOverAvatarText(text);
      speakAvatar(text, "draw", 0);
    } else {
      const text = pickRandom(currentPersonality.responses.win);
      setGameOverAvatarState("win");
      setGameOverAvatarText(text);
      speakAvatar(text, "win", 0);
    }
  }, [isGameOver]);

  // Reset hint on player move
  useEffect(() => {
    if (!isComputerTurn && gameStarted) {
      setHintStage(0);
      setHintFrom(null);
      setHintTo(null);
    }
  }, [history.length]); // eslint-disable-line

  useEffect(() => {
    if (playMode !== "resume-game" || !urlGameId) return;

    const gameId = urlGameId;
    let cancelled = false;

    async function loadExistingGame() {
      try {
        const g = await getGame(gameId);
        if (cancelled) return;

        const resolvedStartFen = g.start_fen ?? null;
        setStartingFen(resolvedStartFen);
        loadPgn(g.pgn ?? "", resolvedStartFen);
        setSessionKind("game");
        setCurrentGameId(g.id);

        const meta = g.metadata as {
          eloIndex?: number;
          personalityId?: string;
          playerColor?: string;
        } | null;
        if (meta?.eloIndex !== undefined) setEloIndex(meta.eloIndex);
        if (meta?.personalityId) setPersonalityId(meta.personalityId as PersonalityId);
        if (meta?.playerColor) setPlayerColor(meta.playerColor as "w" | "b");

        setGameStarted(true);
      } catch {
        toast.error("Could not load game");
      }
    }

    loadExistingGame();
    return () => { cancelled = true; };
  }, [playMode, urlGameId]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleNewGame() {
    setSessionKind("new");
    setCurrentGameId(null);
    setStartingFen(null);
    setGameEnded(false);

    localStorage.removeItem("voxchess_game");
    reset();
    computerThinkingRef.current = false;
    setComputerThinking(false);
    setOverOpen(false);
    setHintStage(0);
    setHintFrom(null);
    setHintTo(null);
    setGameOverLabel("");
    setAvatarState("idle");
    setAvatarText("");
    if (avatarTimeoutRef.current) clearTimeout(avatarTimeoutRef.current);
    window.speechSynthesis?.cancel();
    setGameStarted(false);
  }

  function startGame() {
    handleNewGame();
    if (playMode === "continue-position" && startFen) {
      setStartingFen(startFen);
      reset(startFen);
    }
    setSessionKind("new");
    setGameStarted(true);
    speakAvatar(pickRandom(currentPersonality.responses.greetings));
  }

  async function saveCurrentGame(result: string): Promise<void> {
    const pgn = exportPgn();
    const playSettings = { eloIndex, personalityId, playerColor };

    if (sessionKind === "game" && currentGameId) {
      await updateGame(currentGameId, pgn, result, playSettings);
    } else {
      const saved = await saveGame(
        pgn,
        result,
        startingFen ?? null,
        routeSourceType ?? null,
        sourceGameId ?? null,
        sourceNodeId ?? null,
        playSettings,
      );
      setSessionKind("game");
      setCurrentGameId(saved.id);

      localStorage.setItem("voxchess_game", JSON.stringify({
        startFen: startingFen,
        pgn,
        playerColor,
        eloIndex,
        personalityId,
        sessionKind: "game",
        currentGameId: saved.id,
      }));
    }
  }

  function handlePromotionPick(piece: "q" | "r" | "b" | "n") {
    if (!pendingPromotion) return;
    move(pendingPromotion.from, pendingPromotion.to, piece);
    setPendingPromotion(null);
  }

  function handleUndo() {
    if (moveCount < 2) return;
    undo(); undo();
    computerThinkingRef.current = false;
    setComputerThinking(false);
    setAvatarState("idle");
    setAvatarText("");
    speakAvatar(pickRandom(currentPersonality.responses.undo));
  }

  function handleSave() {
    saveCurrentGame(getGameResult(game))
      .then(() => toast.success("Game saved"))
      .catch(() => toast.error("Could not save"));
  }

  async function handleResign() {
    setGameEnded(true);
    const result = computerColor === "w" ? "white" : "black";
    try { await saveCurrentGame(result); } catch { }
    const text = pickRandom(currentPersonality.responses.win);
    setGameOverAvatarState("win");
    setGameOverAvatarText(text);
    setGameOverLabel("You resigned");
    speakAvatar(text, "win", 0);
    setOverOpen(true);
  }

  function handleHint() {
    if (hintStage === 1) {
      setHintStage(2);
      speakAvatar(pickRandom(currentPersonality.responses.hintMove));
      return;
    }
    if (hintStage === 2) {
      setHintStage(0);
      setHintFrom(null);
      setHintTo(null);
      return;
    }
    // stage 0: request evaluation for current (player's) position
    hintPendingRef.current = true;
    evaluate(fen, eloConfig);
    toast("Calculating hint…");
  }

  function handleDrawOffer() {
    if (moveCount < 20) { toast("Draw only available after 10 moves"); return; }
    const evalScore = evaluation?.score ?? 0;
    const evalFromComputer = computerColor === "w" ? evalScore : -evalScore;
    const computerAccepts = evalFromComputer <= 50;
    if (computerAccepts) {
      const text = pickRandom(currentPersonality.responses.drawAccept);
      setGameOverAvatarState("draw");
      setGameOverAvatarText(text);
      speakAvatar(text, "draw", 0);
      setTimeout(async () => {
        setGameEnded(true);
        try { await saveCurrentGame("draw"); } catch { }
        setGameOverLabel("Draw agreed");
        setOverOpen(true);
        toast("Draw accepted");
      }, 2000);
    } else {
      speakAvatar(pickRandom(currentPersonality.responses.drawRefuse));
      toast("Draw refused");
    }
  }

  // ── Board overlays ────────────────────────────────────────────────────────
  const hintHighlights = hintFrom && hintStage >= 1 ? [hintFrom] : [];
  const hintArrows = hintFrom && hintTo && hintStage >= 2 ? [{ from: hintFrom, to: hintTo }] : [];

  // ── Setup screen ──────────────────────────────────────────────────────────
  if (!gameStarted) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-6 max-w-md mx-auto space-y-5">
          <div>
            <h2 className="text-lg font-semibold">Play vs Computer</h2>
            <p className="text-sm text-muted-foreground mt-1">Choose your settings and start.</p>
          </div>

          {playMode === "continue-position" && startFen && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/30">
              <div className="text-xs leading-relaxed">
                <div className="font-semibold text-[var(--accent-blue)] mb-0.5">Continuing from a custom position</div>
                <div className="text-muted-foreground">This game will start from the imported board state. Choose your opponent and difficulty below.</div>
              </div>
            </div>
          )}
          {/* Play as */}
          <Card className="p-5 space-y-3">
            <div className="text-sm font-medium">Play as</div>
            <div className="grid grid-cols-2 gap-3">
              {([
                { color: "w" as const, label: "White", symbol: "♙" },
                { color: "b" as const, label: "Black", symbol: "♟" },
              ] as const).map(({ color, label, symbol }) => (
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
          {/* ELO Slider */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Difficulty</div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-[var(--accent-blue)]">{elo}</span>
                <span className="text-xs text-muted-foreground">ELO</span>
                <Badge variant="secondary" className="text-xs">{eloConfig.label}</Badge>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={ELO_VALUES.length - 1}
              step={1}
              value={eloIndex}
              onChange={(e) => setEloIndex(parseInt(e.target.value))}
              className="w-full accent-[var(--accent-blue)]"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>300</span>
              <span>3000</span>
            </div>
          </Card>

          {/* Personality */}
          <Card className="p-5 space-y-3">
            <div className="text-sm font-medium">Opponent Personality</div>
            <div className="grid grid-cols-5 gap-2">
              {PERSONALITIES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPersonalityId(p.id)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all ${personalityId === p.id
                    ? "border-[var(--accent-blue)]"
                    : "border-border hover:border-foreground/40"
                    }`}
                >
                  <img
                    src={p.images.idle}
                    alt={p.name}
                    className="h-16 w-16 object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                      const sib = e.currentTarget.nextSibling as HTMLElement | null;
                      if (sib) sib.style.display = "block";
                    }}
                  />
                  <span style={{ display: "none" }} className="text-2xl">{p.emoji}</span>
                  <span className="text-[10px] font-medium text-center leading-tight line-clamp-2">
                    {p.name.split(" ")[0]}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 pt-2 border-t border-border/40">
              <img
                src={currentPersonality.images.idle}
                alt={currentPersonality.name}
                className="h-14 w-14 object-contain"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
              <div>
                <div className="text-sm font-medium">{currentPersonality.name}</div>
                <div className="text-xs text-muted-foreground">{currentPersonality.species}</div>
              </div>
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
  const hintLabel = hintStage === 0 ? "Hint (piece)" : hintStage === 1 ? "Hint (move)" : "Clear hint";

  return (
    <div className="h-full overflow-y-auto">
      <div className={`flex flex-col p-3 gap-3 ${isPortrait ? "overflow-y-auto" : "h-full overflow-hidden"}`}>

        {/* Action bar */}
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setGameStarted(false)}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Setup</span>
          </Button>

          <div className="flex items-center gap-1.5 min-w-0">
            {isComputerTurn ? (
              <Badge variant="outline" className={`${computerThinking ? "animate-pulse" : ""} shrink-0`}>
                <Bot className="h-3 w-3 mr-1" />
                <span className="hidden sm:inline">{computerThinking ? "Thinking…" : "Bot's turn"}</span>
                <span className="sm:hidden">{computerThinking ? "…" : "Bot"}</span>
              </Badge>
            ) : (
              <Badge variant="outline" className="shrink-0">
                <User className="h-3 w-3 mr-1" />
                <span className="hidden sm:inline">Your turn</span>
                <span className="sm:hidden">You</span>
              </Badge>
            )}
            {isCheck && <Badge variant="destructive" className="shrink-0">Check</Badge>}
            {!isAtLatest && (
              <Badge variant="secondary" className="shrink-0">
                Reviewing · <button className="underline ml-1" onClick={() => setViewIndex(fenHistory.length - 1)}>latest</button>
              </Badge>
            )}
          </div>

          <div className="ml-auto flex gap-2 shrink-0">
            <button
              onClick={() => {
                setSessionKind("new");
                setCurrentGameId(null);
                setStartingFen(null);
                setGameEnded(false);
                reset();
                localStorage.removeItem("voxchess_game");
                computerThinkingRef.current = false;
                setComputerThinking(false);
                setHintStage(0); setHintFrom(null); setHintTo(null);
                setAvatarState("idle"); setAvatarText("");
                if (avatarTimeoutRef.current) clearTimeout(avatarTimeoutRef.current);
                window.speechSynthesis?.cancel();
                // Remove gameId from URL so the auto-load effect doesn't re-fire
                navigate({ to: "/play", search: {} });
                speakAvatar(pickRandom(currentPersonality.responses.greetings));
              }}
              className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-input bg-background hover:bg-accent transition-colors text-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">New</span>
            </button>


            {/* Custom ... menu — plain HTML, no Radix */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-input bg-background hover:bg-accent transition-colors"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-card border border-border rounded-md shadow-lg py-1 z-50">
                  <MenuItem label="Undo" icon={Undo2}
                    disabled={moveCount < 2 || gameEnded}
                    onClick={() => { handleUndo(); setMenuOpen(false); }} />
                  <MenuSeparator />
                  <MenuItem label={hintLabel} icon={Lightbulb}
                    disabled={isComputerTurn || gameEnded}
                    onClick={() => { handleHint(); setMenuOpen(false); }} />
                  <MenuSeparator />
                  <MenuItem label="Offer Draw" icon={Handshake}
                    disabled={isComputerTurn || moveCount < 20 || gameEnded}
                    onClick={() => { handleDrawOffer(); setMenuOpen(false); }} />
                  <MenuSeparator />
                  <MenuItem label="Save" icon={Save}
                    onClick={() => { handleSave(); setMenuOpen(false); }} />
                  <MenuItem label="Resign" icon={Flag}
                    disabled={moveCount < 4 || gameEnded} destructive
                    onClick={() => { handleResign(); setMenuOpen(false); }} />
                  <MenuSeparator />
                  <MenuItem label="Flip Board" icon={FlipHorizontal2}
                    onClick={() => { setFlipped((f) => !f); setMenuOpen(false); }} />
                  <MenuItem
                    label="Show Personality"
                    icon={Check}
                    isCheckbox
                    checked={personalityVisible}
                    onClick={() => setPersonalityVisible((v) => !v)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main grid */}
        <div className={
          isPortrait
            ? "flex flex-col gap-3"
            : "flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3 overflow-hidden"
        }>
          {/* Board card */}
          <Card className={`p-3 ${isPortrait ? "shrink-0" : "overflow-hidden"}`}>
            <div className={`flex flex-col items-center gap-2 ${isPortrait ? "" : "justify-center h-full"}`}>

              {/* Computer label */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground w-full justify-center">
                <img
                  src={currentPersonality.images[computerThinking ? "thinking" : "idle"]}
                  alt={currentPersonality.name}
                  className="h-6 w-6 object-contain"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
                <span className="font-medium text-foreground">{currentPersonality.name}</span>
                <span className="text-xs">· {elo} ELO</span>
                {computerThinking && (
                  <span className="text-xs animate-pulse text-[var(--accent-blue)]">thinking…</span>
                )}
              </div>

              {/* Board */}
              <div
                ref={boardContainerRef}
                className="relative"
                style={{ width: boardSize, height: boardSize }}
              >
                <Chessboard
                  options={{
                    position: displayFen,
                    boardOrientation,
                    onPieceDrop: handlePieceDrop,
                    boardStyle: { borderRadius: 6, overflow: "hidden" },
                    darkSquareStyle: { backgroundColor: boardTheme.dark },
                    lightSquareStyle: { backgroundColor: boardTheme.light },
                  }}
                />
                <BoardOverlay
                  arrows={hintArrows}
                  highlights={hintHighlights}
                  boardRef={boardContainerRef}
                />
              </div>

              {/* Player label */}
              <div className="flex items-center gap-2 text-sm w-full justify-center">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">You</span>
                <span className="text-xs text-muted-foreground">
                  · {playerColor === "w" ? "White" : "Black"}
                </span>
              </div>
            </div>
          </Card>

          {/* Right panel */}
          <div className={`flex flex-col gap-3 ${isPortrait ? "" : "min-h-0 overflow-hidden lg:h-full"}`}>

            {/* Personality panel */}
            {personalityVisible && !gameEnded && (
              <Card className="p-4 shrink-0">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-16 h-16">
                    <img
                      key={avatarState}
                      src={currentPersonality.images[avatarState]}
                      alt={currentPersonality.name}
                      className="w-full h-full object-contain drop-shadow-sm"
                      style={{
                        animation:
                          avatarState === "idle" ? "avatarBob 3s ease-in-out infinite" :
                            avatarState === "thinking" ? "avatarBob 1.5s ease-in-out infinite" :
                              "avatarTalk 0.3s ease-in-out",
                      }}
                      onError={(e) => {
                        const el = e.currentTarget as HTMLImageElement;
                        el.style.display = "none";
                        const fallback = el.nextSibling as HTMLElement | null;
                        if (fallback) fallback.style.display = "flex";
                      }}
                    />
                    <div style={{ display: "none" }} className="w-full h-full items-center justify-center text-4xl">
                      {currentPersonality.emoji}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-foreground">{currentPersonality.name}</div>
                    <div className="text-[10px] text-muted-foreground mb-1">{currentPersonality.species}</div>
                    {avatarText ? (
                      <div className="text-xs text-foreground/80 leading-relaxed">
                        {avatarText}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground italic">
                        {avatarState === "thinking" ? "Calculating…" : "Waiting for your move…"}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Move list */}
            <Card className={`p-4 flex flex-col ${isPortrait ? "min-h-40" : "flex-1 min-h-0"}`}>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 shrink-0">
                Moves
              </div>
              <ScrollArea className={isPortrait ? "h-40" : "flex-1 min-h-0"}>
                <table className="w-full text-xs font-mono">
                  <tbody>
                    {Array.from({ length: Math.ceil(history.length / 2) }, (_, i) => {
                      const wIdx = i * 2 + 1; // viewIndex for white's move
                      const bIdx = i * 2 + 2; // viewIndex for black's move
                      return (
                        <tr key={i} className="border-b border-border/20 last:border-0">
                          <td className="py-1 pr-2 text-muted-foreground w-8">{i + 1}.</td>
                          <td className="py-1 pr-1 w-[45%]">
                            <button
                              onClick={() => setViewIndex(wIdx)}
                              className={`px-1.5 py-0.5 rounded w-full text-left hover:bg-muted transition-colors ${viewIndex === wIdx
                                ? "bg-[var(--accent-chess)]/20 text-[var(--accent-chess)] font-semibold"
                                : ""
                                }`}
                            >
                              {history[i * 2]}
                            </button>
                          </td>
                          <td className="py-1 w-[45%]">
                            {history[i * 2 + 1] && (
                              <button
                                onClick={() => setViewIndex(bIdx)}
                                className={`px-1.5 py-0.5 rounded w-full text-left hover:bg-muted transition-colors ${viewIndex === bIdx
                                  ? "bg-[var(--accent-chess)]/20 text-[var(--accent-chess)] font-semibold"
                                  : ""
                                  }`}
                              >
                                {history[i * 2 + 1]}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollArea>
            </Card>


          </div>
        </div>

        <style>{`
        @keyframes avatarBob {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-4px); }
        }
        @keyframes avatarTalk {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.05); }
        }
        @keyframes avatarSlideIn {
          from { transform: translateX(-40px); opacity: 0; }
          to   { transform: translateX(0);     opacity: 1; }
        }
      `}</style>

        {pendingPromotion && (
          <PromotionPickerModal
            color={new Chess(fen).turn()}
            onPick={handlePromotionPick}
            onCancel={() => setPendingPromotion(null)}
          />
        )}

        <GameOverDialog
          open={overOpen}
          result={gameOverLabel}
          onClose={() => setOverOpen(false)}
          onNew={handleNewGame}
          personality={currentPersonality}
          avatarState={gameOverAvatarState}
          avatarText={gameOverAvatarText}
        />
      </div>
    </div>
  );
}
