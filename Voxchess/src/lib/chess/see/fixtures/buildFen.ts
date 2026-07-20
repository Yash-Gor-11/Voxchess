// Test-only helper for constructing FEN positions from explicit piece
// placements. Not part of the public see.ts API — this exists purely so
// fixture positions can be built declaratively instead of hand-typed as
// raw FEN strings, which are easy to get subtly wrong (accidental
// check-on-the-side-not-to-move, kings aligned with a slider by
// coincidence, etc).

import { Chess, type PieceSymbol, type Color, type Square } from "chess.js";

type PiecePlacement = readonly [type: PieceSymbol, color: Color];

export interface PositionSpec {
  turn: "w" | "b";
  pieces: Record<string, PiecePlacement>;
  whiteKing?: Square;
  blackKing?: Square;
  /** En passant target square, if the fixture specifically needs one. */
  epSquare?: string;
}

function fileRankOf(square: string): [number, number] {
  return [square.charCodeAt(0) - 97, parseInt(square[1] ?? "1", 10) - 1];
}

function aligned(a: string, b: string): boolean {
  const [fa, ra] = fileRankOf(a);
  const [fb, rb] = fileRankOf(b);
  return fa === fb || ra === rb || Math.abs(fa - fb) === Math.abs(ra - rb);
}

/** True if a knight sitting on `a` would attack `b` (or vice versa). */
function knightDistance(a: string, b: string): boolean {
  const [fa, ra] = fileRankOf(a);
  const [fb, rb] = fileRankOf(b);
  const df = Math.abs(fa - fb);
  const dr = Math.abs(ra - rb);
  return (df === 1 && dr === 2) || (df === 2 && dr === 1);
}

function chebyshevDistance(a: string, b: string): number {
  const [fa, ra] = fileRankOf(a);
  const [fb, rb] = fileRankOf(b);
  return Math.max(Math.abs(fa - fb), Math.abs(ra - rb));
}

/**
 * Finds a square not aligned (same rank/file/diagonal, or a knight's
 * move away) with any of the given squares, so a king placed there can't
 * accidentally end up in check from a slider OR a knight already on the
 * board. Fixtures that WANT the king aligned or adjacent to a piece (pin
 * tests, king-recapture tests) should pass whiteKing/blackKing explicitly
 * instead of relying on this. This is a best-effort heuristic, not a
 * substitute for the capturesKing verification below — it just makes
 * that verification pass on the first try in the common case instead of
 * needing a search/retry loop.
 */
function findSafeKingSquare(avoid: readonly string[], exclude: readonly string[] = []): Square {
  for (const file of "abcdefgh") {
    for (let rank = 1; rank <= 8; rank++) {
      const sq = `${file}${rank}`;
      if (exclude.includes(sq)) continue;
      if (exclude.some((e) => chebyshevDistance(sq, e) < 2)) continue; // kings can't be adjacent
      if (avoid.every((a) => !aligned(sq, a) && !knightDistance(sq, a))) return sq as Square;
    }
  }
  throw new Error("findSafeKingSquare: no safe square found");
}

/**
 * Builds a FEN from a declarative position spec. If whiteKing/blackKing
 * are omitted, safe (unaligned) squares are chosen automatically.
 */
export function buildFen(spec: PositionSpec): string {
  const actionSquares = Object.keys(spec.pieces);
  const whiteKing = spec.whiteKing ?? findSafeKingSquare(actionSquares);
  const blackKing =
    spec.blackKing ?? findSafeKingSquare([...actionSquares, whiteKing], [whiteKing]);

  const chess = new Chess();
  chess.clear();
  chess.put({ type: "k", color: "w" }, whiteKing);
  chess.put({ type: "k", color: "b" }, blackKing);
  for (const [square, [type, color]] of Object.entries(spec.pieces)) {
    chess.put({ type, color }, square as Square);
  }

  const parts = chess.fen().split(" ");
  parts[1] = spec.turn;
  parts[2] = "-"; // no castling rights in any hand-built fixture
  parts[3] = spec.epSquare ?? "-";

  const fen = parts.join(" ");

  // Fail loudly at fixture-build time, not at test-run time, if the spec
  // produced something illegal (e.g. a move that "captures" a king —
  // the tell-tale sign of an accidental check on the side not to move).
  const verify = new Chess(fen);
  const capturesKing = verify.moves({ verbose: true }).some((m) => m.captured === "k");
  if (capturesKing) {
    throw new Error(
      `buildFen: illegal position — a legal move captures the king. fen=${fen}`,
    );
  }

  return fen;
}