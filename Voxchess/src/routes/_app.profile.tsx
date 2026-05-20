import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { User, Trophy, Swords, Minus, TrendingUp, LineChart } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getGames } from "@/lib/supabase/games";
import { supabase } from "@/integrations/supabase/client";
import { countMovesFromPgn } from "@/lib/utils";
import { toast } from "sonner";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_app/profile")({
  head: () => ({ meta: [{ title: "Profile — VoxChess" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const [games, setGames] = useState<Awaited<ReturnType<typeof getGames>>>([]);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [dbUser, setDbUser] = useState<Tables<"users"> | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError || !user) return;
        setUser(user);

        const { data: dbData, error: dbError } = await supabase
          .from("users")
          .select("*")
          .eq("id", user.id)
          .single();
        if (!dbError) setDbUser(dbData);

        const g = await getGames();
        setGames(g);
      } catch {
        toast.error("Could not load profile");
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
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  const displayName = dbUser?.display_name || user?.email?.split("@")[0] || "Player";
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "—";

  const stats = [
    { label: "Games played", value: total, icon: Swords },
    { label: "Wins", value: wins, icon: Trophy },
    { label: "Losses", value: losses, icon: Minus },
    { label: "Draws", value: draws, icon: Minus },
    { label: "Win rate", value: `${winRate}%`, icon: TrendingUp },
    { label: "Rating", value: dbUser?.rating ?? 1200, icon: TrendingUp },
  ];

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-semibold">Profile</h2>

      <Card className="p-6">
        <div className="flex items-center gap-5">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-xl bg-[var(--accent-blue)] text-white">
              <User className="h-8 w-8" />
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="text-xl font-semibold">{loading ? "—" : displayName}</div>
            <div className="text-sm text-muted-foreground mt-0.5">{user?.email}</div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline">Member since {memberSince}</Badge>
              <Badge variant="secondary">Rating {loading ? "—" : (dbUser?.rating ?? 1200)}</Badge>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
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

      <Card className="p-5">
        <div className="text-sm font-medium mb-4">Recent games</div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : games.length === 0 ? (
          <p className="text-sm text-muted-foreground">No games yet.</p>
        ) : (
          <div className="space-y-2">
            {games.slice(0, 8).map((g) => {
              const moveCount = countMovesFromPgn(g.pgn);
              return (
                <div
                  key={g.id}
                  className="flex items-center justify-between py-2 border-b border-border/40 last:border-0"
                >
                  <div className="flex items-center gap-3">
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
                  <div className="flex items-center gap-2">
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
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigate({ to: "/analysis/$gameId", params: { gameId: g.id } })
                      }
                    >
                      <LineChart className="h-3.5 w-3.5 mr-1.5" />
                      Analyse
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
