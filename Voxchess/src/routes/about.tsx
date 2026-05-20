import { createFileRoute } from "@tanstack/react-router";
import { Mic, Navigation, Accessibility, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [{ title: "About — VoxChess" }] }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="min-h-screen bg-background bg-gradient-hero">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight">About VoxChess</h1>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            VoxChess is a voice-first chess platform built around a single problem — voice control
            in chess has always existed but never worked well enough to actually rely on. We're
            focused on fixing that.
          </p>
        </div>

        <div className="space-y-6 mb-12">
          <div>
            <h2 className="text-xl font-semibold mb-2">Mission</h2>
            <p className="text-muted-foreground leading-relaxed">
              To build a reliable, voice-first chess platform that makes chess gameplay more
              natural, accessible, and efficient. Rather than replacing platforms like Chess.com or
              Lichess, VoxChess focuses on solving one specific problem — improving the quality,
              consistency, and usability of voice-controlled chess interaction. The goal is to
              eliminate constant drag-and-drop piece movement and replace it with accurate, natural
              spoken commands.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">Why this exists</h2>
            <p className="text-muted-foreground leading-relaxed">
              Both Chess.com and Lichess offer voice features, but they are treated as optional
              add-ons rather than core experiences. Recognition is inconsistent, natural language is
              barely supported, and navigation remains mouse-dependent. VoxChess treats voice as the
              primary interaction system — not an afterthought.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-12">
          {[
            {
              icon: Mic,
              title: "Voice-first gameplay",
              body: "Make legal chess moves entirely through voice using natural spoken commands — not just strict algebraic notation.",
            },
            {
              icon: Navigation,
              title: "Voice site navigation",
              body: "Navigate the entire platform by voice. Go to saved games, open analysis, start a new game — all without touching the mouse.",
            },
            {
              icon: Accessibility,
              title: "Accessibility focus",
              body: "Designed to be genuinely useful for blind or visually impaired players who need hands-free, low-vision-compatible chess interaction.",
            },
            {
              icon: Target,
              title: "Accuracy over features",
              body: "The MVP is focused entirely on refining the voice command ecosystem before expanding into larger platform features.",
            },
          ].map((f) => {
            const Icon = f.icon;
            return (
              <Card key={f.title} className="p-5 bg-card/40 border-border/50">
                <Icon className="h-5 w-5 text-[var(--accent-blue)] mb-3" />
                <h3 className="font-semibold mb-1">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
              </Card>
            );
          })}
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">Vision</h2>
          <p className="text-muted-foreground leading-relaxed">
            This is an exploration into how voice technology can meaningfully improve digital chess
            experiences. The long-term goal is to build one of the most capable voice-based chess
            interaction systems available — evolving alongside real-world usage and player feedback.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
