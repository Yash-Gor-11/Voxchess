import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Trophy, Swords, Minus, Equal, BookMarked, TrendingUp, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getGames } from "@/lib/supabase/games";
import { countMovesFromPgn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — VoxChess" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const [games, setGames] = useState<Awaited<ReturnType<typeof getGames>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getGames();
        setGames(data);
      } catch {
        toast.error("Could not load games");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const wins = games.filter((g) => g.result === "white").length;
  const losses = games.filter((g) => g.result === "black").length;
  const draws = games.filter((g) => g.result === "draw").length;
  const total = games.length;

  const stats = [
    { label: "Games played", value: total, icon: Swords },
    { label: "Wins", value: wins, icon: Trophy },
    { label: "Draws", value: draws, icon: Equal },
    { label: "Losses", value: losses, icon: Minus },
  ];

  const recent = games.slice(0, 5);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Dashboard</h2>
          <p className="text-sm text-muted-foreground">Your chess activity at a glance.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <Card key={s.label} className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-2xl font-semibold">{loading ? "—" : s.value}</div>
              </Card>
            );
          })}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium">Recent games</span>
              <Button size="sm" variant="outline" onClick={() => navigate({ to: "/games/my-games" })}>
                View all
              </Button>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : recent.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">No games yet.</p>
                <Button size="sm" className="mt-3" onClick={() => navigate({ to: "/play" })}>
                  Play your first game
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {recent.map((g) => {
                  const moveCount = countMovesFromPgn(g.pgn);
                  return (
                    <div
                      key={g.id}
                      className="flex items-center justify-between py-2 border-b border-border/40 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <BookMarked className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium">
                            {new Date(g.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {moveCount} moves · {g.mode}
                          </div>
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
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="text-sm font-medium mb-4">Quick actions</div>
            <div className="space-y-2">
              <Button className="w-full justify-start" onClick={() => navigate({ to: "/play" })}>
                <Swords className="h-4 w-4 mr-2" /> New game vs Computer
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => navigate({ to: "/games" })}
              >
                <BookMarked className="h-4 w-4 mr-2" /> Saved games
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => navigate({ to: "/import" })}
              >
                <Upload className="h-4 w-4 mr-2" /> Import game
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}