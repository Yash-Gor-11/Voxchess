import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Swords, BookmarkCheck, Settings, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { ChessVoiceButton } from "@/components/voice/ChessVoiceButton";
import { TranscriptDisplay } from "@/components/voice/TranscriptDisplay";
import { useVoiceStore } from "@/stores/voiceStore";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LogOut } from "lucide-react";

const items = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/play", label: "Play", icon: Swords },
  { to: "/saved-games", label: "Saved games", icon: BookmarkCheck },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/profile", label: "Profile", icon: User },
];

// Shared nav link list used by both desktop sidebar and mobile sheet.
function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const loc = useLocation();
  return (
    <>
      {items.map((it) => {
        const Icon = it.icon;
        const active = loc.pathname.startsWith(it.to);
        return (
          <Link
            key={it.to}
            to={it.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            <Icon className="h-4 w-4" />
            {it.label}
          </Link>
        );
      })}
    </>
  );
}

interface AppSidebarProps {
  email?: string;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
}

export function AppSidebar({ email, mobileNavOpen, setMobileNavOpen }: AppSidebarProps) {
  const loc = useLocation();
  const isAnalysisPage = loc.pathname.startsWith("/analysis");
  const { activeMode, activateChessCallback } = useVoiceStore();
  const isVoiceActive = activeMode === "chess";

  const voiceSection = isAnalysisPage && (
    <div className="border-t border-border/40 p-4 text-center space-y-2">
      <div className="text-xs text-muted-foreground uppercase tracking-wider">Voice navigation</div>
      <ChessVoiceButton
        onActivate={activateChessCallback ?? (() => {})}
        isActive={isVoiceActive}
        enabled={!!activateChessCallback}
      />
      <div className="text-[10px] text-muted-foreground leading-relaxed">
        Space · "next" · "previous"
        <br />
        "go to move 5" · "main line"
      </div>
      <TranscriptDisplay mode="chess" />
    </div>
  );

  return (
    <>
      {/* ── Desktop sidebar ── always visible on md+ ── */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-border/40 bg-card/40">
        <div className="px-5 py-5">
          <Logo />
        </div>
        <nav className="flex-1 px-3 space-y-1">
          <NavItems />
        </nav>
        {voiceSection}
        <div className="border-t border-border/40 p-4 text-xs text-muted-foreground">
          <div className="truncate">{email ?? "Signed in"}</div>
        </div>
      </aside>

      {/* ── Mobile nav sheet ── slides in from the left ── */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="w-72 p-0 flex flex-col bg-card/95 backdrop-blur"
          // Hide the default SheetContent close button — we provide our own
          // so the layout matches the desktop sidebar header area.
        >
          {/* Header row */}
          <div className="flex items-center justify-between px-5 py-5 border-b border-border/40">
            <Logo />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Nav links — close sheet on navigate */}
          <nav className="flex-1 px-3 pt-3 space-y-1 overflow-y-auto">
            <NavItems onNavigate={() => setMobileNavOpen(false)} />
          </nav>

          {/* Voice section (analysis page only) */}
          {voiceSection}

          {/* Footer — email + sign out */}
          <div className="border-t border-border/40 p-4 flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground truncate">{email ?? "Signed in"}</div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/";
              }}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
