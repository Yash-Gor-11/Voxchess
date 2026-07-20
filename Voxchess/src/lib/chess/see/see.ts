// see.ts
//
// Static Exchange Evaluation (SEE): given a position and a capturing
// move, what is the net material outcome if both sides continue
// capturing on that square optimally?
//
// This module answers exactly one question — "what happens if this
// capture sequence is played out" — and nothing else. It has no
// knowledge of rating, thresholds, "realism", or blunders; those are
// policy decisions that belong to callers (e.g. ImmediatePunishment),
// not to the exchange primitive itself.
//
// EXPLICIT DESIGN DECISION — legality-aware attacker discovery, not an
// attack-map:
//
// The recursive control structure here (forced root capture, recurse
// with least-valuable-attacker selection, stand-pat via
// max(0, captured - recurse)) is exactly the textbook recursive
// formulation described on the Chess Programming Wiki's "Static
// Exchange Evaluation" page (see seeCapture/see pseudocode there).
//
// Where this differs from the classical bitboard swap algorithm (CPW's
// "SEE - The Swap Algorithm") is in HOW the next attacker is discovered
// at each ply: instead of maintaining an attacker/defender bitmask and
// manually updating it for x-rays, this implementation actually plays
// each move via chess.js and regenerates real legal moves from the
// resulting position.
//
// This is a deliberate design choice, not a correction of a defect in
// the classical algorithm: modern engines generally do add pin-aware
// (and otherwise legality-aware) handling on top of the base swap
// algorithm, precisely because raw attacker/defender bitmasks alone
// don't know that a "defender" might be pinned to its own king and
// therefore unable to legally recapture. For VoxChess's actual use
// (asking whether a human blunder would be *immediately and legally*
// punished, for a realism filter — see ImmediatePunishment), that
// legality-awareness is not optional, so we get it by construction from
// chess.js's real move generator — along with every other legality
// nuance (discovered checks mid-exchange, check-evasion requirements,
// en passant, promotion) — rather than adding it as a bolt-on.
//
// This has been cross-checked against a published worked example (CPW's
// own Position 2, the wiki's canonical x-ray teaching position — see the
// "LVA tie-break does not change the result" fixture in termination.ts)
// and successfully reproduces that exchange's published capture
// sequence, including both x-ray reveals, with no x-ray-specific code.
// That's one worked example, not a general proof that every possible
// x-ray configuration behaves identically to a bitboard implementation —
// but it gives real confidence that x-ray discovery through legal move
// regeneration behaves correctly on a published worked example
// containing multiple x-ray discoveries. Given the actual workload here
// (at most a handful of candidate moves, once per bot decision), the
// performance cost of real move generation versus bitboard manipulation
// is irrelevant; correctness is not.

import { Chess, type PieceSymbol, type Square } from "chess.js";

export interface SeeCapture {
  readonly from: Square;
  readonly to: Square;
  readonly promotion?: PieceSymbol;
}

export interface SeeResult {
  /**
   * Net material outcome for the side making `capture`, after both sides
   * continue the exchange on `capture.to` optimally (each side declines
   * to recapture if doing so would be a net loss for them). Positive
   * means the initiating side comes out ahead; negative means they come
   * out behind; zero means the exchange is materially even (or nothing
   * was won at all).
   */
  readonly netMaterial: number;
}

const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0, // never actually captured; present only so the map is total
};

// Default tie-break order among equal-valued attacker types (knight vs
// bishop, both worth 3), matching the convention used in reference SEE
// implementations (e.g. the Chess Programming Wiki's swap algorithm,
// which iterates piece types in this fixed order when selecting the
// least valuable attacker). Made explicit here rather than left to
// depend on whatever order chess.js's move generator happens to list
// moves in — cross-checked against a published worked example (see the
// module-level comment above) where this tie-break didn't change the
// final result, but relying on an undocumented library iteration order
// for a correctness-relevant tie-break would be fragile regardless.
// Overridable via SeeOptions.pieceOrder — see() with no options always
// uses this default; only tests exploring ordering independence pass a
// different one.
const DEFAULT_PIECE_ORDER: readonly PieceSymbol[] = ["p", "n", "b", "r", "q", "k"];

