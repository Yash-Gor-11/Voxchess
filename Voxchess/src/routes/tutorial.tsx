import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Compass,
  MicOff,
  HelpCircle,
  ListChecks,
  ShieldQuestion,
  CheckCircle2,
  CircleAlert,
  CircleSlash,
  Search,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";

export const Route = createFileRoute("/tutorial")({
  head: () => ({
    meta: [
      { title: "Voice command guide — VoxChess" },
      {
        name: "description",
        content: "Every voice command VoxChess understands — moves, captures, promotions, castling, navigation, and commands.",
      },
      { property: "og:title", content: "Voice command guide — VoxChess" },
      {
        property: "og:description",
        content: "Speak naturally. VoxChess understands many equivalent ways of saying the same thing.",
      },
    ],
  }),
  component: TutorialPage,
});

// ── Small building blocks ───────────────────────────────────────────────────

function ExampleChip({ children }: { children: string }) {
  return (
    <code className="inline-flex items-center px-2.5 py-1 rounded-md bg-muted/60 border border-border/50 text-sm font-mono text-foreground/90">
      {children}
    </code>
  );
}

function ExampleGroup({ label, phrases }: { label?: string; phrases: string[] }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {phrases.map((p) => (
          <ExampleChip key={p}>{p}</ExampleChip>
        ))}
      </div>
    </div>
  );
}

