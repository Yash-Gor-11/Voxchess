import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Undo2, Save, Download, Flag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { BoardWrapper } from "@/components/chess/BoardWrapper";
import { MoveList } from "@/components/chess/MoveList";
import { GameOverDialog } from "@/components/chess/GameOverDialog";
import { ChessVoiceButton } from "@/components/voice/ChessVoiceButton";
import { NavVoiceButton } from "@/components/voice/NavVoiceButton";
import { TranscriptDisplay } from "@/components/voice/TranscriptDisplay";
import { useChessGame } from "@/hooks/useChessGame";
import { useChessVoice } from "@/hooks/useChessVoice";
import { voiceCommandExamples } from "@/lib/mock-data";
import { saveGame } from '@/lib/supabase/games';

export const Route = createFileRoute("/_app/play")({
  head: () => ({ meta: [{ title: "Play — VoxChess" }, { name: "description", content: "Play chess with your voice." }] }),
  component: PlayPage,
});

function getGameResult(game: import("chess.js").Chess): "white" | "black" | "draw" | "ongoing" {
  if (!game.isGameOver()) return "ongoing";
  if (game.isCheckmate()) return game.turn() === "w" ? "black" : "white";
  return "draw"; // stalemate, repetition, insufficient material, 50-move rule
}

function getGameOverLabel(game: import("chess.js").Chess): string {
  if (game.isCheckmate()) return "Checkmate";
  if (game.isStalemate()) return "Stalemate";
  if (game.isThreefoldRepetition()) return "Draw by repetition";
  if (game.isInsufficientMaterial()) return "Draw — insufficient material";
  if (game.isDraw()) return "Draw";
  return "Game over";
}

function PlayPage() {
  const { game, fen, history, move, moveSan, undo, reset, exportPgn, isCheck, isGameOver, turn } = useChessGame();
  const [overOpen, setOverOpen] = useState(false);
  const { activate, isActive } = useChessVoice({ game, onMove: (san) => moveSan(san) });
  const canResign = history.length >= 20; // 10 full moves = 20 plies

  useEffect(() => { if (isGameOver) setOverOpen(true); }, [isGameOver]);

  useEffect(() => {
    function isInputFocused() {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable);
    }
    function onKey(e: KeyboardEvent) {
      if (e.code !== "Space" || isInputFocused()) return;
      e.preventDefault();
      activate();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activate]);

  const onPieceDrop = (from: string, to: string) => move(from, to);

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-6">
      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Move history</span>
            <Badge variant="secondary" className="text-[10px]">{history.length} ply</Badge>
          </div>
          <MoveList moves={history} />
        </Card>
        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Evaluation</div>
          <Progress value={52} className="h-2" />
          <div className="mt-2 text-xs text-muted-foreground font-mono">+0.2 · roughly equal</div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Badge variant="outline">{turn === "white" ? "White to move" : "Black to move"}</Badge>
          {isCheck && <Badge variant="destructive">Check</Badge>}
          {isGameOver && <Badge>Game over</Badge>}
        </div>
        <BoardWrapper fen={fen} onPieceDrop={onPieceDrop} />
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button size="sm" onClick={() => { reset(); setOverOpen(false); toast.success("New game"); }}>
            <Plus className="h-4 w-4 mr-1.5" />New
          </Button>
          <Button size="sm" variant="outline" onClick={undo}><Undo2 className="h-4 w-4 mr-1.5" />Undo</Button>
          <Button size="sm" variant="outline" onClick={async () => {
            try {
              await saveGame(exportPgn(), getGameResult(game));
              toast.success('Game saved');
            } catch (e) {
              console.error(e);
              toast.error('Could not save game');
            }
          }}>
            <Save className="h-4 w-4 mr-1.5" />Save
          </Button>
          <Button size="sm" variant="outline" onClick={() => {
            const pgn = exportPgn();
            navigator.clipboard?.writeText(pgn);
            toast.success("PGN copied");
          }}>
            <Download className="h-4 w-4 mr-1.5" />Export PGN
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-disabled={!canResign}
            className={!canResign ? "opacity-50" : undefined}
            onClick={async () => {
              if (!canResign) {
                toast("Resign not available before 10 full moves");
                return;
              }

              const pgn = exportPgn();
              try {
                await saveGame(pgn, turn === "white" ? "black" : "white");
                toast("Game saved.");
              } catch {
                toast("Resigned");
              }
              reset();
              setOverOpen(false);
            }}
          >
            <Flag className="h-4 w-4 mr-1.5" />Resign
          </Button>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-5 text-center">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Voice controls</div>
          <div className="mt-4 flex flex-col items-center gap-2">
            <ChessVoiceButton onActivate={activate} isActive={isActive} enabled />
            <div className="text-sm font-medium mt-2">Chess moves</div>
            <Badge variant="secondary" className="font-mono text-[10px]">Space</Badge>
          </div>
          <TranscriptDisplay mode="chess" />

          <div className="mt-6 flex flex-col items-center gap-2">
            <NavVoiceButton size="md" />
            <div className="text-xs text-muted-foreground mt-2">Site navigation · <span className="font-mono">N</span></div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Try saying…</div>
          <ul className="space-y-1.5 text-xs">
            {voiceCommandExamples.chess.slice(0, 4).map((c) => (
              <li key={c.phrase} className="flex justify-between gap-2">
                <span className="text-muted-foreground">“{c.phrase}”</span>
                <span className="font-mono">{c.san}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <GameOverDialog
        open={overOpen}
        result={getGameOverLabel(game)}
        onClose={() => setOverOpen(false)}
        onNew={() => { reset(); setOverOpen(false); }}
      />
    </div>
  );
}
