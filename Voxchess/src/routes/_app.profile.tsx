import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { User, Trophy, Swords, X, Equal, TrendingUp, LineChart } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getPlatformGames } from "@/lib/supabase/games";
import { supabase } from "@/integrations/supabase/client";
import { buildGameCardData, type SemanticResult } from "@/lib/chess/gameCard";
import { toast } from "sonner";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_app/profile")({
  head: () => ({ meta: [{ title: "Profile — VoxChess" }] }),
  component: ProfilePage,
});

// Shared semantic-result helpers.
function resultLabel(result: SemanticResult | undefined): string {
  if (!result || result === "ongoing") return "Ongoing";
  if (result === "white") return "White wins";
  if (result === "black") return "Black wins";
  return "Draw";
}

function resultVariant(
  result: SemanticResult | undefined,
): "default" | "destructive" | "secondary" {
  if (result === "white") return "default";
  if (result === "black") return "destructive";
  return "secondary";
}

function ProfilePage() {
  const [games, setGames] = useState<Awaited<ReturnType<typeof getPlatformGames>>>([]);
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
        // getPlatformGames() already orders by created_at descending —
        // no need to re-sort client-side.
        const g = await getPlatformGames();
        setGames(g);
      } catch {
        toast.error("Could not load profile");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Account-level aggregates — intentionally read g.result (the raw DB
  // column) directly, not card.result. These are stats about the
  // account's win/loss/draw history, not card presentation, so they
  // stay tied to the database's own source of truth rather than the
  // resolver's per-card vocabulary (even though the values overlap
  // today, these two things answer different questions).
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const g of games) {
    switch (g.result) {
      case "white":
        wins++;
        break;
      case "black":
        losses++;
        break;
      case "draw":
        draws++;
        break;
    }
  }
  const completed = wins + losses + draws;
  const total = games.length;
  const winRate = completed > 0 ? Math.round((wins / completed) * 100) : 0;

  const displayName = dbUser?.display_name || user?.email?.split("@")[0] || "Player";
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "—";

  const stats = [
    { label: "Games played", value: total, icon: Swords },
    { label: "Wins", value: wins, icon: Trophy },
    { label: "Draws", value: draws, icon: Equal },
    { label: "Losses", value: losses, icon: X },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
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
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge variant="outline">Member since {memberSince}</Badge>
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[var(--accent-blue)]" />
                <span className="text-sm font-medium">Win rate</span>
              </div>
              <div className="text-2xl font-semibold">{loading ? "—" : `${winRate}%`}</div>
            </div>
          </Card>
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
                const card = buildGameCardData(g);
                const title = `${card.white.name ?? "White"} vs ${card.black.name ?? "Black"}`;
                return (
                  <div
                    key={g.id}
                    className="flex items-center justify-between py-2 border-b border-border/40 last:border-0"
                  >
                    <div>
                      <div className="text-sm font-medium">{title}</div>
                      <div className="text-xs text-muted-foreground">
                        {card.moveCount} moves ·{" "}
                        {new Date(card.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {card.result && card.result !== "ongoing" && (
                        <Badge variant={resultVariant(card.result)}>
                          {resultLabel(card.result)}
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate({ to: "/analysis/$gameId", params: { gameId: g.id } })}
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
    </div>
  );
}