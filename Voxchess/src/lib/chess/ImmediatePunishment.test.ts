import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import {
  check,
  seeThresholdForElo,
  mateThresholdForElo,
  type RealismDecision,
  type ImmediatePunishmentConfig,
} from "./ImmediatePunishment";
import type { PvCandidate } from "./botMoveSelection";

function buildFen(pieces: Record<string, [string, string]>, turn: "w" | "b" = "w"): string {
  const chess = new Chess();
  chess.clear();
  for (const [square, [type, color]] of Object.entries(pieces)) {
    chess.put({ type: type as any, color: color as any }, square as any);
  }
  const parts = chess.fen().split(" ");
  parts[1] = turn;
  parts[2] = "-";
  parts[3] = "-";
  return parts.join(" ");
}

describe("Rating-banded thresholds", () => {
  it("seeThresholdForElo bands", () => {
    expect(seeThresholdForElo(300)).toBe(Infinity);
    expect(seeThresholdForElo(700)).toBe(Infinity);
    expect(seeThresholdForElo(701)).toBe(900);
    expect(seeThresholdForElo(1200)).toBe(900);
    expect(seeThresholdForElo(1201)).toBe(500);
    expect(seeThresholdForElo(1700)).toBe(500);
    expect(seeThresholdForElo(1701)).toBe(300);
    expect(seeThresholdForElo(2200)).toBe(300);
    expect(seeThresholdForElo(2201)).toBe(100);
    expect(seeThresholdForElo(2900)).toBe(100);
  });

  it("mateThresholdForElo bands", () => {
    expect(mateThresholdForElo(300)).toBe(0);
    expect(mateThresholdForElo(800)).toBe(0);
    expect(mateThresholdForElo(801)).toBe(1);
    expect(mateThresholdForElo(1300)).toBe(1);
    expect(mateThresholdForElo(1301)).toBe(2);
    expect(mateThresholdForElo(2000)).toBe(2);
    expect(mateThresholdForElo(2001)).toBe(3);
    expect(mateThresholdForElo(2900)).toBe(3);
  });
});

describe("Mate filter", () => {
  const rootFen = buildFen({ h1: ["k", "w"], h8: ["k", "b"], e2: ["p", "w"] });
  const candidate: PvCandidate = { move: "e2e4", score: 0, mate: -1 };

  it("rejects a short forced mate at a rating where the threshold covers it", () => {
    // elo 1500 -> mateThresholdForElo = 2; mate: -1 (mate-in-1 against
    // the mover) is within that.
    const decision = check(rootFen, candidate, 1500);
    expect(decision.accepted).toBe(false);
    expect(decision.reason).toBe("mate");
    expect(decision.mateDistance).toBe(1);
    expect(decision.mateThreshold).toBe(2);
  });

  it("accepts the same mate distance at a rating too low for the filter to apply", () => {
    // elo 500 -> mateThresholdForElo = 0; mate-in-1 (distance 1) exceeds it,
    // so mate filtering doesn't reject it. No hanging pieces either, so
    // the SEE check passes too.
    const decision = check(rootFen, candidate, 500);
    expect(decision.accepted).toBe(true);
  });

  it("accepts a deep mate even at a high rating (only SHORT forced mates are filtered)", () => {
    const deepMateCandidate: PvCandidate = { move: "e2e4", score: 0, mate: -5 };
    // elo 2900 -> mateThresholdForElo = 3; distance 5 exceeds it.
    const decision = check(rootFen, deepMateCandidate, 2900);
    expect(decision.accepted).toBe(true);
  });

  it("ignores positive mate (mover delivering mate, not receiving it)", () => {
    const winningMateCandidate: PvCandidate = { move: "e2e4", score: 0, mate: 1 };
    const decision = check(rootFen, winningMateCandidate, 2900);
    expect(decision.accepted).toBe(true);
  });

  it("can be disabled via config even when it would otherwise reject", () => {
    const config: ImmediatePunishmentConfig = {
      logging: false,
      enableMateFilter: false,
      enableSeeFilter: true,
    };
    const decision = check(rootFen, candidate, 1500, config);
    expect(decision.accepted).toBe(true);
  });
});

