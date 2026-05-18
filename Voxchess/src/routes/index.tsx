import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Mic, Check, Compass, Lock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";
import { voiceCommandExamples } from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background bg-gradient-hero">
      <MarketingNav />
      <main>
        <section className="mx-auto max-w-6xl px-6 pt-20 pb-24 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <Badge variant="outline" className="mb-5">Voice-first chess, reimagined</Badge>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.05]">
              Play chess with{" "}
              <em className="not-italic text-gradient">your voice.</em>
            </h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-md">
              Two buttons. One mic. Move pieces and navigate the entire app without lifting a finger.
            </p>
            <div className="mt-8 flex gap-3">
              <Button asChild size="lg" className="bg-[var(--accent-blue)] hover:opacity-90 text-white">
                <Link to="/auth/signup">Get started</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/tutorial">See how it works</Link>
              </Button>
            </div>
          </div>
          <Card className="p-6 bg-card/60 backdrop-blur border-border/50 shadow-glow-blue">
            <div className="flex flex-col items-center gap-5 py-6">
              <div className="grid place-items-center h-20 w-20 rounded-full bg-[var(--accent-blue)] text-white animate-mic-blue">
                <Mic className="h-8 w-8" />
              </div>
              <div className="font-mono text-sm text-muted-foreground">You said: <span className="text-foreground">“Knight to f3”</span></div>
              <div className="flex items-center gap-2 text-sm font-mono text-emerald-500">
                <Check className="h-4 w-4" /> Move played: Nf3
              </div>
            </div>
          </Card>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16 grid md:grid-cols-4 gap-4">
          {[
            { icon: Mic, title: "Natural voice", body: "Speak moves naturally — “knight to f3” or “castle”." },
            { icon: Compass, title: "2-button input", body: "One key for navigation, one for chess. That’s it." },
            { icon: Lock, title: "Privacy-first", body: "Recognition runs in your browser. No audio leaves." },
            { icon: Zap, title: "Lightning fast", body: "Instant response. No round-trip to the cloud." },
          ].map((f) => {
            const Icon = f.icon;
            return (
              <Card key={f.title} className="p-5 bg-card/40 border-border/50">
                <Icon className="h-5 w-5 text-[var(--accent-blue)]" />
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
              </Card>
            );
          })}
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Speak naturally. We understand.</h2>
            <p className="mt-3 text-muted-foreground">
              VoxChess maps everyday phrasing onto SAN notation — “bishop takes d5”, “castle”, “queen to h five”.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {voiceCommandExamples.chess.map((c) => (
              <Card key={c.phrase} className="p-3 bg-card/50 border-border/50">
                <div className="text-xs text-muted-foreground">“{c.phrase}”</div>
                <div className="font-mono text-sm mt-1">{c.san}</div>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16">
          <Card className="p-10 bg-gradient-cta text-white text-center border-0">
            <h2 className="text-3xl font-bold">Ready to play?</h2>
            <p className="mt-2 text-white/80">Create an account and play your first voice game in 30 seconds.</p>
            <div className="mt-6 flex justify-center gap-3">
              <Button asChild size="lg" variant="secondary">
                <Link to="/auth/signup">Create account</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="bg-transparent text-white border-white/40 hover:bg-white/10">
                <Link to="/tutorial">Voice guide</Link>
              </Button>
            </div>
          </Card>
        </section>
      </main>
      <Footer />
    </div>
  );
}
