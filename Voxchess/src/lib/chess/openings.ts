import { OPENINGS } from "./openings.generated";

/**
 * Strips the halfmove clock and fullmove number from a full FEN string,
 * producing the four-part EPD key used in OPENINGS.
 *
 * "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
 *  → "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -"
 *
 * Improvement 4: guards against empty / malformed input.
 */
export function normalizeFen(fen: string): string {
  if (!fen) return "";
  return fen.split(" ").slice(0, 4).join(" ");
}

export interface OpeningResult {
  /** ECO code, e.g. "B90" */
  eco: string;
  /** Full opening name, e.g. "Sicilian Defense: Najdorf Variation" */
  name: string;
  /**
   * The ply index of the deepest position matched in the book.
   * 0 means no book position was found beyond the starting position.
   *
   * Use this to classify moves as "book" via `(moveIndex + 1) <= lastBookPly`
   * rather than calling isBookPosition() per-move — see improvement 7.
   */
  lastBookPly: number;
}

/**
 * Walks the position history backwards and returns the deepest known opening.
 *
 * @param fenHistory - Full FEN string for each position, index 0 = starting
 *   position, index N = position after N plies.
 */
export function detectOpening(fenHistory: readonly string[]): OpeningResult {
  // Improvement 6: named loop variable for readability.
  // Walk backwards so transpositions resolve to the deepest match.
  for (let ply = fenHistory.length - 1; ply > 0; ply--) {
    const entry = OPENINGS[normalizeFen(fenHistory[ply])];
    if (entry) {
      return {
        eco: entry[0],
        name: entry[1],
        lastBookPly: ply,
      };
    }
  }

  return { eco: "", name: "", lastBookPly: 0 };
}

/**
 * Returns just the opening family before the colon, e.g.
 * "Sicilian Defense: Najdorf Variation" → "Sicilian Defense"
 *
 * Useful for compact voice announcements.
 */
export function openingFamily(name: string): string {
  if (!name) return "";
  const colon = name.indexOf(":");
  return (colon === -1 ? name : name.slice(0, colon)).trim();
}

/**
 * Improvement 3: Object.hasOwn avoids prototype-chain false positives.
 *
 * Prefer using `lastBookPly` from detectOpening for move classification
 * (improvement 7). This helper is for one-off position checks only.
 */
export function isBookPosition(fen: string): boolean {
  return Object.hasOwn(OPENINGS, normalizeFen(fen));
}