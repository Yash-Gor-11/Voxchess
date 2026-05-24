import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { parseSinglePgn } from "@/lib/chess/pgnImport";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function countMovesFromPgn(pgn: string): number {
  if (!pgn) return 0;
  try {
    return Math.ceil((parseSinglePgn(pgn)?.moves.length ?? 0) / 2);
  } catch {
    return 0;
  }
}
