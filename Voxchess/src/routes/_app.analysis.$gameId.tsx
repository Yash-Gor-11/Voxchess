import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Chess } from "chess.js";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BoardWrapper } from "@/components/chess/BoardWrapper";
import { MoveList } from "@/components/chess/MoveList";
import { ChessVoiceButton } from "@/components/voice/ChessVoiceButton";
import { TranscriptDisplay } from "@/components/voice/TranscriptDisplay";
import { getGame } from "@/lib/supabase/games";
import { toast } from "sonner";
import { useVoiceStore } from "@/stores/voiceStore";
import { isSpeechSupported, startRecognition } from "@/lib/voice/speechRecognition";

export const Route = createFileRoute("/_app/analysis/$gameId")({
  head: () => ({ meta: [{ title: "Analysis — VoxChess" }] }),
  component: AnalysisPage,
});

function AnalysisPage() {
  const { gameId } = Route.useParams();
  const navigate = useNavigate();
  const [positions, setPositions] = useState<string[]>([]);
  const [moves, setMoves] = useState<string[]>([]);
  const [currentPly, setCurrentPly] = useState(0);
  const [loading, setLoading] = useState(true);
  const { setActive, setStatus, setTranscript, setResult, activeMode } = useVoiceStore();
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    getGame(gameId)
      .then((game) => {
        if (!game.pgn) { toast.error("No moves in this game"); return; }
        const chess = new Chess();
        chess.loadPgn(game.pgn);
        const history = chess.history();
        const fens: string[] = [];
        const temp = new Chess();
        fens.push(temp.fen());
        for (const move of history) {
          temp.move(move);
          fens.push(temp.fen());
        }
        setPositions(fens);
        setMoves(history);
        setCurrentPly(0);
      })
      .catch(() => toast.error("Could not load game"))
      .finally(() => setLoading(false));
  }, [gameId]);

  const goTo = useCallback((ply: number) => {
    setCurrentPly(Math.max(0, Math.min(ply, positions.length - 1)));
  }, [positions.length]);

  const first = useCallback(() => goTo(0), [goTo]);
  const prev = useCallback(() => goTo(currentPly - 1), [goTo, currentPly]);
  const next = useCallback(() => goTo(currentPly + 1), [goTo, currentPly]);
  const last = useCallback(() => goTo(positions.length - 1), [goTo, positions.length]);

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
        toast.error("Could not hear command");
      },
    });
  }, [isListening, setActive, setStatus, setTranscript, setResult]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const inputFocused = !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable);
      if (inputFocused) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      if (e.code === "Space") {
        e.preventDefault();
        activateVoice();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, activateVoice]);


  function handleVoiceCommand(t: string) {
    // Normalize spoken numbers to digits
    const numberWords: Record<string, string> = {
      one: "1", two: "2", three: "3", four: "4", five: "5",
      six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
      eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15",
      sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20",
    };

    let normalized = t;
    Object.entries(numberWords).forEach(([word, digit]) => {
      normalized = normalized.replace(new RegExp(`\\b${word}\\b`, "g"), digit);
    });

    // Navigation commands
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

    // Jump to move number
    const jumpMatch = normalized.match(/(?:go to|jump to|move|goto)\s+(\d+)/);
    if (jumpMatch) {
      const moveNum = parseInt(jumpMatch[1]);
      if (moveNum >= 1) {
        const ply = (moveNum - 1) * 2;
        goTo(ply);
        setResult({ ok: true, message: `Move ${moveNum}` });
        setStatus("success");
        return;
      }
    }

    setResult({ ok: false, message: `Not recognised: "${t}"` });
    setStatus("error");
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading game…</div>;
  if (positions.length === 0) return <div className="p-6 text-sm text-muted-foreground">No positions found.</div>;

  const currentFen = positions[currentPly];
  const moveNumber = Math.ceil(currentPly / 2);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/saved-games" })}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
        </Button>
        <h2 className="text-base font-semibold">Analysis</h2>
        <Badge variant="outline">
          {currentPly === 0 ? "Start" : `Move ${moveNumber} · ply ${currentPly}`}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <div className="space-y-4">
          <Card className="p-4">
            <BoardWrapper
              fen={currentFen}
              onPieceDrop={() => false}
            />
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button size="sm" variant="outline" onClick={first} disabled={currentPly === 0}>
                <ChevronFirst className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={prev} disabled={currentPly === 0}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground font-mono w-24 text-center">
                {currentPly} / {positions.length - 1}
              </span>
              <Button size="sm" variant="outline" onClick={next} disabled={currentPly === positions.length - 1}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={last} disabled={currentPly === positions.length - 1}>
                <ChevronLast className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
              Engine eval
            </div>
            <div className="h-24 rounded bg-muted/40 flex items-center justify-center">
              <span className="text-xs text-muted-foreground">Stockfish coming soon</span>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
              Move list
            </div>
            <MoveList moves={moves} currentPly={currentPly} />
          </Card>

          <Card className="p-4 text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
              Voice navigation
            </div>
            <ChessVoiceButton
              onActivate={activateVoice}
              isActive={isListening}
              enabled
            />
            <div className="text-xs text-muted-foreground mt-2">
              Space · "next" · "previous" · "go to move 5"
            </div>
            <TranscriptDisplay mode="chess" />
          </Card>
        </div>
      </div>
    </div>
  );
}