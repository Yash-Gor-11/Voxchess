// src/lib/chess/adjustWeights.ts
//
// Pure arithmetic. No chess.js, no board state, no elo knowledge beyond
// whatever base weights the caller hands in. Consumes a
// PositionCharacter tag (see PositionCharacterization.ts) and redistributes
// a tier's qualityWeights accordingly.
//
// IMPORTANT:
//
// Redistribution is computed against the ORIGINAL base weights.
//
// Every flow is evaluated simultaneously.
//
// This is intentionally NOT:
//
//   Best -> Excellent
//   then Excellent -> Good
//
// because that would make results depend on iteration order — two flows
// that share a "from" or "to" bucket must produce the same result
// regardless of what order they're listed in the table. Treat the table
// as a flow network, not a sequence: every flow's amount is computed
// from the ORIGINAL value of its `from` bucket, all outgoing amounts
// per bucket are summed, all incoming amounts per bucket are summed,
// and both are applied to the original weights in a single pass. This
// is asserted directly by a test (shuffling a row's flow order must not
// change the output) specifically to guard against someone later
// "simplifying" this into a sequential reduce() that mutates as it goes.

import { MOVE_QUALITY_ASCENDING } from "./botMoveSelection";
import type { MoveQuality } from "./evaluation";
import type { PositionCharacter } from "./positionCharacter";

/** Tolerance for floating-point noise only — never for masking a real
 * configuration bug. A value more negative than this, or a total that
 * drifts more than this from the original sum, throws rather than
 * silently correcting, since either indicates a redistribution table
 * that violates its own invariants (e.g. a fraction > 1, or outgoing
 * fractions from one bucket summing past 100%) rather than ordinary
 * floating-point rounding. */
const EPSILON = 1e-9;

export interface RedistributionFlow {
  /** Bucket the fraction is drawn from. */
  readonly from: MoveQuality;
  /** Bucket the fraction is added to. */
  readonly to: MoveQuality;
  /**
   * Fraction of the FROM bucket's ORIGINAL value to move — e.g. 0.1
   * means "10% of whatever `best` was before any redistribution in this
   * row," not 10 percentage points and not 10% of some
   * already-adjusted intermediate value.
   */
  readonly fraction: number;
}

export type RedistributionTable = Record<PositionCharacter, readonly RedistributionFlow[]>;

/**
 * Production redistribution table. Deliberately conservative for v1 —
 * see conversation history for the full reasoning, but the short
 * version: early drafts routed the tactical leak through `best`
 * directly into `mistake`/`blunder`, which (since `best` is the
 * largest bucket at every tier) made the ABSOLUTE tactical-mistake
 * rate roughly flat-to-increasing with rating instead of decreasing —
 * backwards, since a stronger player should be LESS likely to blunder
 * in a tactical position, not equally likely. Routing the leak through
 * `excellent`/`good` instead (buckets that themselves shrink with
 * rating) means the downstream leak shrinks too, automatically, with
 * no elo-dependent logic anywhere in this table.
 *
 * `blunder` is deliberately untouched by every row: Immediate
 * Punishment already exists to reject one-ply absurdities, and
 * Stockfish's own MultiPV output already supplies genuinely bad moves
 * when a position actually has them. This table's job is only to
 * express "how confident is the bot in finding the engine's exact top
 * choice," not to manufacture raw material for Immediate Punishment to
 * reject.
 *
 * No single flow in this table exceeds ~18% of its source bucket — kept
 * comfortably under the ~30-35% design ceiling (position
 * characterization may perturb the distribution noticeably, but the
 * elo profile must remain the dominant signal, not be overridden by it).
 *
 * `both`'s row is authored directly as its own behavioral statement
 * ("sharp position with multiple plausible tries — the highest-risk
 * case"), not mechanically derived by combining `ambiguous` and
 * `tactical` — combining two rows that can share a `from`/`to` bucket
 * has the exact same order-dependence problem as sequential flows
 * within one row, so `both` is deliberately its own hand-tuned row
 * rather than a computed composition of the other two.
 */
