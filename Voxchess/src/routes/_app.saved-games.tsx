import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trash2, LineChart, BookMarked } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getGames, deleteGame } from "@/lib/supabase/games";
import { countMovesFromPgn } from "@/lib/utils";

export const Route = createFileRoute("/_app/saved-games")({
  head: () => ({ meta: [{ title: "Saved games — VoxChess" }] }),
  component: SavedGamesPage,
});

function SavedGamesPage() {
  const navigate = useNavigate();
  const [games, setGames] = useState<Awaited<ReturnType<typeof getGames>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getGames();
        setGames(data);
      } catch {
        toast.error("Could not load saved games");
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
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Saved games</h2>
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading…" : `${games.length} game${games.length !== 1 ? "s" : ""} saved`}
        </p>
      </div>

      {!loading && games.length === 0 && (
        <Card className="p-10 text-center">
          <BookMarked className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No saved games yet.</p>
          <Button
            size="sm"
            className="mt-4"
            onClick={() => navigate({ to: "/play" })}
          >
            Play a game
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {games.map((g) => {
          const moveCount = countMovesFromPgn(g.pgn);

          return (
            <Card key={g.id} className="p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-medium">
                    {new Date(g.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {moveCount} moves · {g.mode}
                  </div>
                </div>
                <Badge
                  variant={
                    g.result === "white"
                      ? "default"
                      : g.result === "black"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {g.result ?? "ongoing"}
                </Badge>
              </div>

              <div className="flex gap-2 mt-auto">
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
