import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trash2, LineChart, FolderOpen, ArrowLeft, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getImportedGames, deleteGame } from "@/lib/supabase/games";
import type { Game } from "@/lib/supabase/games";
import { countMovesFromPgn } from "@/lib/utils";

export const Route = createFileRoute("/_app/games/imported")({
  head: () => ({ meta: [{ title: "Imported Games — VoxChess" }] }),
  component: ImportedGamesPage,
});

function resultVariant(result: string | null): "default" | "destructive" | "secondary" {
  if (result === "white") return "default";
  if (result === "black") return "destructive";
  return "secondary";
}

function ImportedGamesPage() {
  const navigate = useNavigate();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getImportedGames();
        setGames(data);
      } catch {
        toast.error("Could not load imported games");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleDelete(id: string) {
    try {
      await deleteGame(id);
      setGames((prev) => prev.filter((g) => g.id !== id));
      toast.success("Deleted");
    } catch {
      toast.error("Could not delete");
    }
  }

  // Separate FEN positions from PGN imports for rendering
  const isPosition = (g: Game) => !!g.fen && !g.pgn;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate({ to: "/games" })}
          aria-label="Back to games"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">Imported Games</h2>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Loading…"
              : `${games.length} ${games.length === 1 ? "item" : "items"}`}
          </p>
        </div>
        <div className="ml-auto">
          <Button size="sm" disabled title="Coming soon">
            Import
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {!loading && games.length === 0 && (
        <Card className="p-10 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No imported games yet.</p>
          <Button size="sm" className="mt-4" disabled title="Coming soon">
            Import a game
          </Button>
        </Card>
      )}

      {/* List */}
      <div className="space-y-2">
        {games.map((g, i) => {
          const pos = isPosition(g);
          const title = pos
            ? (g.metadata?.name ?? "Saved position")
            : `${g.metadata?.White ?? "White"} vs ${g.metadata?.Black ?? "Black"}`;
          const subtitle = pos
            ? (g.metadata?.note ?? g.fen ?? "")
            : `${countMovesFromPgn(g.pgn)} moves · ${g.metadata?.Event ?? ""} · ${
                g.metadata?.Date ?? ""
              }`.replace(/^ · | · $/g, "").replace(/ ·  · /g, " · ");

          return (
            <Card key={g.id} className="flex items-center gap-4 px-5 py-4">
              {/* Serial number */}
              <div className="flex-shrink-0 w-7 text-xs font-mono text-muted-foreground text-right">
                {i + 1}
              </div>

              {/* Icon */}
              <div className="flex-shrink-0">
                {pos ? (
                  <MapPin className="h-4 w-4 text-[var(--accent-chess)]" />
                ) : (
                  <LineChart className="h-4 w-4 text-[var(--accent-blue)]" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{title}</div>
                {subtitle && (
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {subtitle}
                  </div>
                )}
              </div>

              {/* Result badge — only for PGN games */}
              {!pos && g.result && g.result !== "ongoing" && (
                <Badge variant={resultVariant(g.result)} className="flex-shrink-0">
                  {g.result === "white"
                    ? "1–0"
                    : g.result === "black"
                      ? "0–1"
                      : "½–½"}
                </Badge>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigate({ to: "/analysis/$gameId", params: { gameId: g.id } })
                  }
                >
                  <LineChart className="h-3.5 w-3.5 mr-1.5" />
                  {pos ? "Analyse" : "Analyse"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(g.id)}
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}