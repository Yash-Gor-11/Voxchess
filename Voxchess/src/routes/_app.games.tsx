import { createFileRoute, Outlet, useNavigate, useMatchRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Swords, FolderOpen, BookOpen, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getPlatformGames, getImportedGames, getStudies } from "@/lib/supabase/games";

export const Route = createFileRoute("/_app/games")({
  head: () => ({ meta: [{ title: "Games — VoxChess" }] }),
  component: GamesLayout,
});

interface FolderCounts {
  platform: number;
  imported: number;
  studies: number;
}

const folders = [
  {
    key: "platform" as const,
    label: "My Games",
    description: "Games you've played on VoxChess",
    icon: Swords,
    index: 1,
    to: "/games/my-games" as const,
  },
  {
    key: "imported" as const,
    label: "Imported Games",
    description: "Single PGN imports and saved positions",
    icon: FolderOpen,
    index: 2,
    to: "/games/imported" as const,
  },
  {
    key: "studies" as const,
    label: "Studies",
    description: "Multi-game PGN imports and Lichess studies",
    icon: BookOpen,
    index: 3,
    to: "/games/studies" as const,
  },
];

// Layout component — shows folder cards at /games, child pages via Outlet
// when on /games/my-games, /games/imported, /games/studies etc.
function GamesLayout() {
  const matchRoute = useMatchRoute();
  const isIndex = matchRoute({ to: "/games", fuzzy: false });

  if (!isIndex) {
    return <Outlet />;
  }

  return <GamesPage />;
}

function GamesPage() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<FolderCounts>({ platform: 0, imported: 0, studies: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [platform, imported, studies] = await Promise.all([
          getPlatformGames(),
          getImportedGames(),
          getStudies(),
        ]);
        setCounts({
          platform: platform.length,
          imported: imported.length,
          studies: studies.length,
        });
      } catch  {
        // counts stay 0 — non-critical
        
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function countLabel(key: keyof FolderCounts): string {
    if (loading) return "—";
    const n = counts[key];
    if (key === "studies") return `${n} ${n === 1 ? "study" : "studies"}`;
    return `${n} ${n === 1 ? "game" : "games"}`;
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">Games</h2>
        <p className="text-sm text-muted-foreground">Choose a folder to browse your games</p>
      </div>

      <div className="space-y-3">
        {folders.map((folder) => {
          const Icon = folder.icon;
          return (
            <Card
              key={folder.key}
              className="flex items-center gap-4 p-5 cursor-pointer hover:bg-muted/40 transition-colors group"
              onClick={() => navigate({ to: folder.to })}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate({ to: folder.to });
                }
              }}
              aria-label={`${folder.index}. ${folder.label}`}
            >
              {/* Index badge */}
              <div className="flex-shrink-0 w-7 h-7 rounded-md bg-muted flex items-center justify-center text-xs font-mono font-semibold text-muted-foreground group-hover:bg-[var(--accent-blue)]/10 group-hover:text-[var(--accent-blue)] transition-colors">
                {folder.index}
              </div>

              {/* Icon */}
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--accent-blue)]/10 flex items-center justify-center">
                <Icon className="h-5 w-5 text-[var(--accent-blue)]" />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{folder.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{folder.description}</div>
              </div>

              {/* Count + chevron */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {countLabel(folder.key)}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Tip: voice users can say "open 1", "open 2", or "open 3"
      </p>
    </div>
  );
}