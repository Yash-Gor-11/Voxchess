import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function countMovesFromPgn(pgn: string): number {
  if (!pgn) return 0;
  const movesSection = pgn.split("]").pop() ?? "";
  const tokens = movesSection
    .trim()
    .split(/\s+/)
    .filter(
      (t) =>
        t.length > 0 &&
        !t.includes(".") &&
        !["*", "1-0", "0-1", "1/2-1/2"].includes(t) &&
        !/^[0-9]+$/.test(t),
    );
  return Math.ceil(tokens.length / 2);
}