/**
 * Builds a piece → rank lookup from an ordering array. Used once per
 * continueExchange call rather than repeatedly calling
 * pieceOrder.indexOf(...) inside the tie-break comparator — not for
 * performance, but because `rank.get(piece)` reads as "this piece's
 * tie-break rank" more directly than re-deriving it via indexOf on
 * every comparison.
 */
function toRankMap(pieceOrder: readonly PieceSymbol[]): Map<PieceSymbol, number> {
  return new Map(pieceOrder.map((piece, rank) => [piece, rank]));
}

function findMatchingMove(chess: Chess, capture: SeeCapture) {
  const legal = chess.moves({ verbose: true });
  return legal.find(
    (m) =>
      m.from === capture.from &&
      m.to === capture.to &&
      (capture.promotion == null || m.promotion === capture.promotion) &&
      (m.isCapture() || m.isEnPassant()),
  );
}

/**
 * Value of whichever piece is currently occupying `square`, or 0 if the
 * square is empty. Reading directly off the board (rather than tracking
 * captured-piece values across recursive calls) means promotions are
 * handled correctly automatically — after a promoting capture, the piece
 * sitting on the square is whatever it was promoted to, and that's what
 * a subsequent recapture actually wins.
 */
function valueOnSquare(chess: Chess, square: Square): number {
  const piece = chess.get(square);
  return piece ? PIECE_VALUE[piece.type] : 0;
}

/**
 * Given a position and a target square, finds every legal capture the
 * side to move has available on that square, via chess.js's real legal
 * move generator — so a piece that's pinned, or would expose its own
 * king to check by moving, simply won't appear here. This is what makes
 * pins, discovered checks, and x-rays "just work" without any special
 * casing: chess.js has already excluded the illegal ones for us.
 */
function legalCapturesOnSquare(chess: Chess, square: Square) {
  return chess.moves({ verbose: true }).filter((m) => m.to === square && (m.isCapture() || m.isEnPassant()));
}

/**
 * Collapses candidates down to one representative per attacking origin
 * square. A single origin square can only hold one piece, so multiple
 * entries sharing a `from` are always the same physical attacker —
 * either genuine duplicates, or (the only real case) the several move
 * objects chess.js generates for a promoting pawn capture (=N, =B, =R,
 * =Q), which share both `from` and `piece: 'p'`. Any one representative
 * is equally valid for the LVA *selection* step, since they're
 * identical in origin and piece value; which promotion is actually best
 * is decided separately, after LVA selection, in continueExchange().
 */
function distinctAttackers<T extends { from: string }>(moves: readonly T[]): T[] {
  const byOrigin = new Map<string, T>();
  for (const move of moves) {
    if (!byOrigin.has(move.from)) byOrigin.set(move.from, move);
  }
  return [...byOrigin.values()];
}

/**
 * The side to move at `chess` is deciding whether to recapture on
 * `square`. Returns their optimal net gain from continuing the exchange
 * from here, assuming both sides play on to always decline a
 * net-negative continuation (the "stand pat" rule — see Termination
 * fixtures). This is the recursive heart of the swap algorithm.
 *
 * `rank` is only ever built from a non-default order via SeeOptions in
 * tests, to verify that the final result doesn't depend on which
 * equal-valued piece type resolves an LVA tie. Real callers always get
 * the map built from DEFAULT_PIECE_ORDER, since see() is never invoked
 * with options in production code.
 */
