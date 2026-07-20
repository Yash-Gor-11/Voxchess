// Category B — moderate exchanges. Slightly more involved than Category
// A (multiple attackers/defenders, a small battery), but still simple
// enough to verify carefully by hand, ply by ply -- every value here was
// hand-simulated against the LVA-first / stand-pat rules before being
// checked against the implementation.

import type { Square } from "chess.js";
import { buildFen } from "./buildFen";
import type { SeeCapture } from "../see";

export interface ModerateFixture {
  name: string;
  fen: string;
  capture: SeeCapture;
  expectedNetMaterial: number;
}

export const MODERATE_FIXTURES: ModerateFixture[] = [
  {
    name: "Two attackers, one defender — second attacker never needed",
    // exd5 (+1); black's rook recaptures the pawn (+1 for black), but
    // white's bishop backup would win the rook next (+5) -- black
    // correctly declines, so white just nets the pawn cleanly.
    fen: buildFen({
      turn: "w",
      pieces: { d5: ["p", "b"], d8: ["r", "b"], e4: ["p", "w"], f3: ["b", "w"] },
    }),
    capture: { from: "e4" as Square, to: "d5" as Square },
    expectedNetMaterial: 1,
  },
  {
    name: "Excess defenders are irrelevant once attackers run out",
    // exd5 (+1); black's knight recaptures (only defender white can't
    // answer, since white has no second attacker) -- the rook and queen
    // sitting behind never get consulted at all, because the exchange
    // ends once white has no further attacker on the square.
    fen: buildFen({
      turn: "w",
      pieces: {
        d5: ["p", "b"],
        c7: ["n", "b"],
        d8: ["r", "b"],
        a8: ["q", "b"],
        e4: ["p", "w"],
      },
    }),
    capture: { from: "e4" as Square, to: "d5" as Square },
    expectedNetMaterial: 0,
  },
  {
    name: "Bishop/rook battery — defender declines because a backup attacker is waiting",
    // Bxd5 wins the knight (+3). Black's rook could recapture the bishop
    // (+3 for black), but white's own rook is sitting behind on the same
    // file and would win the black rook next (+5) -- black declines, so
    // white simply nets the knight.
    fen: buildFen({
      turn: "w",
      pieces: { d5: ["n", "b"], d8: ["r", "b"], b3: ["b", "w"], d1: ["r", "w"] },
    }),
    capture: { from: "b3" as Square, to: "d5" as Square },
    expectedNetMaterial: 3,
  },
];