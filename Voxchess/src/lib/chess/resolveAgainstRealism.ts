// src/lib/chess/resolveAgainstRealism.ts
//
// Orchestration glue between botMoveSelection.ts's fallback ladder and
// ImmediatePunishment.ts's realism check. Deliberately its own module
// (not inlined in useBotMove.ts) even though its only caller today is
// that hook — it's pure, has no React dependency, and pulling it out
// means the hook and its tests share exactly one implementation instead
// of risking a copy in each drifting apart.
//
// Two entry points sharing one internal ladder-climbing loop, so there
// is never more than one call to pickExactQuality or
// resolveUpwardFallback for a given resolution — no redundant work
// between the two:
//
//   - resolveAgainstRealism: always resolves via the ladder starting at
//     `desired`, climbing past rejected candidates. Guaranteed to
//     return a candidate for any non-empty pool. Used once the pool is
//     already final (the expanded 8-PV set) and there's no more
//     expansion to fall back on.
//   - resolveExactAgainstRealism: only proceeds if an EXACT match for
//     `desired` exists in this pool; returns null otherwise so the
//     caller can decide to expand the MultiPV pool instead of settling
//     for a different quality tier prematurely. Used against the
//     initial 3-PV pool, mirroring the pre-Immediate-Punishment
//     behavior where "no exact match yet" and "exact match exists but
//     wasn't believable" were different situations calling for
//     different responses (expand vs. climb).
//
// Neither function knows or cares WHY ImmediatePunishment.check()
// rejected a candidate (SEE vs mate vs any future signal) — only
// whether decision.accepted is true. That's deliberate: it's what makes
// adding a future realism signal free, since it only ever touches
// ImmediatePunishment.ts, never this file.

import {
  pickExactQuality,
  resolveUpwardFallback,
  type PvCandidate,
  type ClassifiedCandidate,
} from "./botMoveSelection";
import {
  check as checkImmediatePunishment,
  type ImmediatePunishmentConfig,
} from "./ImmediatePunishment";
import type { MoveQuality } from "./evaluation";

/**
 * Shared resolution loop: given a starting candidate already selected
 * from `pool` at the desired quality (by whichever means the caller
 * used — pickExactQuality or resolveUpwardFallback), checks it against
 * Immediate Punishment. On rejection, removes that exact candidate
 * (by reference, not by move string — two distinct PV entries could in
 * principle share a move string in unusual positions, e.g. transposing
 * lines, so identity is the stronger guarantee) and re-resolves via
 * resolveUpwardFallback against what's left, looping until accepted or
 * the pool is exhausted.
 *
 * `config` is forwarded to check() unchanged — omit it for normal play
 * (silently uses ImmediatePunishment's own default, logging off). Pass
 * `{ logging: true, ..., onDecision }` here (and from the two exported
 * functions below) to observe every accept/reject decision during
 * self-play or manual testing, without needing to touch
 * ImmediatePunishment.ts itself.
 *
 * Always returns a candidate. If every candidate in `pool` is
 * eventually rejected (should be rare — Immediate Punishment's
 * thresholds are tuned to reject only obviously-inhuman oversights),
 * the loop falls back to the last remaining candidate rather than ever
 * returning nothing: a bot must always move, and a misconfigured
 * threshold that rejects everything at some rating is a bug worth
 * surfacing via logging, not something to get stuck on here.
 */
function resolveWithFallbacks(
  pool: readonly ClassifiedCandidate[],
  startCandidate: PvCandidate,
  desired: MoveQuality,
  rootFen: string,
  elo: number,
  config?: ImmediatePunishmentConfig,
): PvCandidate {
  let currentPool = pool;
  let candidate = startCandidate;

  while (true) {
    const decision = checkImmediatePunishment(rootFen, candidate, elo, config);
    if (decision.accepted) return candidate;

    const remaining = currentPool.filter((c) => c.pv !== candidate);
    if (remaining.length === 0) {
      return candidate;
    }
    currentPool = remaining;
    candidate = resolveUpwardFallback(currentPool, desired);
  }
}

/**
 * Resolves a candidate from `classified` at `desired` quality (or the
 * nearest available via upward fallback), checked against Immediate
 * Punishment and re-resolved against whatever's left on rejection.
 * Always returns a candidate for a non-empty pool.
 */
export function resolveAgainstRealism(
  classified: readonly ClassifiedCandidate[],
  desired: MoveQuality,
  rootFen: string,
  elo: number,
  config?: ImmediatePunishmentConfig,
): PvCandidate {
  const candidate = resolveUpwardFallback(classified, desired);
  return resolveWithFallbacks(classified, candidate, desired, rootFen, elo, config);
}

/**
 * Same as resolveAgainstRealism, but returns null if no EXACT match for
 * `desired` exists in `classified` at all — rather than silently
 * falling back to a different quality tier, this lets the caller decide
 * to expand the candidate pool instead (see useBotMove.ts's initial
 * phase). Once an exact match is confirmed to exist, resolution
 * proceeds through the same resolveWithFallbacks used by resolveAgainstRealism,
 * so there's no duplicated ladder logic between the two.
 */
export function resolveExactAgainstRealism(
  classified: readonly ClassifiedCandidate[],
  desired: MoveQuality,
  rootFen: string,
  elo: number,
  config?: ImmediatePunishmentConfig,
): PvCandidate | null {
  const exact = pickExactQuality(classified, desired);
  if (!exact) return null;
  return resolveWithFallbacks(classified, exact, desired, rootFen, elo, config);
}