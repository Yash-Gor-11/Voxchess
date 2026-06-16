import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Trash2, LineChart, FolderOpen, ArrowLeft,
  MapPin, ClipboardList, MoreHorizontal,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getImportedGames, deleteGame } from "@/lib/supabase/games";
import type { Game } from "@/lib/supabase/games";
import { countMovesFromPgn } from "@/lib/utils";
import { MenuItem, MenuSeparator } from "@/components/chess/MenuItems";

export const Route = createFileRoute("/_app/games/imported")({
  head: () => ({ meta: [{ title: "Imported Games — VoxChess" }] }),
  component: ImportedGamesPage,
});

function resultVariant(
  result: string | null,
): "default" | "destructive" | "secondary" {
  if (result === "white") return "default";
  if (result === "black") return "destructive";
  return "secondary";
}

function ImportedGamesPage() {
  const navigate = useNavigate();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Close menu on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    if (openMenuId) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [openMenuId]);

  async function handleDelete(id: string) {
    try {
      await deleteGame(id);
      setGames((prev) => prev.filter((g) => g.id !== id));
      setOpenMenuId(null);
      toast.success("Deleted");
    } catch {
      toast.error("Could not delete");
    }
  }

  const isPosition = (g: Game) => !!g.fen && !g.pgn;

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
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
          <Button size="sm" onClick={() => navigate({ to: "/import" })}>
            Import
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {!loading && games.length === 0 && (
        <Card className="p-10 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No imported games yet.
          </p>
          <Button
            size="sm"
            className="mt-4"
            onClick={() => navigate({ to: "/import" })}
          >
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
            : [
              `${countMovesFromPgn(g.pgn)} moves`,
              g.metadata?.Event,
              g.metadata?.Date,
            ]
              .filter(Boolean)
              .join(" · ");

          const isMenuOpen = openMenuId === g.id;

          return (
            <Card key={g.id} className="flex items-center gap-4 px-5 py-4">
              {/* Index */}
              <div className="flex-shrink-0 w-7 text-xs font-mono
                              text-muted-foreground text-right">
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

              {/* Result badge — PGN games only */}
              {!pos && g.result && g.result !== "ongoing" && (
                <Badge
                  variant={resultVariant(g.result)}
                  className="flex-shrink-0"
                >
                  {g.result === "white"
                    ? "1–0"
                    : g.result === "black"
                      ? "0–1"
                      : "½–½"}
                </Badge>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Primary: Review for PGN, Analyse for FEN */}
                {pos ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setOpenMenuId(null);
                      navigate({ to: "/analysis/$gameId", params: { gameId: g.id } });
                    }}
                  >
                    <LineChart className="h-3.5 w-3.5 mr-1.5" />
                    Analyse
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setOpenMenuId(null);
                      navigate({ to: "/review/$gameId", params: { gameId: g.id } });
                    }}
                  >
                    <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
                    Review
                  </Button>
                )}

                {/* ... overflow menu */}
                <div className="relative" ref={isMenuOpen ? menuRef : null}>
                  <button
                    onClick={() =>
                      setOpenMenuId(isMenuOpen ? null : g.id)
                    }
                    className="inline-flex items-center justify-center
                               h-8 w-8 rounded-md border border-input
                               bg-background hover:bg-accent transition-colors"
                    aria-label="More options"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>

                  {isMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 w-44
                                    bg-card border border-border rounded-md
                                    shadow-lg py-1 z-50">
                      {/* Analyse goes in menu for PGN games */}
                      {!pos && (
                        <>
                          <MenuItem
                            label="Analyse"
                            icon={LineChart}
                            onClick={() => {
                              navigate({
                                to: "/analysis/$gameId",
                                params: { gameId: g.id },
                              });
                              setOpenMenuId(null);
                            }}
                          />
                          <MenuSeparator />
                        </>
                      )}
                      <MenuItem
                        label="Delete"
                        icon={Trash2}
                        destructive
                        onClick={() => handleDelete(g.id)}
                      />
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}