function continueExchange(chess: Chess, square: Square, rank: Map<PieceSymbol, number>): number {
  const captures = legalCapturesOnSquare(chess, square);
  if (captures.length === 0) return 0;

  // Choose the least-valuable ATTACKER (by origin square), ignoring
  // promotion choice entirely at this stage — every promotion variant
  // of the same pawn move shares the same origin and piece value, so
  // any representative works for this comparison. Ties between
  // equal-valued piece TYPES are broken by rank, not by whatever order
  // chess.js happens to list moves in.
  const attackers = distinctAttackers(captures);
  const lva = attackers.reduce((min, m) => {
    if (PIECE_VALUE[m.piece] !== PIECE_VALUE[min.piece]) {
      return PIECE_VALUE[m.piece] < PIECE_VALUE[min.piece] ? m : min;
    }
    return (rank.get(m.piece) ?? 0) < (rank.get(min.piece) ?? 0) ? m : min;
  });

  const gained = valueOnSquare(chess, square); // value of the piece about to be captured

  // If the winning attacker is a promoting pawn, chess.js generated one
  // move object per promotion choice (=N, =B, =R, =Q) for this exact
  // move. We do NOT assume the cheapest promotion is best and pick it
  // by value alone — instead every legal promotion choice for this
  // specific move is played out and recursed into separately, and the
  // recapturing side gets whichever result is actually best for them.
  // `gained` above is identical across all of them (the same piece is
  // being captured regardless of what the pawn promotes to); only the
  // downstream continuation can differ, so maximizing net here is
  // equivalent to minimizing the opponent's resulting continuation.
  // Non-promoting moves simply have one "variant" (themselves), so this
  // reduces to the same single recursive call as before in that case.
  const variants = captures.filter((m) => m.from === lva.from && m.to === lva.to);

  let bestNet = -Infinity;
  for (const variant of variants) {
    const child = new Chess(chess.fen());
    child.move({ from: variant.from, to: variant.to, promotion: variant.promotion });
    const opponentContinuation = continueExchange(child, square, rank);
    const net = gained - opponentContinuation;
    if (net > bestNet) bestNet = net;
  }

  // A rational side only recaptures if it doesn't lose material overall;
  // otherwise they decline ("stand pat"), contributing nothing further
  // to the exchange. This is the piece that catches "continuing the
  // exchange loses another rook — stop" cases.
  return Math.max(0, bestNet);
}

export interface SeeOptions {
  /**
   * Overrides the LVA tie-break order between equal-valued piece types.
   * Exists ONLY so tests can assert ordering independence directly —
   * e.g. `see(fen, capture, { pieceOrder: orderA }).netMaterial` equals
   * `see(fen, capture, { pieceOrder: orderB }).netMaterial` — rather
   * than asserting that DEFAULT_PIECE_ORDER happens to produce some
   * specific number, which wouldn't distinguish "the implementation
   * broke" from "the expected value assumed the old default" if
   * DEFAULT_PIECE_ORDER ever changes. Production code should never pass
   * this; omit `options` entirely and get DEFAULT_PIECE_ORDER.
   */
  readonly pieceOrder?: readonly PieceSymbol[];
}

/**
 * Evaluates the net material outcome of playing `capture` in `fen`, and
 * continuing the resulting exchange on that square optimally for both
 * sides. `fen` is read-only — a fresh position is cloned from it
 * internally, so callers never need to worry about whether this
 * function mutates their board or leaves move history in a strange
 * state.
 *
 * Throws if `capture` is not a legal capturing move (including
 * en passant) in `fen`.
 */
export function see(fen: string, capture: SeeCapture, options?: SeeOptions): SeeResult {
  const pieceOrder = options?.pieceOrder ?? DEFAULT_PIECE_ORDER;
  const rank = toRankMap(pieceOrder); // built once here, threaded through recursion

  const chess = new Chess(fen);
  const move = findMatchingMove(chess, capture);
  if (!move) {
    throw new Error(
      `see: ${capture.from}${capture.to}${capture.promotion ?? ""} is not a legal capture in position ${fen}`,
    );
  }

  // Value gained by the initial capture. Read from the move's own
  // `captured` field rather than the board, since en passant captures a
  // pawn that isn't actually sitting on `capture.to`.
  const initialGain = move.captured ? PIECE_VALUE[move.captured] : 0;

  chess.move({ from: move.from, to: move.to, promotion: move.promotion });

  // Unlike continueExchange()'s recursive calls, the root capture is not
  // optional — the caller has already committed to playing it (it's a
  // real candidate move being evaluated, not a choice SEE itself is
  // making) — so no max(0, ...) stand-pat clamp applies here. Only the
  // opponent's reply onward gets to decide whether continuing is worth
  // it.
  const continuation = continueExchange(chess, move.to, rank);
  const netMaterial = initialGain - continuation;

  return { netMaterial };
}