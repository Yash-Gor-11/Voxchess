import type { Chess } from "chess.js";
import { Chess as ChessClass } from "chess.js";
import type { MoveResult } from "@/types/chess";

// Mock parser: handles a handful of phrases. Real parser comes later.
const PIECE: Record<string, string> = {
  pawn: "",
  knight: "N",
  bishop: "B",
  rook: "R",
  queen: "Q",
  king: "K",
};
const NUMS: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
};

function normalize(t: string) {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseChessPhrase(transcript: string): string | null {
  const t = normalize(transcript);
  if (!t) return null;
  if (/^(short )?castle$|^castles?$|^o[\s-]?o$/.test(t)) return "O-O";
  if (/^long castle$|^castle queen ?side$|^o[\s-]?o[\s-]?o$/.test(t)) return "O-O-O";

  // Word-substitute numbers
  let s = t;
  Object.entries(NUMS).forEach(([w, n]) => {
    s = s.replace(new RegExp(`\\b${w}\\b`, "g"), n);
  });

  // Match: [piece] (to|takes) <file><rank> [check]
  const m = s.match(
    /^(pawn|knight|bishop|rook|queen|king)?\s*(to|takes|x)?\s*([a-h])\s*([1-8])(\s*check)?$/,
  );
  if (m) {
    const piece = PIECE[m[1] ?? "pawn"] ?? "";
    const cap = m[2] === "takes" || m[2] === "x" ? "x" : "";
    const dest = `${m[3]}${m[4]}`;
    const chk = m[5] ? "+" : "";
    return `${piece}${cap}${dest}${chk}`;
  }
  // Bare square: "e4"
  const sq = s.match(/^([a-h])\s*([1-8])$/);
  if (sq) return `${sq[1]}${sq[2]}`;
  return null;
}

export function applyChessVoice(game: Chess, transcript: string): MoveResult {
  const san = parseChessPhrase(transcript);
  if (!san) return { ok: false, message: `Couldn't parse "${transcript}"` };

  try {
    // Validate against a clone so we don't mutate the live game
    const tempGame = new ChessClass(game.fen());
    const move = tempGame.move(san);
    if (!move) return { ok: false, message: `Illegal move: ${san}` };

    // Return the validated SAN for the hook to apply via the proper state flow
    return { ok: true, san: move.san };
  } catch {
    return { ok: false, message: `Illegal move: ${san}` };
  }
}
