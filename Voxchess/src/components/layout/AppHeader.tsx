import { useLocation } from "@tanstack/react-router";
import { LogOut, Menu, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { NavVoiceButton } from "@/components/voice/NavVoiceButton";
import { ChessVoiceButton } from "@/components/voice/ChessVoiceButton";
import { useVoiceStore } from "@/stores/voiceStore";
import { supabase } from "@/integrations/supabase/client";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/play": "Play",
  "/play/pvp": "PvP",
  "/saved-games": "Saved games",
  "/settings": "Settings",
  "/profile": "Profile",
};

interface AppHeaderProps {
  email?: string;
  /** Called when the hamburger is tapped — opens the mobile nav sheet. */
  onMenuClick: () => void;
}

export function AppHeader({ email, onMenuClick }: AppHeaderProps) {
  const loc = useLocation();
  const isAnalysisPage = loc.pathname.startsWith("/analysis");
  const { activeMode, activateChessCallback } = useVoiceStore();
  const isVoiceActive = activeMode === "chess";

  const title = TITLES[loc.pathname] ?? (isAnalysisPage ? "Analysis" : "VoxChess");

  return (
    <header className="h-16 border-b border-border/40 bg-background/70 backdrop-blur flex items-center justify-between px-4 md:px-6">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only; desktop sidebar is always visible */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onMenuClick}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-base font-semibold tracking-tight">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Chess voice button — analysis page, mobile only (sidebar handles desktop) */}
        {isAnalysisPage && (
          <div className="md:hidden">
            <ChessVoiceButton
              onActivate={activateChessCallback ?? (() => {})}
              isActive={isVoiceActive}
              enabled={!!activateChessCallback}
              size="sm"
            />
          </div>
        )}

        <NavVoiceButton size="sm" />
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-ring">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">{email}</div>
            <DropdownMenuItem
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/";
              }}
            >
              <LogOut className="h-4 w-4 mr-2" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}