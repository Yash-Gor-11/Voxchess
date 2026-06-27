import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Swords, Upload, BookMarked, FolderKanban, Library, Boxes } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getPlatformGames, getImportedGames, getStudies } from "@/lib/supabase/games";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — VoxChess" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const [myGamesCount, setMyGamesCount] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [studiesCount, setStudiesCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [platformGames, importedGames, studies] = await Promise.all([
          getPlatformGames(),
          getImportedGames(),
          getStudies(),
        ]);
        setMyGamesCount(platformGames.length);
        setImportedCount(importedGames.length);
        setStudiesCount(studies.length);
      } catch {
        toast.error("Could not load dashboard");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalGames = myGamesCount + importedCount;

  const libraryStats = [
    { label: "My games", value: myGamesCount, icon: Swords },
    { label: "Imported games", value: importedCount, icon: BookMarked },
    { label: "Studies", value: studiesCount, icon: FolderKanban },
    { label: "Total games", value: totalGames, icon: Boxes },
  ];

  const quickActions = [
    {
      label: "Play vs Computer",
      description: "Start a new game against Stockfish",
      icon: Swords,
      onClick: () => navigate({ to: "/play" }),
    },
    {
      label: "Import game",
      description: "Bring in a PGN or FEN from elsewhere",
      icon: Upload,
      onClick: () => navigate({ to: "/import" }),
    },
    {
      label: "Open my games",
      description: "Review games played on VoxChess",
      icon: Swords,
      onClick: () => navigate({ to: "/games/my-games" }),
    },
    {
      label: "Open studies",
      description: "Browse your saved studies and chapters",
      icon: FolderKanban,
      onClick: () => navigate({ to: "/games/studies" }),
    },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Dashboard</h2>
          <p className="text-sm text-muted-foreground">Your VoxChess workspace at a glance.</p>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Library className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Library</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {libraryStats.map((s) => {
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
        </div>

        <div>
          <div className="text-sm font-medium mb-3">Quick actions</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Card
                  key={action.label}
                  className="p-5 cursor-pointer hover:border-border/80 transition-colors"
                  onClick={action.onClick}
                >
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-md bg-[var(--accent-blue)]/10 flex items-center justify-center shrink-0">
                      <Icon className="h-4.5 w-4.5 text-[var(--accent-blue)]" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{action.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{action.description}</div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}