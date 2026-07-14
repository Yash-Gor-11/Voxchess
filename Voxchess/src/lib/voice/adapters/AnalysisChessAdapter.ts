// src/lib/voice/adapters/AnalysisChessAdapter.ts
//
// Analysis-mode ChessAdapter, per v3 §5.10: "one for Analysis (backed by
// the current AnalysisTree node's position + its move-commit path)."
//
// VERIFIED AGAINST THE REAL SOURCE: the AnalysisTreeLike interface below
// matches VoxChess's actual `AnalysisTree` class (src/lib/chess/
// analysisEngine.ts), provided directly during development — this is not
// a guess or a reverse-engineering from usage alone. Confirmed against a
// faithful transcription of that real class (not shipped with this
// module; see AnalysisChessAdapter.test.ts's own mock, which replicates
// the same confirmed behavior):
//   - `tree.current.fen`                        — current node's FEN
//   - `tree.makeMove(`${from}${to}`)`            — quiet/capture moves
//   - `tree.makeMove(`${from}${to}${piece}`)`    — promotions, lowercase
//     SAN letter ("q"|"r"|"b"|"n") — chess.js's own convention, which the
//     real makeMove() passes straight through to `chess.move({...})`
//   - returns a TreeNode on success, null if illegal
//   - a move matching an EXISTING child (by chess.js's `.lan`) reuses that
//     child (transposition) rather than creating a duplicate node — a
//     real quirk of the actual class, confirmed and exercised in tests
//
// On the "variation-branch semantics" risk v3 flags for this phase: this
// was directly tested against the real class's logic, not just argued
// architecturally. Making a move from a non-mainline (or any) node
// correctly appends it as a new child (`isMainLine: false`) alongside
// whatever siblings already exist there, without disturbing them — see
// the "variation branching" and "transposition reuse" cases in
// AnalysisChessAdapter.test.ts. This adapter's thinness (it only reads
// `.fen` and calls `.makeMove()`, never touches `.children`/`.isMainLine`/
// `.parent` itself) is what makes it structurally incapable of
// interfering with that behavior — the real class owns branching
// entirely, and the adapter never has an opinion about it.

import type { ChessAdapter } from "./ChessAdapter";
import { createChessAdapter } from "./ChessAdapter";

/**
 * The subset of the real AnalysisTree's interface this adapter depends
 * on, confirmed against the actual class source (see file header).
 */
export interface AnalysisTreeLike {
  readonly current: { readonly fen: string };
  /**
   * `uci` is `${from}${to}` or `${from}${to}${promotionLetter}` (lowercase
   * promotion letter). Returns a truthy TreeNode on success (whether newly
   * created or an existing child reused via transposition), null if the
   * move is illegal for the current position.
   */
  makeMove(uci: string): unknown;
}

/**
 * createAnalysisChessAdapter(tree) -> ChessAdapter
 *
 * Thin wrapper around the same createChessAdapter factory Play uses. v3
 * §5.10 describes "two concrete implementations" for Play and Analysis —
 * in practice that's one generic factory (getFen + executeMove) plus
 * different wiring per mode, rather than two near-duplicate factory
 * functions. The Analysis-specific behavior (reading AnalysisTree's
 * current node, writing via tree.makeMove()) lives entirely in this file,
 * isolated from controller/matching/intent exactly as v3 §5.10 requires —
 * this file doesn't even import chess.js itself; it delegates to
 * ChessAdapter.ts, which is the sole permitted import site.
 */
export function createAnalysisChessAdapter(tree: AnalysisTreeLike): ChessAdapter {
  return createChessAdapter({
    getFen: () => tree.current.fen,
    executeMove: (move) => {
      const uci = move.promotion
        ? `${move.from}${move.to}${move.promotion.toLowerCase()}`
        : `${move.from}${move.to}`;

      const node = tree.makeMove(uci);

      if (!node) {
        // Per v3 §8's hard invariant, executeMove is only ever called with
        // an already-validated move (checked against this same adapter's
        // getLegalMoves() upstream, then CandidateGenerator, per Phase 3).
        // Reaching here means getLegalMoves() and tree.makeMove()
        // disagreed about legality for the same FEN — an internal
        // inconsistency bug, not an expected user-facing failure. Logged
        // rather than thrown, to match ChessAdapter.executeMove's
        // void/non-throwing contract.
        // eslint-disable-next-line no-console
        console.error(
          `[AnalysisChessAdapter] tree.makeMove("${uci}") returned falsy for a move ` +
            `that ChessAdapter.getLegalMoves() reported as legal for FEN ` +
            `"${tree.current.fen}". This indicates getLegalMoves() and ` +
            `AnalysisTree.makeMove() disagree about legality — should never happen ` +
            `given the v3 §8 invariant; please report if seen.`,
        );
      }
    },
  });
}