describe("Mate filter sign convention — candidate.mate is White-absolute, not mover-relative", () => {
  // Per stockfish.ts's publishEval(), every reported mate value gets
  // multiplied by activeSide (-1 when the root position has Black to
  // move) -- converting UCI's native mover-relative sign into a
  // White-absolute one. This means "the mover gets mated" is
  // candidate.mate < 0 when White is to move, but candidate.mate > 0
  // when BLACK is to move. This block specifically exercises the
  // Black-to-move case, which a naive `mate < 0` check gets backwards.
  const blackToMoveFen = buildFen(
    { h1: ["k", "w"], h8: ["k", "b"], e7: ["p", "b"] },
    "b",
  );
  const candidateMove: PvCandidate["move"] = "e7e5";

  it("rejects when Black (the mover) gets mated -- a POSITIVE mate value in this convention", () => {
    // White-absolute positive = good for White = bad for Black, the mover.
    const candidate: PvCandidate = { move: candidateMove, score: 0, mate: 1 };
    const decision = check(blackToMoveFen, candidate, 1500);
    expect(decision.accepted).toBe(false);
    expect(decision.reason).toBe("mate");
    expect(decision.mateDistance).toBe(1);
  });

  it("does NOT reject when Black (the mover) is the one DELIVERING mate -- a NEGATIVE mate value here", () => {
    // White-absolute negative = good for Black = good for the mover.
    // A naive `mate < 0` check would incorrectly reject this.
    const candidate: PvCandidate = { move: candidateMove, score: 0, mate: -1 };
    const decision = check(blackToMoveFen, candidate, 1500);
    expect(decision.accepted).toBe(true);
  });

  it("agrees with the White-to-move case using the OPPOSITE sign for the same real-world outcome", () => {
    // Same "mover gets mated in 1" situation, expressed once with White
    // to move (mate: -1, per the existing Mate filter tests above) and
    // once with Black to move (mate: +1) -- both must reject.
    const whiteToMoveFen = buildFen({ h1: ["k", "w"], h8: ["k", "b"], e2: ["p", "w"] });
    const whiteCandidate: PvCandidate = { move: "e2e4", score: 0, mate: -1 };
    const blackCandidate: PvCandidate = { move: candidateMove, score: 0, mate: 1 };

    const whiteDecision = check(whiteToMoveFen, whiteCandidate, 1500);
    const blackDecision = check(blackToMoveFen, blackCandidate, 1500);

    expect(whiteDecision.accepted).toBe(false);
    expect(blackDecision.accepted).toBe(false);
    expect(whiteDecision.reason).toBe(blackDecision.reason);
  });
});

describe("SEE filter — the move itself hangs material", () => {
  // White queen d1, black rook d8. Candidate: Qd5, hanging the queen to
  // Rxd5 with no recapture available.
  const rootFen = buildFen({ h1: ["k", "w"], h8: ["k", "b"], d1: ["q", "w"], d8: ["r", "b"] });
  const candidate: PvCandidate = { move: "d1d5", score: 0, mate: null };

  it("rejects an undefended queen hang at a rating where the threshold covers it", () => {
    // elo 1800 -> seeThresholdForElo = 300 (cp-equivalent). Losing a
    // queen for nothing is 9 * 100 = 900cp-equivalent, well above it.
    const decision = check(rootFen, candidate, 1800);
    expect(decision.accepted).toBe(false);
    expect(decision.reason).toBe("see");
    expect(decision.seeLossCentipawns).toBe(900);
    expect(decision.seeThreshold).toBe(300);
  });

  it("accepts the same blunder at a rating low enough that the filter is disabled", () => {
    // elo 400 -> seeThresholdForElo = Infinity (filter disabled).
    const decision = check(rootFen, candidate, 400);
    expect(decision.accepted).toBe(true);
  });

  it("can be disabled via config even when it would otherwise reject", () => {
    const config: ImmediatePunishmentConfig = {
      logging: false,
      enableMateFilter: true,
      enableSeeFilter: false,
    };
    const decision = check(rootFen, candidate, 1800, config);
    expect(decision.accepted).toBe(true);
  });
});

describe("SEE filter is board-wide, not limited to the moved piece", () => {
  // White rook a1 is already hanging to black's rook a8. The candidate
  // move is an unrelated quiet pawn push (e2e4) that does nothing about
  // it -- this is exactly the "ignored a hanging piece elsewhere on the
  // board" case the board-wide scan exists to catch.
  const rootFen = buildFen({
    h1: ["k", "w"],
    h8: ["k", "b"],
    a1: ["r", "w"],
    a8: ["r", "b"],
    e2: ["p", "w"],
  });
  const candidate: PvCandidate = { move: "e2e4", score: 0, mate: null };

  it("rejects ignoring a hanging rook elsewhere on the board", () => {
    const decision = check(rootFen, candidate, 1800);
    expect(decision.accepted).toBe(false);
    expect(decision.reason).toBe("see");
    // Rook value (5) * 100.
    expect(decision.seeLossCentipawns).toBe(500);
  });
});

