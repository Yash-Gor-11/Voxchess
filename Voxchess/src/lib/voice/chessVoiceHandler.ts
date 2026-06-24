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
  let s = t.toLowerCase();

  // Replace spoken equivalents for chess pieces/letters/actions
  s = s.replace(/\bnight\b/g, "knight");
  s = s.replace(/\bsea\b/g, "c");
  s = s.replace(/\bsee\b/g, "c");
  s = s.replace(/\bbe\b/g, "b");
  s = s.replace(/\bbee\b/g, "b");
  s = s.replace(/\bgee\b/g, "g");
  s = s.replace(/\bcapture\b/g, "takes");
  s = s.replace(/\bcaptures\b/g, "takes");
  s = s.replace(/\bx\b/g, "takes");
  s = s.replace(/\bking\s*side\b/g, "kingside");
  s = s.replace(/\bqueen\s*side\b/g, "queenside");

  // Word-substitute numbers
  Object.entries(NUMS).forEach(([w, n]) => {
    s = s.replace(new RegExp(`\\b${w}\\b`, "g"), n);
  });

  // Standardize spaces and keep alphanumeric words
  s = s.replace(/[^a-z0-9 ]/g, " ");
  s = s.replace(/\s+/g, " ");
  return s.trim();
}

export function parseChessPhrase(transcript: string): string | null {
  let s = normalize(transcript);
  if (!s) return null;

  // 1. Check for promotion at the end of the phrase
  let promotion = "";
  const promoMatch = s.match(/\b(?:promote\s*to\s*)?(queen|rook|bishop|knight)$/);
  if (promoMatch) {
    const promoWord = promoMatch[1];
    const promoPieceMap: Record<string, string> = {
      queen: "Q",
      rook: "R",
      bishop: "B",
      knight: "N",
    };
    promotion = `=${promoPieceMap[promoWord]}`;
    // Strip promotion phrase from the end
    s = s.replace(/\b(?:promote\s*to\s*)?(?:queen|rook|bishop|knight)$/, "").trim();
  }

  // 2. Castling
  if (/^(short\s*)?castle$|^castles?$|^o\s*o$/.test(s)) return "O-O";
  if (/^long\s*castle$|^castle\s*queenside$|^o\s*o\s*o$/.test(s)) return "O-O-O";

  // 3. Pawn captures with a starting file specified (e.g. "e takes d5", "e pawn takes d5")
  const pawnCap = s.match(/^(?:pawn\s+)?([a-h])\s*(?:pawn)?\s*takes\s*([a-h])\s*([1-8])(\s*check)?$/);
  if (pawnCap) {
    const fromFile = pawnCap[1];
    const destFile = pawnCap[2];
    const destRank = pawnCap[3];
    const chk = pawnCap[4] ? "+" : "";
    return `${fromFile}x${destFile}${destRank}${chk}${promotion}`;
  }

  // 4. Piece moves with disambiguation:
  // Pattern A: "b knight to d2" or "b knight takes d2" or "1 rook to e4"
  const pieceDisA = s.match(/^([a-h]|[1-8])\s*(knight|bishop|rook|queen|king)\s*(to|takes)?\s*([a-h])\s*([1-8])(\s*check)?$/);
  if (pieceDisA) {
    const departure = pieceDisA[1];
    const piece = PIECE[pieceDisA[2]] ?? "";
    const cap = pieceDisA[3] === "takes" ? "x" : "";
    const dest = `${pieceDisA[4]}${pieceDisA[5]}`;
    const chk = pieceDisA[6] ? "+" : "";
    return `${piece}${departure}${cap}${dest}${chk}${promotion}`;
  }

  // Pattern B: "knight b to d2" or "knight from b to d2" or "rook 1 takes e4"
  const pieceDisB = s.match(/^(knight|bishop|rook|queen|king)\s*(?:from\s+)?([a-h]|[1-8])\s*(to|takes)?\s*([a-h])\s*([1-8])(\s*check)?$/);
  if (pieceDisB) {
    const piece = PIECE[pieceDisB[1]] ?? "";
    const departure = pieceDisB[2];
    const cap = pieceDisB[3] === "takes" ? "x" : "";
    const dest = `${pieceDisB[4]}${pieceDisB[5]}`;
    const chk = pieceDisB[6] ? "+" : "";
    return `${piece}${departure}${cap}${dest}${chk}${promotion}`;
  }

  // 5. Simple moves without disambiguation (e.g. "knight to f3", "e4", "queen takes d4")
  const simpleMove = s.match(/^(knight|bishop|rook|queen|king|pawn)?\s*(to|takes)?\s*([a-h])\s*([1-8])(\s*check)?$/);
  if (simpleMove) {
    const pieceWord = simpleMove[1] ?? "pawn";
    const piece = PIECE[pieceWord] ?? "";
    const cap = simpleMove[2] === "takes" ? "x" : "";
    const dest = `${simpleMove[3]}${simpleMove[4]}`;
    const chk = simpleMove[5] ? "+" : "";
    return `${piece}${cap}${dest}${chk}${promotion}`;
  }

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