export const REDISTRIBUTION_TABLE: RedistributionTable = {
  normal: [],

  ambiguous: [
    { from: "best", to: "excellent", fraction: 0.1 },
    { from: "best", to: "good", fraction: 0.05 },
  ],

  tactical: [
    { from: "best", to: "excellent", fraction: 0.12 },
    { from: "excellent", to: "good", fraction: 0.1 },
    { from: "good", to: "inaccuracy", fraction: 0.06 },
    { from: "excellent", to: "mistake", fraction: 0.02 },
  ],

  both: [
    { from: "best", to: "excellent", fraction: 0.16 },
    { from: "excellent", to: "good", fraction: 0.12 },
    { from: "good", to: "inaccuracy", fraction: 0.1 },
    { from: "excellent", to: "mistake", fraction: 0.04 },
    { from: "good", to: "mistake", fraction: 0.03 },
  ],
};

/**
 * Redistributes `baseWeights` according to `character`, using `table`
 * (defaults to the production REDISTRIBUTION_TABLE — tests pass their
 * own small synthetic tables so redistribution-algorithm correctness
 * can be verified independently of production tuning numbers, the same
 * separation SeeOptions.pieceOrder uses in see.ts).
 *
 * Never mutates `baseWeights`. Every flow's amount is computed from the
 * ORIGINAL value of its `from` bucket (see the module-level comment on
 * why this must be atomic, not sequential).
 *
 * Throws if any bucket would go meaningfully negative, or if total
 * probability mass drifts beyond floating-point noise from the
 * original — deliberately fails loudly rather than silently clamping,
 * since either condition means the table itself violates its own
 * invariants (a fraction > 1, or a bucket's total outflow exceeding
 * 100%), which is a configuration bug worth surfacing immediately, not
 * a case to paper over. Values within EPSILON of zero are floating-point
 * rounding, not a real violation, and are clamped to exactly 0.
 */
export function adjustWeights(
  baseWeights: Record<MoveQuality, number>,
  character: PositionCharacter,
  table: RedistributionTable = REDISTRIBUTION_TABLE,
): Record<MoveQuality, number> {
  const flows = table[character] ?? [];

  // Validate the table itself before doing any arithmetic with it. This
  // catches malformed configuration (a typo'd fraction, a copy-paste
  // that left a stray minus sign) with a message pointing directly at
  // the offending flow, rather than letting it surface later as a
  // confusing negative-weight or mass-drift error somewhere downstream.
  for (const flow of flows) {
    if (!Number.isFinite(flow.fraction)) {
      throw new Error(
        `adjustWeights: character "${character}" has a non-finite fraction (${flow.fraction}) ` +
          `for flow ${flow.from} -> ${flow.to}.`,
      );
    }
    if (flow.fraction < 0 || flow.fraction > 1) {
      throw new Error(
        `adjustWeights: character "${character}" has an out-of-range fraction ` +
          `(${flow.fraction}) for flow ${flow.from} -> ${flow.to}. Fractions must be within ` +
          `[0, 1] — a negative fraction would reverse the flow's direction, and a fraction ` +
          `above 1 would remove more than the entire source bucket on its own.`,
      );
    }
  }

  const outgoing: Partial<Record<MoveQuality, number>> = {};
  const incoming: Partial<Record<MoveQuality, number>> = {};

  for (const flow of flows) {
    const amount = baseWeights[flow.from] * flow.fraction;
    outgoing[flow.from] = (outgoing[flow.from] ?? 0) + amount;
    incoming[flow.to] = (incoming[flow.to] ?? 0) + amount;
  }

  const result = {} as Record<MoveQuality, number>;
  let originalTotal = 0;
  let adjustedTotal = 0;

  for (const quality of MOVE_QUALITY_ASCENDING) {
    originalTotal += baseWeights[quality];

    const adjusted = baseWeights[quality] - (outgoing[quality] ?? 0) + (incoming[quality] ?? 0);
    if (adjusted < -EPSILON) {
      throw new Error(
        `adjustWeights: character "${character}" produces a negative weight for "${quality}" ` +
          `(${adjusted}). Multiple flows draw from "${quality}" whose fractions sum to more ` +
          `than 1 — no single flow can cause this on its own, since fractions are validated ` +
          `to [0, 1] before this point.`,
      );
    }

    result[quality] = Math.max(0, adjusted);
    adjustedTotal += result[quality];
  }

  if (Math.abs(adjustedTotal - originalTotal) > EPSILON) {
    throw new Error(
      `adjustWeights: character "${character}" changed total probability mass from ` +
        `${originalTotal} to ${adjustedTotal}. Every flow must have a matching outflow and ` +
        `inflow of the same amount — this indicates a bug in the redistribution table or in ` +
        `this function itself, not ordinary floating-point rounding.`,
    );
  }

  return result;
}