function CommandSection({
  number,
  title,
  blurb,
  children,
}: {
  number: number;
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 grid place-items-center h-7 w-7 rounded-full bg-[var(--accent-chess)]/10 text-[var(--accent-chess)] text-xs font-semibold">
          {number}
        </div>
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          {blurb && <p className="text-sm text-muted-foreground mt-1">{blurb}</p>}
        </div>
      </div>
      <div className="pl-10 space-y-4">{children}</div>
    </Card>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-2.5 rounded-lg bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/30 text-xs text-[var(--accent-blue)] leading-relaxed">
      {children}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function TutorialPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <main className="mx-auto max-w-4xl px-6 py-16">
        {/* Introduction */}
        <h1 className="text-4xl font-bold tracking-tight">Voice command guide</h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Speak naturally — VoxChess understands many equivalent ways of saying the same move,
          and asks for clarification whenever it genuinely needs to instead of guessing.
        </p>

        {/* Browser support (moved up, right after the intro) */}
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Browser support</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Voice relies on your browser's built-in speech recognition. Drag-and-drop and
            click-to-move always work everywhere, regardless of voice support.
          </p>
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <Card className="p-4 flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium">Officially tested</div>
                <div className="text-xs text-muted-foreground mt-0.5">Chrome · Microsoft Edge</div>
              </div>
            </Card>
            <Card className="p-4 flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-[var(--accent-blue)] mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium">Expected to work</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Brave · Opera · Arc · Comet · Vivaldi · any other Chromium-based browser
                </div>
              </div>
            </Card>
            <Card className="p-4 flex items-start gap-3">
              <CircleAlert className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium">Limited support</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Safari — voice recognition support depends on Apple's Web Speech implementation
                  and may vary by version and platform.
                </div>
              </div>
            </Card>
            <Card className="p-4 flex items-start gap-3">
              <CircleSlash className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium">Not supported</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Firefox — currently lacks the Web Speech Recognition API required for browser
                  voice recognition.
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* Two voice modes */}
        <div className="mt-10 grid md:grid-cols-2 gap-4">
          <Card className="p-6 border-[var(--accent-chess)]/30 bg-[var(--accent-chess)]/5">
            <div className="flex items-center gap-3">
              <div className="grid place-items-center h-10 w-10 rounded-full bg-[var(--accent-chess)] text-white shrink-0">
                <MicOff className="h-4 w-4" />
              </div>
              <div>
                <div className="font-semibold">Chess button</div>
                <div className="text-xs text-muted-foreground">
                  Press <span className="font-mono">Space</span> · play chess by voice
                </div>
              </div>
            </div>
          </Card>
          <Card className="p-6 border-[var(--accent-blue)]/30 bg-[var(--accent-blue)]/5">
            <div className="flex items-center gap-3">
              <div className="grid place-items-center h-10 w-10 rounded-full bg-[var(--accent-blue)] text-white shrink-0">
                <Compass className="h-4 w-4" />
              </div>
              <div>
                <div className="font-semibold">Navigation button</div>
                <div className="text-xs text-muted-foreground">
                  Press <span className="font-mono">N</span> · navigate the application by voice
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Chess commands */}
        <div className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">Chess voice commands</h2>

          <CommandSection
            number={1}
            title="Pawn moves"
            blurb='Say just the destination, or spell out the piece and origin — every form below means the same move.'
          >
            <ExampleGroup label="Minimal" phrases={["e4"]} />
            <ExampleGroup
              label="Explicit pawn"
              phrases={["pawn e4", "pawn to e4", "pawn to e four", "move pawn to e4", "move pawn to e four"]}
            />
            <ExampleGroup
              label="Source + destination"
              phrases={["pawn e2 e4", "pawn e2 to e4", "pawn from e2 to e4", "move pawn from e2 to e4"]}
            />
          </CommandSection>

          <CommandSection number={2} title="Piece moves" blurb="Works the same way for every piece.">
            <ExampleGroup label="Destination only" phrases={["knight f3", "bishop g5", "rook d1", "queen h5", "king e2"]} />
            <ExampleGroup label='With "to"' phrases={["knight to f3", "bishop to g5", "move knight to f3", "move bishop to g5"]} />
            <ExampleGroup label="Source + destination" phrases={["knight g1 f3", "knight g1 to f3"]} />
            <ExampleGroup
              label='Source, with "from"'
              phrases={["knight from g1 to f3", "bishop from c1 to g5", "rook from a1 to d1"]}
            />
          </CommandSection>

          <CommandSection
            number={3}
            title="Captures"
            blurb='Name the source square whenever it helps disambiguate which piece you mean. "Takes" and "captures" are interchangeable.'
          >
            <ExampleGroup label="Destination only" phrases={["takes e5", "capture e5", "captures e5"]} />
            <ExampleGroup
              label="Piece capture"
              phrases={["knight takes e5", "bishop captures c4", "rook takes d7", "queen captures h7", "pawn takes d5"]}
            />
            <ExampleGroup
              label="Source + capture"
              phrases={["knight g4 takes e5", "bishop c2 captures f5", "rook a1 takes a8", "pawn g7 takes h8", "knight g4 capture e5"]}
            />
          </CommandSection>

          <CommandSection number={4} title="Promotions">
            <ExampleGroup label="Quiet promotion" phrases={["e8 queen", "e8 rook", "e8 bishop", "e8 knight"]} />
            <ExampleGroup
              label="With pawn / to / promote to"
              phrases={["pawn e8 queen", "pawn to e8 queen", "pawn e7 e8 queen", "pawn e7 to e8 queen", "pawn from e7 to e8 queen", "pawn e7 e8 promote to queen"]}
            />
            <ExampleGroup
              label="Capture promotion"
              phrases={["pawn takes h8 queen", "pawn captures h8 queen", "gxh8 queen"]}
            />
            <ExampleGroup
              label="Source + capture promotion"
              phrases={["pawn g7 takes h8 queen", "pawn g7 captures h8 queen", "pawn g7 takes h8 promote to queen", "pawn from g7 to h8 queen"]}
            />
            <Callout>
              Works the same for rook, bishop, and knight promotions too. Didn't say a piece?
              Saying just <ExampleChip>h8</ExampleChip> or <ExampleChip>takes h8</ExampleChip>{" "}
              works — VoxChess will ask which piece you want to promote to.
            </Callout>
          </CommandSection>

          <CommandSection number={5} title="Castling">
            <ExampleGroup
              label="Natural language"
              phrases={["castle", "castle kingside", "castle king side", "king side castle", "short castle"]}
            />
            <ExampleGroup
              label="Queenside"
              phrases={["castle queenside", "castle queen side", "queen side castle", "long castle"]}
            />
            <ExampleGroup label="Notation" phrases={["O-O", "O-O-O", "0-0", "0-0-0"]} />
            <Callout>
              Just saying <ExampleChip>castle</ExampleChip> works even without a direction — if
              only one side is legal, VoxChess castles that way immediately; if both are legal,
              it asks which one the same way it asks about any other ambiguous move.
            </Callout>
          </CommandSection>

          <CommandSection number={6} title="Commands">
            <ExampleGroup label="Undo" phrases={["undo", "take back", "takeback", "undo move", "undo last move"]} />
            <ExampleGroup label="Draw" phrases={["draw", "offer draw", "offer a draw", "propose draw", "propose a draw"]} />
            <ExampleGroup label="Resign" phrases={["resign", "i resign", "resign game"]} />
            <ExampleGroup label="Board" phrases={["flip", "flip board"]} />
            <ExampleGroup label="Engine" phrases={["hint", "give me a hint"]} />
          </CommandSection>
        </div>

        {/* Navigation mode */}
        <div className="mt-10">
          <h2 className="text-xl font-semibold">Navigation voice commands</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Press the Navigation button (or <span className="font-mono">N</span>) from anywhere
            in the app to jump straight to a page by voice.
          </p>
          <Card className="p-6 mt-4 space-y-4">
            <ExampleGroup label="Dashboard" phrases={["dashboard", "go to dashboard"]} />
            <ExampleGroup label="Play" phrases={["play", "go to play"]} />
            <ExampleGroup label="My Games" phrases={["my games"]} />
            <ExampleGroup label="Imported Games" phrases={["imported games"]} />
            <ExampleGroup label="Studies" phrases={["studies"]} />
            <ExampleGroup label="Profile" phrases={["profile"]} />
            <ExampleGroup label="Settings" phrases={["settings"]} />
          </Card>
        </div>

        {/* Voice replies */}
        <div className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">Voice replies</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Sometimes VoxChess needs a follow-up answer before it can act. There are only two
            kinds of reply it ever listens for.
          </p>

          <Card className="p-6 space-y-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0 grid place-items-center h-9 w-9 rounded-full bg-muted text-muted-foreground">
                <ListChecks className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold">Multiple choice</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  If what you said could mean more than one legal move — two knights that can
                  both reach the same square, for example — VoxChess lists the options and waits
                  for your reply. Promotion piece selection and ambiguous castling direction both
                  work exactly the same way.
                </p>
              </div>
            </div>
            <div className="pl-12">
              <ExampleGroup label="Reply with" phrases={["1", "2", "3", "4"]} />
              <p className="text-xs text-muted-foreground mt-2">
                If you don't reply in time, VoxChess automatically plays its top choice — unless
                you've turned that off in Settings.
              </p>
            </div>
          </Card>

          <Card className="p-6 space-y-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0 grid place-items-center h-9 w-9 rounded-full bg-destructive/10 text-destructive">
                <ShieldQuestion className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold">Confirmation</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Resign and offer draw always ask you to confirm first, so a mishear can never
                  end your game by accident. Unlike an ambiguous move, staying silent here always
                  cancels — it never resigns or offers a draw on your behalf.
                </p>
              </div>
            </div>
            <div className="pl-12">
              <ExampleGroup label="Reply with" phrases={["yes", "no"]} />
            </div>
          </Card>
        </div>

        {/* FAQ */}
        <section className="mt-12">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold">FAQ</h2>
          </div>
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <div className="font-medium flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                Do I need to memorize every command?
              </div>
              <p className="text-muted-foreground mt-1">
                No — the examples on this page are representative, not exhaustive. VoxChess
                understands many equivalent natural-language variations, so there's no single
                exact wording you have to get right.
              </p>
            </div>
            <div>
              <div className="font-medium">What if VoxChess misunderstands me?</div>
              <p className="text-muted-foreground mt-1">
                A toast tells you what went wrong. Just try again — nothing is applied to the
                board until VoxChess is confident it understood you correctly.
              </p>
            </div>
            <div>
              <div className="font-medium">Can I mix mouse and voice?</div>
              <p className="text-muted-foreground mt-1">
                Yes — drag-and-drop, click-to-move, and voice all work side by side, any time.
              </p>
            </div>
            <div>
              <div className="font-medium">What happens if multiple moves match?</div>
              <p className="text-muted-foreground mt-1">
                VoxChess lists the options and waits for a numbered reply — see "Voice replies"
                above.
              </p>
            </div>
            <div>
              <div className="font-medium flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                Which browsers work best?
              </div>
              <p className="text-muted-foreground mt-1">
                Chrome and Microsoft Edge are officially tested. See "Browser support" above for
                the full picture.
              </p>
            </div>
            <div>
              <div className="font-medium">Can I customize voice behavior?</div>
              <p className="text-muted-foreground mt-1">
                Yes — head to{" "}
                <Link to="/settings" className="text-[var(--accent-blue)] hover:underline">
                  Settings
                </Link>{" "}
                to adjust recognition mode (how forgiving VoxChess is about phrasing) and the
                confirmation timeout (how long it waits before auto-picking on an ambiguous move).
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
