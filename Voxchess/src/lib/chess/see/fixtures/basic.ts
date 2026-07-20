// Category A — trivial exchanges. Every expected value here should be
// obvious from piece values alone, with no exchange-sequencing subtlety
// (single capture, or an equal trade with an equally-obvious recapture).
// If one of these ever needs careful derivation to double-check, it
// belongs in Category B or the validation fixtures instead, not here.

import type { Square } from "chess.js";
import { buildFen } from "./buildFen";
import type { SeeCapture } from "../see";

export interface BasicFixture {
  name: string;
  fen: string;
  capture: SeeCapture;
  expectedNetMaterial: number;
}

export const BASIC_FIXTURES: BasicFixture[] = [
  {
    name: "Free queen (no recapture available)",
    fen: buildFen({
      turn: "b",
      pieces: { d4: ["q", "w"], d1: ["r", "b"] },
    }),
    capture: { from: "d1" as Square, to: "d4" as Square },
    expectedNetMaterial: 9,
  },
  {
    name: "Free rook (no recapture available)",
    fen: buildFen({
      turn: "b",
      pieces: { d4: ["r", "w"], d1: ["r", "b"] },
    }),
    capture: { from: "d1" as Square, to: "d4" as Square },
    expectedNetMaterial: 5,
  },
  {
    name: "Pawn takes undefended pawn",
    fen: buildFen({
      turn: "w",
      pieces: { e4: ["p", "w"], d5: ["p", "b"] },
    }),
    capture: { from: "e4" as Square, to: "d5" as Square },
    expectedNetMaterial: 1,
  },
  {
    name: "Rook takes rook, defended by a second rook (equal trade)",
    fen: buildFen({
      turn: "w",
      pieces: { d4: ["r", "w"], d7: ["r", "b"], d8: ["r", "b"] },
    }),
    // Rxd7 (win a rook), Rxd7 back (lose a rook) -> net 0
    capture: { from: "d4" as Square, to: "d7" as Square },
    expectedNetMaterial: 0,
  },
  {
    name: "Pawn takes pawn defended by another pawn (equal trade)",
    fen: buildFen({
      turn: "w",
      pieces: { e4: ["p", "w"], d5: ["p", "b"], c6: ["p", "b"] },
    }),
    capture: { from: "e4" as Square, to: "d5" as Square },
    expectedNetMaterial: 0,
  },
  {
    name: "Knight takes pawn defended only by a pawn (bad trade for the capturer)",
    fen: buildFen({
      turn: "w",
      pieces: { c3: ["n", "w"], d5: ["p", "b"], c6: ["p", "b"] },
    }),
    // Nxd5 (win a pawn, +1), cxd5 recaptures the knight (-3) -> net -2
    capture: { from: "c3" as Square, to: "d5" as Square },
    expectedNetMaterial: -2,
  },
  {
    name: "Queen takes pawn defended by a rook (very bad trade)",
    fen: buildFen({
      turn: "w",
      pieces: { d1: ["q", "w"], d5: ["p", "b"], d8: ["r", "b"] },
    }),
    // Qxd5 (+1), Rxd5 recaptures the queen (-9) -> net -8
    capture: { from: "d1" as Square, to: "d5" as Square },
    expectedNetMaterial: -8,
  },
  {
    name: "Bishop takes undefended knight",
    fen: buildFen({
      turn: "w",
      pieces: { a1: ["b", "w"], f6: ["n", "b"] },
    }),
    capture: { from: "a1" as Square, to: "f6" as Square },
    expectedNetMaterial: 3,
  },
  {
    name: "Rook takes undefended queen",
    fen: buildFen({
      turn: "w",
      pieces: { d1: ["r", "w"], d8: ["q", "b"] },
    }),
    capture: { from: "d1" as Square, to: "d8" as Square },
    expectedNetMaterial: 9,
  },
  {
    name: "En passant capture, undefended",
    fen: buildFen({
      turn: "w",
      pieces: { e5: ["p", "w"], d5: ["p", "b"] },
      epSquare: "d6",
    }),
    capture: { from: "e5" as Square, to: "d6" as Square },
    expectedNetMaterial: 1,
  },
  {
    name: "Promotion capture, then recaptured by king — promoted piece's value is what's lost",
    // bxa8=Q wins the rook (+5), but the king simply takes the new queen
    // (-9) since nothing defends it -- net -4. This checks that see()
    // values the piece actually sitting on the square after promotion
    // (a queen), not the pawn that made the capture.
    fen: buildFen({
      turn: "w",
      pieces: { b7: ["p", "w"], a8: ["r", "b"] },
      whiteKing: "h1",
      blackKing: "a7",
    }),
    capture: { from: "b7" as Square, to: "a8" as Square, promotion: "q" },
    expectedNetMaterial: -4,
  },
];