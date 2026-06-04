import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trash2, LineChart, Swords, ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getPlatformGames, deleteGame } from "@/lib/supabase/games";
import type { Game } from "@/lib/supabase/games";
import { countMovesFromPgn } from "@/lib/utils";

export const Route = createFileRoute("/_app/games/my-games")({
  head: () => ({ meta: [{ title: "My Games — VoxChess" }] }),
  component: MyGamesPage,
});

function resultLabel(result: string | null): string {
  if (!result || result === "ongoing") return "Ongoing";
  if (result === "white") return "White wins";
  if (result === "black") return "Black wins";
  if (result === "draw") return "Draw";
  return result;
}

function resultVariant(result: string | null): "default" | "destructive" | "secondary" {
  if (result === "white") return "default";
  if (result === "black") return "destructive";
  return "secondary";
}

function MyGamesPage() {
  const navigate = useNavigate();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getPlatformGames();
        setGames(data);
      } catch {
        toast.error("Could not load games");
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
      toast.success("Game deleted");
    } catch {
      toast.error("Could not delete game");
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
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
          <h2 className="text-lg font-semibold">My Games</h2>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Loading…"
              : `${games.length} ${games.length === 1 ? "game" : "games"}`}
          </p>
        </div>
      </div>

      {/* Empty state */}
      {!loading && games.length === 0 && (
        <Card className="p-10 text-center">
          <Swords className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No games played yet.</p>
          <Button
            size="sm"
            className="mt-4"
            onClick={() => navigate({ to: "/play" })}
          >
            Play a game
          </Button>
        </Card>
      )}

      {/* Game list */}
      <div className="space-y-2">
        {games.map((g, i) => {
          const moveCount = countMovesFromPgn(g.pgn);
          const white = g.metadata?.White ?? "White";
          const black = g.metadata?.Black ?? "Black";

          return (
            <Card key={g.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-6 text-xs font-mono text-muted-foreground text-right">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {white} vs {black}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {moveCount} moves · {new Date(g.created_at).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </div>
                </div>

                <Badge variant={resultVariant(g.result)} className="flex-shrink-0 text-xs">
                  {resultLabel(g.result)}
                </Badge>

                {/* Actions inline on sm+ */}
                <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
  {(!g.result || g.result === "ongoing") && (
    <Button
      size="sm"
      variant="outline"
      onClick={() => navigate({ to: "/play", search: { gameId: g.id } })}
    >
      <Swords className="h-3.5 w-3.5 mr-1.5" />
      Continue
    </Button>
  )}
  <Button
    size="sm"
    variant="outline"
    onClick={() => navigate({ to: "/analysis/$gameId", params: { gameId: g.id } })}
  >
    <LineChart className="h-3.5 w-3.5 mr-1.5" />
    Analyse
  </Button>
  <Button
    size="sm"
    variant="ghost"
    onClick={() => handleDelete(g.id)}
    aria-label="Delete game"
  >
    <Trash2 className="h-3.5 w-3.5 text-destructive" />
  </Button>
</div>
              </div>

              {/* Actions below on mobile */}
              <div className="flex sm:hidden gap-2 mt-3 ml-9">
  {(!g.result || g.result === "ongoing") && (
    <Button
      size="sm"
      variant="outline"
      className="flex-1"
      onClick={() => navigate({ to: "/play", search: { gameId: g.id } })}
    >
      <Swords className="h-3.5 w-3.5 mr-1.5" />
      Continue
    </Button>
  )}
  <Button
    size="sm"
    variant="outline"
    className="flex-1"
    onClick={() => navigate({ to: "/analysis/$gameId", params: { gameId: g.id } })}
  >
    <LineChart className="h-3.5 w-3.5 mr-1.5" />
    Analyse
  </Button>
  <Button
    size="sm"
    variant="ghost"
    onClick={() => handleDelete(g.id)}
    aria-label="Delete game"
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