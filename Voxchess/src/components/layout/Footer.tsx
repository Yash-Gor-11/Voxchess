import { Link } from "@tanstack/react-router";

export function Footer() {
  return (
    <footer className="border-t border-border/40 mt-24">
      <div className="mx-auto max-w-6xl px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <div>© {new Date().getFullYear()} VoxChess</div>
        <div className="flex gap-6">
          <Link to="/tutorial" className="hover:text-foreground">Tutorial</Link>
          <Link to="/about" className="hover:text-foreground">About</Link>
          <Link to="/auth/login" className="hover:text-foreground">Log in</Link>
        </div>
      </div>
    </footer>
  );
}