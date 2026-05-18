import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/70 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <Link to="/tutorial" className="hover:text-foreground transition-colors">Tutorial</Link>
          <Link to="/about" className="hover:text-foreground transition-colors">About</Link>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" asChild size="sm">
            <Link to="/auth/login">Log in</Link>
          </Button>
          <Button asChild size="sm" className="bg-[var(--accent-blue)] hover:opacity-90 text-white">
            <Link to="/auth/signup">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}