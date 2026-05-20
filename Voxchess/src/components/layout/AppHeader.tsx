import { useLocation } from "@tanstack/react-router";
import { LogOut, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "./ThemeToggle";
import { NavVoiceButton } from "@/components/voice/NavVoiceButton";
import { supabase } from "@/integrations/supabase/client";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/play": "Play",
  "/play/pvp": "PvP",
  "/saved-games": "Saved games",
  "/settings": "Settings",
  "/profile": "Profile",
};

export function AppHeader({ email }: { email?: string }) {
  const loc = useLocation();
  const title =
    TITLES[loc.pathname] ?? (loc.pathname.startsWith("/analysis") ? "Analysis" : "VoxChess");

  return (
    <header className="h-16 border-b border-border/40 bg-background/70 backdrop-blur flex items-center justify-between px-6">
      <h1 className="text-base font-semibold tracking-tight">{title}</h1>
      <div className="flex items-center gap-3">
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