describe("SEE filter allows small, human-realistic material slips", () => {
  // A pawn trade that's materially even should never be rejected,
  // regardless of rating. This is a direct regression test for a real
  // bug found during development: an earlier version scanned the
  // resulting position for the opponent's best capture in ISOLATION,
  // which reported the recapture (cxd5) as the opponent winning a whole
  // pawn -- without accounting for the fact that the mover had already
  // justly captured a pawn to get there. The fix uses see() directly on
  // the mover's own capturing move, which nets both plies correctly via
  // its existing gain-minus-continuation logic.
  const rootFen = buildFen({
    h1: ["k", "w"],
    h8: ["k", "b"],
    e4: ["p", "w"],
    d5: ["p", "b"],
    c6: ["p", "b"], // defends d5
  });
  const candidate: PvCandidate = { move: "e4d5", score: 0, mate: null };

  it("accepts an even pawn trade at every rating", () => {
    for (const elo of [400, 1000, 1800, 2500, 2900]) {
      const decision = check(rootFen, candidate, elo);
      expect(decision.accepted).toBe(true);
    }
  });
});

describe("An even trade doesn't mask a genuinely separate hanging piece", () => {
  // Same even pawn trade as above, PLUS an unrelated hanging rook
  // elsewhere on the board. The same-square netting for e4xd5 should
  // still report ~0, but the other-squares scan should still catch the
  // rook -- the two signals must not interfere with each other.
  const rootFen = buildFen({
    h1: ["k", "w"],
    h8: ["k", "b"],
    e4: ["p", "w"],
    d5: ["p", "b"],
    c6: ["p", "b"],
    a1: ["r", "w"],
    a8: ["r", "b"],
  });
  const candidate: PvCandidate = { move: "e4d5", score: 0, mate: null };

  it("still rejects for the unrelated hanging rook", () => {
    const decision = check(rootFen, candidate, 1800);
    expect(decision.accepted).toBe(false);
    expect(decision.reason).toBe("see");
    expect(decision.seeLossCentipawns).toBe(500); // rook value, not pawn
  });
});

describe("Logging", () => {
  const rootFen = buildFen({ h1: ["k", "w"], h8: ["k", "b"], d1: ["q", "w"], d8: ["r", "b"] });
  const candidate: PvCandidate = { move: "d1d5", score: 0, mate: null };

  it("calls onDecision exactly once when logging is enabled, for both accepted and rejected calls", () => {
    const decisions: RealismDecision[] = [];
    const config: ImmediatePunishmentConfig = {
      logging: true,
      enableMateFilter: true,
      enableSeeFilter: true,
      onDecision: (d) => decisions.push(d),
    };

    check(rootFen, candidate, 1800, config); // rejects
    check(rootFen, candidate, 400, config); // accepts

    expect(decisions).toHaveLength(2);
    expect(decisions[0].accepted).toBe(false);
    expect(decisions[1].accepted).toBe(true);
  });

  it("never calls onDecision when logging is disabled", () => {
    let called = false;
    const config: ImmediatePunishmentConfig = {
      logging: false,
      enableMateFilter: true,
      enableSeeFilter: true,
      onDecision: () => {
        called = true;
      },
    };
    check(rootFen, candidate, 1800, config);
    expect(called).toBe(false);
  });
});

describe("Determinism and safety", () => {
  const rootFen = buildFen({ h1: ["k", "w"], h8: ["k", "b"], d1: ["q", "w"], d8: ["r", "b"] });
  const candidate: PvCandidate = { move: "d1d5", score: 0, mate: null };

  it("is deterministic across repeated calls", () => {
    const first = check(rootFen, candidate, 1800);
    const second = check(rootFen, candidate, 1800);
    expect(second).toEqual(first);
  });

  it("does not mutate rootFen", () => {
    const before = rootFen;
    check(rootFen, candidate, 1800);
    expect(rootFen).toBe(before);
  });

  it("throws if the candidate move isn't actually legal in rootFen", () => {
    const illegalCandidate: PvCandidate = { move: "a1a2", score: 0, mate: null };
    expect(() => check(rootFen, illegalCandidate, 1800)).toThrow();
  });
});