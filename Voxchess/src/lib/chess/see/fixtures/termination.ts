// Termination fixtures. This is the part of the swap algorithm most
// likely to be subtly wrong in a first implementation: the sequence is
// NOT simply "capture, capture, capture" -- each side must be willing to
// decline a recapture that would be a net loss for them ("stand pat"),
// and when multiple recapture options exist, the least-valuable-attacker
// (LVA) must go first, since choosing a different order can change the
// final result entirely.
//
// Every expected value below was independently hand-simulated ply-by-ply
// against the same LVA-first / stand-pat rules the implementation is
// expected to follow, before the implementation was tested against them
// (see conversation history) -- so these are a real specification of
// intended behavior, not values reverse-engineered from a first
// implementation attempt.

import type { Square } from "chess.js";
import { buildFen } from "./buildFen";
import type { SeeCapture } from "../see";

export interface TerminationFixture {
  name: string;
  purpose: string;
  fen: string;
  capture: SeeCapture;
  expectedNetMaterial: number;
}

export const TERMINATION_FIXTURES: TerminationFixture[] = [
  {
    name: "Queen decline (stand pat) after a bad recapture",
    purpose:
      "Rook takes a pawn defended only by the queen; a bishop stands ready " +
      "to win the queen if it recaptures. The queen must decline (contribute " +
      "0), not recapture and let the exchange run to a large loss -- a naive " +
      "'always recapture' algorithm would get this wrong.",
    fen: buildFen({
      turn: "w",
      pieces: { d1: ["r", "w"], d5: ["p", "b"], a8: ["q", "b"], b3: ["b", "w"] },
      whiteKing: "a1",
      blackKing: "a3",
    }),
    capture: { from: "d1" as Square, to: "d5" as Square },
    expectedNetMaterial: 1,
  },
  {
    name: "Least-valuable-attacker ordering changes the result",
    purpose:
      "Black has two defenders of different value (knight, rook) on the " +
      "same square, with a white bishop ready to recapture behind them. " +
      "Recapturing with the knight first (correct LVA order) yields a " +
      "different, and correct, final result than recapturing with the " +
      "rook first would -- this fixture is specifically sensitive to " +
      "attacker-ordering bugs.",
    fen: buildFen({
      turn: "w",
      pieces: {
        e4: ["p", "w"],
        d5: ["p", "b"],
        c7: ["n", "b"],
        d8: ["r", "b"],
        f3: ["b", "w"],
      },
      whiteKing: "a1",
      blackKing: "a3",
    }),
    capture: { from: "e4" as Square, to: "d5" as Square },
    expectedNetMaterial: 0,
  },
  {
    name: "Favorable chain runs to completion, including the final queen recapture",
    purpose:
      "A four-ply exchange where every recapture remains worthwhile for the " +
      "side making it, including the queen's final capture -- checks that " +
      "the algorithm doesn't prematurely cut the exchange short just " +
      "because an expensive piece is about to move.",
    fen: buildFen({
      turn: "w",
      pieces: {
        e4: ["p", "w"],
        d5: ["p", "b"],
        c7: ["n", "b"],
        f3: ["b", "w"],
        d8: ["q", "b"],
      },
      whiteKing: "a1",
      blackKing: "a3",
    }),
    capture: { from: "e4" as Square, to: "d5" as Square },
    expectedNetMaterial: 0,
  },
  {
    name: "Underpromotion is chosen when it's better than promoting to a queen",
    purpose:
      "Black recaptures via a promoting pawn capture, and a white bishop " +
      "is waiting to recapture whatever black promotes to. Promoting to a " +
      "queen would hand the bishop +9; promoting to a knight (or bishop) " +
      "only hands it +3, which is strictly better for black. Since chess.js " +
      "generates one move object per promotion choice (all sharing " +
      "piece: 'p'), this exercises the explicit per-variant evaluation in " +
      "continueExchange() -- it does not rely on any assumption that the " +
      "cheapest promotion is always best; every legal promotion choice is " +
      "actually played out and recursed into, and the best result wins.",
    fen: buildFen({
      turn: "w",
      pieces: { c1: ["b", "b"], d1: ["r", "w"], b2: ["p", "b"], a3: ["b", "w"] },
      whiteKing: "h1",
      blackKing: "h8",
    }),
    capture: { from: "d1" as Square, to: "c1" as Square },
    // Rxc1 (+3). Black underpromotes (bxc1=N or =B, gaining the rook: +5).
    // White bishop recaptures the knight/bishop (+3). No further attacker.
    // Black's promotion nets 5-3=+2 (worth doing), so root = 3 - 2 = 1.
    // (Promoting to a queen instead would net 5-9=-4, clamped to 0 -- a
    // strictly worse choice, and would incorrectly yield root = 3.)
    expectedNetMaterial: 1,
  },
  {
    name: "A promoted piece pinning its own recapturer doesn't prevent the recapture",
    purpose:
      "White rook captures a black bishop on b1; black recaptures via a " +
      "promoting pawn. White's own bishop (d3) sits on the same diagonal " +
      "as the white king (e4) -- so if black promotes to a queen or " +
      "bishop (which attacks along that diagonal), White's bishop becomes " +
      "pinned and loses most of its other moves. But capturing the exact " +
      "piece that's doing the pinning always resolves that pin (the " +
      "capturing move IS the pin line), so Bxb1 remains legal regardless " +
      "of which piece black promotes to -- this was constructed " +
      "specifically to probe whether promotion choice could affect the " +
      "LEGALITY of a later recapture (not just its value) in this " +
      "legality-aware exchange model, and confirms it doesn't: a piece " +
      "can only pin or check via lines passing through its own square, " +
      "so any move that captures it necessarily removes that constraint, " +
      "regardless of the capturing piece's type or the line it moved " +
      "along beforehand.",
    fen: "1R5k/8/8/8/4K3/3B4/p7/1b6 w - - 0 1",
    capture: { from: "b8" as Square, to: "b1" as Square },
    // Rxb1 (+3, bishop). Black promotes (any choice) and recaptures the
    // rook (+5). White's bishop recaptures whatever black promoted to --
    // legal in every case, including queen/bishop promotions that pin
    // the bishop along the same diagonal it's capturing on. Black's best
    // promotion is still the cheapest that survives (knight/rook, +3),
    // same shape as the fixture above: black's promotion nets 5-3=+2,
    // root = 3 - 2 = 1.
    expectedNetMaterial: 1,
  },
  {
    name: "Published x-ray exchange resolves correctly under the default ordering (CPW Position 2)",
    purpose:
      "The Chess Programming Wiki's own published x-ray teaching example " +
      "(SEE - The Swap Algorithm, Position 2: " +
      "'1k1r3q/1ppn3p/p4b2/4p3/8/P2N2P1/1PP1R1BP/2K1Q3 w - - ; Nxe5?'). " +
      "Black has two equal-value defenders (knight, bishop) on the target " +
      "square, but only the bishop reveals a further attacker (its own " +
      "queen, via x-ray) when it moves off its original square, and the " +
      "rook's recapture separately reveals white's queen the same way. " +
      "Under DEFAULT_PIECE_ORDER, this implementation reproduces the exact " +
      "capture sequence published on the wiki (Nxe5, Nxn, Rxn, Bxr, Qxb, " +
      "Qxq), including both x-ray reveals, with no x-ray-specific code. " +
      "The final number here (-2) differs from CPW's own published answer " +
      "(-225) only because this module uses conventional piece values " +
      "(1/3/3/5/9) rather than CPW's illustrative point scale " +
      "(100/325/325/500/1000) -- the exchange logic and capture order are " +
      "identical. (Separately, see.test.ts verifies that the knight-vs-" +
      "bishop tie at the first recapture doesn't actually change the final " +
      "result even if the tie-break order were different -- that's an " +
      "ordering-independence property, distinct from this fixture, which " +
      "only asserts what the default ordering produces.)",
    fen: "1k1r3q/1ppn3p/p4b2/4p3/8/P2N2P1/1PP1R1BP/2K1Q3 w - - 0 1",
    capture: { from: "d3" as Square, to: "e5" as Square },
    expectedNetMaterial: -2,
  },
];