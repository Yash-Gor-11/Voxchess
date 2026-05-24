import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, LineChart, BookOpen, Pencil, Check, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getStudy, getStudyChapters, renameStudy } from "@/lib/supabase/games";
import type { Game, Study } from "@/lib/supabase/games";
import { countMovesFromPgn } from "@/lib/utils";

export const Route = createFileRoute("/_app/games/studies/$studyId")({
  head: () => ({ meta: [{ title: "Study — VoxChess" }] }),
  component: StudyDetailPage,
});

function resultShort(result: string | null): string {
  if (result === "white") return "1–0";
  if (result === "black") return "0–1";
  if (result === "draw") return "½–½";
  return "*";
}

function resultVariant(result: string | null): "default" | "destructive" | "secondary" {
  if (result === "white") return "default";
  if (result === "black") return "destructive";
  return "secondary";
}

function StudyDetailPage() {
  const navigate = useNavigate();
  const { studyId } = useParams({ from: "/_app/games/studies/$studyId" });

  const [study, setStudy] = useState<Study | null>(null);
  const [chapters, setChapters] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  // Rename state
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [s, ch] = await Promise.all([
          getStudy(studyId),
          getStudyChapters(studyId),
        ]);
        setStudy(s);
        setNameInput(s.name);
        setChapters(ch);
      } catch {
        toast.error("Could not load study");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [studyId]);

  async function handleRename() {
    if (!study || !nameInput.trim()) return;
    try {
      await renameStudy(study.id, nameInput.trim());
      setStudy((prev) => prev ? { ...prev, name: nameInput.trim() } : prev);
      setRenaming(false);
      toast.success("Study renamed");
    } catch {
      toast.error("Could not rename study");
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate({ to: "/games/studies" })}
          aria-label="Back to studies"
          className="mt-0.5 flex-shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex-1 min-w-0 overflow">
          {renaming ? (
            <div className="flex items-center gap-2">
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="h-8 text-base font-semibold"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") setRenaming(false);
                }}
              />
              <Button size="icon" variant="ghost" onClick={handleRename} aria-label="Save name">
                <Check className="h-4 w-4 text-[var(--accent-chess)]" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setRenaming(false)} aria-label="Cancel">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold truncate">{study?.name}</h2>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 flex-shrink-0"
                onClick={() => setRenaming(true)}
                aria-label="Rename study"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          )}
          <p className="text-sm text-muted-foreground mt-0.5">
            {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"}
          </p>
        </div>
      </div>

      {/* Empty state */}
      {chapters.length === 0 && (
        <Card className="p-10 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No chapters in this study.</p>
        </Card>
      )}

      {/* Chapter list */}
      <div className="space-y-2">
        {chapters.map((ch, i) => {
          const chapterName = ch.metadata?.ChapterName ?? ch.metadata?.Event;
          const white = ch.metadata?.White ?? "White";
          const black = ch.metadata?.Black ?? "Black";
          const moveCount = countMovesFromPgn(ch.pgn);

          return (
            <Card
              key={ch.id}
              className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-muted/40 transition-colors group"
              onClick={() =>
                navigate({ to: "/analysis/$gameId", params: { gameId: ch.id } })
              }
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate({ to: "/analysis/$gameId", params: { gameId: ch.id } });
                }
              }}
            >
              {/* Serial number */}
              <div className="flex-shrink-0 w-7 text-xs font-mono text-muted-foreground text-right">
                {i + 1}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {chapterName ?? `${white} vs ${black}`}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {white} vs {black} · {moveCount} moves
                </div>
              </div>

              {/* Result */}
              {ch.result && ch.result !== "ongoing" && (
                <Badge variant={resultVariant(ch.result)} className="flex-shrink-0">
                  {resultShort(ch.result)}
                </Badge>
              )}

              {/* Analyse button */}
              <Button
                size="sm"
                variant="outline"
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate({ to: "/analysis/$gameId", params: { gameId: ch.id } });
                }}
              >
                <LineChart className="h-3.5 w-3.5 mr-1.5" />
                Analyse
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}