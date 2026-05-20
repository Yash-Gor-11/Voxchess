import { Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, Swords, BookmarkCheck, LineChart, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";

const items = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/play", label: "Play", icon: Swords },
  { to: "/saved-games", label: "Saved games", icon: BookmarkCheck },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/profile", label: "Profile", icon: User },
];

export function AppSidebar({ email }: { email?: string }) {
  const loc = useLocation();
  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-border/40 bg-card/40">
      <div className="px-5 py-5">
        <Logo />
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {items.map((it) => {
          const Icon = it.icon;
          const active = loc.pathname.startsWith(it.to);
          return (
            <Link
              key={it.to}
              to={it.to}
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
      </nav>
      <div className="border-t border-border/40 p-4 text-xs text-muted-foreground">
        <div className="truncate">{email ?? "Signed in"}</div>
      </div>
    </aside>
  );
}
