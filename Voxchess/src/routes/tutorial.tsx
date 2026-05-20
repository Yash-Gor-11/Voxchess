import { createFileRoute } from "@tanstack/react-router";
import { Compass, MicOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";
import {
  tutorialChessMoves,
  tutorialNavCommands,
  tutorialAnalysisCommands,
  tutorialPvpCommands,
} from "@/lib/mock-data";

export const Route = createFileRoute("/tutorial")({
  head: () => ({
    meta: [
      { title: "Voice command guide — VoxChess" },
      { name: "description", content: "Every voice command supported by VoxChess." },
      { property: "og:title", content: "Voice command guide — VoxChess" },
      {
        property: "og:description",
        content: "Chess moves, navigation, analysis, PvP — all by voice.",
      },
    ],
  }),
  component: TutorialPage,
});

function CommandTable({
  rows,
}: {
  rows: Array<{ phrase: string; san?: string; action?: string; note?: string }>;
}) {
  return (
    <div className="rounded-md border border-border/50 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-muted-foreground text-xs">
          <tr>
            <th className="text-left px-4 py-2">Phrase</th>
            <th className="text-left px-4 py-2">Output</th>
            <th className="text-left px-4 py-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.phrase} className="border-t border-border/40">
              <td className="px-4 py-2">“{r.phrase}”</td>
              <td className="px-4 py-2 font-mono">{r.san ?? r.action}</td>
              <td className="px-4 py-2 text-muted-foreground">{r.note ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TutorialPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-4xl font-bold tracking-tight">Voice command reference</h1>
        <p className="mt-3 text-muted-foreground">Two buttons. Everything by voice.</p>

        <div className="mt-8 grid md:grid-cols-2 gap-4">
          <Card className="p-6 border-[var(--accent-blue)]/30 bg-[var(--accent-blue)]/5">
            <div className="flex items-center gap-3">
              <div className="grid place-items-center h-10 w-10 rounded-full bg-[var(--accent-blue)] text-white">
                <Compass className="h-4 w-4" />
              </div>
              <div>
                <div className="font-semibold">Nav button</div>
                <div className="text-xs text-muted-foreground">
                  Press <span className="font-mono">N</span> · navigate the site by voice
                </div>
              </div>
            </div>
          </Card>
          <Card className="p-6 border-[var(--accent-chess)]/30 bg-[var(--accent-chess)]/5">
            <div className="flex items-center gap-3">
              <div className="grid place-items-center h-10 w-10 rounded-full bg-[var(--accent-chess)] text-white">
                <MicOff className="h-4 w-4" />
              </div>
              <div>
                <div className="font-semibold">Chess button</div>
                <div className="text-xs text-muted-foreground">
                  Press <span className="font-mono">Space</span> · make moves by voice
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Tabs defaultValue="chess" className="mt-10">
          <TabsList>
            <TabsTrigger value="chess">Chess moves</TabsTrigger>
            <TabsTrigger value="nav">Navigation</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
            <TabsTrigger value="pvp">PvP</TabsTrigger>
          </TabsList>
          <TabsContent value="chess" className="mt-4">
            <CommandTable rows={tutorialChessMoves} />
          </TabsContent>
          <TabsContent value="nav" className="mt-4">
            <CommandTable rows={tutorialNavCommands} />
          </TabsContent>
          <TabsContent value="analysis" className="mt-4">
            <CommandTable rows={tutorialAnalysisCommands} />
          </TabsContent>
          <TabsContent value="pvp" className="mt-4">
            <CommandTable rows={tutorialPvpCommands} />
          </TabsContent>
        </Tabs>

        <section className="mt-12">
          <h2 className="text-xl font-semibold">FAQ</h2>
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <div className="font-medium">Which browsers support voice?</div>
              <p className="text-muted-foreground mt-1">
                Chrome ✓ · Edge ✓ · Safari (partial) · Firefox ✗ — drag-and-drop always works.
              </p>
            </div>
            <div>
              <div className="font-medium">What if I’m misheard?</div>
              <p className="text-muted-foreground mt-1">
                A red flash plus a toast tells you. Try again or use the mouse.
              </p>
            </div>
            <div>
              <div className="font-medium">Mouse and voice together?</div>
              <p className="text-muted-foreground mt-1">
                Yes — drag-and-drop and voice work side by side.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="mt-6">
            Chrome ✓ · Edge ✓ · Safari ◐ · Firefox ✗
          </Badge>
        </section>
      </main>
      <Footer />
    </div>
  );
}
