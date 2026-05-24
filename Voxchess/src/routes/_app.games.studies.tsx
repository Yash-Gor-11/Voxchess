import { createFileRoute, Outlet, useNavigate, useMatchRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, ChevronRight, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getStudies, deleteStudy } from "@/lib/supabase/games";
import type { Study } from "@/lib/supabase/games";

export const Route = createFileRoute("/_app/games/studies")({
  head: () => ({ meta: [{ title: "Studies — VoxChess" }] }),
  component: StudiesLayout,
});

function StudiesLayout() {
  const matchRoute = useMatchRoute();
  const isIndex = matchRoute({ to: "/games/studies", fuzzy: false });
  if (!isIndex) {
    return <Outlet />;
  }
  return <StudiesPage />;
}

function StudiesPage() {
  const navigate = useNavigate();
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setStudies(await getStudies());
      } catch {
        toast.error("Could not load studies");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await deleteStudy(id);
      setStudies((prev) => prev.filter((s) => s.id !== id));
      toast.success("Study deleted");
    } catch {
      toast.error("Could not delete study");
    }
  }

  return (
    
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/games" })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">Studies</h2>
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading…" : `${studies.length} ${studies.length === 1 ? "study" : "studies"}`}
          </p>
        </div>
        <Button size="sm" className="ml-auto" onClick={() => navigate({ to: "/import" })}>
          Import
        </Button>
      </div>

      {!loading && studies.length === 0 && (
        <Card className="p-10 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No studies yet.</p>
          <Button size="sm" className="mt-4" onClick={() => navigate({ to: "/import" })}>
            Import a study
          </Button>
        </Card>
      )}

      <div className="space-y-2">
        {studies.map((study, i) => (
          <Card
            key={study.id}
            className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-muted/40 transition-colors group"
            onClick={() =>
              navigate({ to: "/games/studies/$studyId", params: { studyId: study.id } })
            }
          >
            <div className="flex-shrink-0 w-7 text-xs font-mono text-muted-foreground text-right">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{study.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {study.chapterCount ?? 0}{" "}
                {(study.chapterCount ?? 0) === 1 ? "chapter" : "chapters"}
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              onClick={(e) => handleDelete(study.id, e)}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </Card>
        ))}
      </div>
    </div>
  );
}