// Validation fixtures — NOT tests. These positions are deliberately
// complex enough (pins, x-rays, dynamic checks discovered mid-exchange)
// that hand-deriving their expected SEE values risks encoding a human
// calculation mistake into the test suite rather than catching one.
//
// Each entry documents WHY it's difficult via `purpose`, so it stays
// useful on its own even before it has an asserted value. Once these
// positions have been independently verified against a second SEE
// implementation (not against a general chess engine's positional eval —
// see the discussion history for why that doesn't validate SEE), they
// should graduate into see.test.ts with a real expectedNetMaterial and
// be removed from this file.
//
// No test file should import VALIDATION_POSITIONS and assert against it
// yet. Doing so would produce a "test" with a value nobody has actually
// verified — worse than no test at all, since it looks like coverage
// without being coverage.

import type { Square } from "chess.js";
import type { SeeCapture } from "../see";

export interface ValidationPosition {
  name: string;
  purpose: string;
  fen: string;
  capture: SeeCapture;
}

export const VALIDATION_POSITIONS: ValidationPosition[] = [
  {
    name: "Pinned knight cannot recapture",
    purpose:
      "Black knight on e5 geometrically attacks c6 and looks like it defends " +
      "the pawn there, but it's absolutely pinned to the black king (e8) by " +
      "the white queen on e1 along the e-file. Any move off that file is " +
      "illegal, so the knight has no legal recapture at all -- the SEE " +
      "result should treat this as an entirely undefended capture, not a " +
      "defended one. An implementation that derives 'defenders' from raw " +
      "attack patterns (e.g. via something like chess.js's .attackers(), " +
      "which explicitly does not account for pins) rather than actual " +
      "legal moves will get this wrong.",
    fen: "4k3/8/2p5/1P2n3/8/8/8/4Q2K w - - 0 1",
    capture: { from: "b5" as Square, to: "c6" as Square },
  },
  {
    name: "X-ray attacker behind a doubled rook",
    purpose:
      "White has two rooks doubled on the d-file (d1 behind d4). The front " +
      "rook (d4) is the only attacker visible at first glance, but once it " +
      "and whatever recaptures it are cleared off the file, the back rook " +
      "(d1) becomes a live attacker on the same square. An implementation " +
      "that computes the attacker/defender set once up front, rather than " +
      "regenerating legal moves fresh at each ply of the exchange, will " +
      "miss this second attacker entirely.",
    fen: "3r3k/8/8/3n4/3R4/8/8/3R3K w - - 0 1",
    capture: { from: "d4" as Square, to: "d5" as Square },
  },
  {
    name: "Dynamic pin appearing mid-exchange",
    purpose:
      "Black's knight (f6) and queen (d8) both appear to defend d5 in the " +
      "starting position, with no pin evident yet. As the exchange " +
      "progresses and pieces are removed from the board, a white bishop's " +
      "diagonal toward the black king may open up in a way that makes a " +
      "later recapture in the sequence illegal even though it wasn't " +
      "restricted at the start. This checks that legality is re-evaluated " +
      "fresh at every ply rather than assumed to be fixed from the initial " +
      "position.",
    fen: "3q3k/8/5n2/3p4/4P3/1B6/8/7K w - - 0 1",
    capture: { from: "e4" as Square, to: "d5" as Square },
  },
  {
    name: "En passant capture that is itself recaptured",
    purpose:
      "White captures en passant (exd6) -- the captured pawn is not on the " +
      "destination square, which is exactly the kind of case where 'value " +
      "of piece on the destination square' bookkeeping can go wrong. Black " +
      "then has a legal knight recapture on d6. Verifies the exchange " +
      "continues correctly past an en passant capture, not just that the " +
      "initial capture is valued correctly in isolation (see Category A).",
    fen: "7k/5n2/8/3pP3/8/8/8/7K w - d6 0 1",
    capture: { from: "e5" as Square, to: "d6" as Square },
  },
];