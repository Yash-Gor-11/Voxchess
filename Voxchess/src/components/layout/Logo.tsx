import { Link } from "@tanstack/react-router";

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2 group">
      <span
        className="grid place-items-center rounded-md bg-[var(--brand)] text-white font-bold"
        style={{ width: small ? 24 : 28, height: small ? 24 : 28, fontSize: small ? 13 : 15 }}
        aria-hidden
      >
        ♞
      </span>
      <span className="font-semibold tracking-tight text-[var(--brand)] dark:text-foreground">
        Vox<span className="text-[var(--accent-blue)]">Chess</span>
      </span>
    </Link>
  );
}
