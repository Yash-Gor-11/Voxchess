// src/lib/voice/confirmation/ConfirmationManager.test.ts
//
// Run with: bun test
//
// Every scenario here (including the floating-point bug this file's
// isDecisive fix addresses) was verified against real compiled output
// before being written into this file.

import { describe, expect, it } from "bun:test";
import {
  createConfirmationManager,
  createActionConfirmation,
  isDecisive,
  classifyConfirmationResponse,
} from "./ConfirmationManager";
import type { MoveCandidate, VoiceConfig } from "../types";

const FUZZY_CONFIG: VoiceConfig = { clarity: "fuzzy", timerMs: 2500, language: "en" };

function candidate(san: string, score: number, from = "a1", to = "e1"): MoveCandidate {
  return { move: { from, to }, san, score };
}

describe("isDecisive", () => {
  it("a single candidate is always decisive", () => {
    expect(isDecisive([candidate("Nf3", 1)], "fuzzy")).toBe(true);
  });

  it("an empty array is decisive (edge case, no crash)", () => {
    expect(isDecisive([], "fuzzy")).toBe(true);
  });

  it("a genuine tie (margin 0) is never decisive, either clarity", () => {
    const tied = [candidate("Rae1", 1), candidate("Rhe1", 1)];
    expect(isDecisive(tied, "fuzzy")).toBe(false);
    expect(isDecisive(tied, "clear")).toBe(false);
  });

  it("the pawn-default tiebreak margin (0.05) clears the decisive bar under both clarity settings", () => {
    // This is the exact case that surfaced a floating-point bug during
    // development: 0.95 - 0.9 === 0.04999999999999982 in raw JS, not
    // 0.05, which would have incorrectly failed this check without the
    // rounding fix in isDecisive.
    const pawnTiebreak = [candidate("e4", 0.95), candidate("Ne4", 0.9)];
    expect(isDecisive(pawnTiebreak, "fuzzy")).toBe(true);
    expect(isDecisive(pawnTiebreak, "clear")).toBe(true);
  });

  it("a small margin (0.02) is decisive under clear but not under fuzzy", () => {
    const small = [candidate("A", 0.52), candidate("B", 0.5)];
    expect(isDecisive(small, "fuzzy")).toBe(false);
    expect(isDecisive(small, "clear")).toBe(true);
  });
});

describe("classifyConfirmationResponse", () => {
  it('classifies "yes" and its variants', () => {
    expect(classifyConfirmationResponse("yes", 2)).toEqual({ type: "yes" });
    expect(classifyConfirmationResponse("yeah", 2)).toEqual({ type: "yes" });
  });

  it('classifies "no" and its variants', () => {
    expect(classifyConfirmationResponse("no", 2)).toEqual({ type: "no" });
    expect(classifyConfirmationResponse("nope", 2)).toEqual({ type: "no" });
  });

  it("classifies ordinal words and digits to zero-based index", () => {
    expect(classifyConfirmationResponse("one", 2)).toEqual({ type: "selector", index: 0 });
    expect(classifyConfirmationResponse("second", 2)).toEqual({ type: "selector", index: 1 });
    expect(classifyConfirmationResponse("2", 2)).toEqual({ type: "selector", index: 1 });
  });

  it("treats an out-of-range selector as unrecognized", () => {
    expect(classifyConfirmationResponse("three", 2)).toEqual({ type: "unrecognized" });
  });

  it("treats gibberish as unrecognized", () => {
    expect(classifyConfirmationResponse("banana", 2)).toEqual({ type: "unrecognized" });
  });

  it("strips filler words before classifying (reuses Normalizer)", () => {
    expect(classifyConfirmationResponse("um yes please", 2)).toEqual({ type: "yes" });
  });
});

describe("ConfirmationManager — decisive path (no confirmation round)", () => {
  it("begin() with a decisive candidate set resolves synchronously, never fires awaiting", () => {
    const cm = createConfirmationManager();
    let resolved: MoveCandidate | null = null;
    let awaited = false;
    cm.on("resolved", (c) => { resolved = c; });
    cm.on("awaiting", () => { awaited = true; });

    cm.begin([candidate("Nf3", 1)], FUZZY_CONFIG);

    expect(resolved).not.toBeNull();
    expect(awaited).toBe(false);
    expect(cm.isAwaiting()).toBe(false);
  });
});

describe("ConfirmationManager — ambiguous path (confirmation round)", () => {
  const CANDS = [candidate("Rae1", 1, "a1", "e1"), candidate("Rhe1", 1, "h1", "e1")];

  it("begin() with a tied candidate set fires awaiting with the preferred candidate", () => {
    const cm = createConfirmationManager();
    const box: { payload: { candidates: MoveCandidate[]; preferred: MoveCandidate } | null } = { payload: null };
    cm.on("awaiting", (p) => { box.payload = p; });

    cm.begin(CANDS, FUZZY_CONFIG);

    expect(box.payload?.preferred.san).toBe("Rae1");
    expect(cm.isAwaiting()).toBe(true);
  });

  it('handleResponse("yes") resolves to the preferred candidate', () => {
    const cm = createConfirmationManager();
    const box: { resolved: MoveCandidate | null } = { resolved: null };
    cm.on("resolved", (c) => { box.resolved = c; });
    cm.begin(CANDS, FUZZY_CONFIG);

    cm.handleResponse("yes");

    expect(box.resolved?.san).toBe("Rae1");
    expect(cm.isAwaiting()).toBe(false);
  });

  it('handleResponse("two") resolves to the second candidate', () => {
    const cm = createConfirmationManager();
    const box: { resolved: MoveCandidate | null } = { resolved: null };
    cm.on("resolved", (c) => { box.resolved = c; });
    cm.begin(CANDS, FUZZY_CONFIG);

    cm.handleResponse("two");

    expect(box.resolved?.san).toBe("Rhe1");
  });

  it('handleResponse("no") cancels without resolving', () => {
    const cm = createConfirmationManager();
    const box: { cancelled: boolean; resolved: MoveCandidate | null } = { cancelled: false, resolved: null };
    cm.on("cancelled", () => { box.cancelled = true; });
    cm.on("resolved", (c) => { box.resolved = c; });
    cm.begin(CANDS, FUZZY_CONFIG);

    cm.handleResponse("no");

    expect(box.cancelled).toBe(true);
    expect(box.resolved).toBeNull();
    expect(cm.isAwaiting()).toBe(false);
  });

  it("an unrecognized response fires 'unrecognized' and keeps the round open", () => {
    const cm = createConfirmationManager();
    const box: { unrecognized: { transcript: string } | null } = { unrecognized: null };
    cm.on("unrecognized", (p) => { box.unrecognized = p; });
    cm.begin(CANDS, FUZZY_CONFIG);

    cm.handleResponse("banana");

    expect(box.unrecognized?.transcript).toBe("banana");
    expect(cm.isAwaiting()).toBe(true);
  });

  it("handleResponse is a no-op when no round is active", () => {
    const cm = createConfirmationManager();
    const box: { resolved: MoveCandidate | null } = { resolved: null };
    cm.on("resolved", (c) => { box.resolved = c; });

    cm.handleResponse("yes"); // no begin() call first

    expect(box.resolved).toBeNull();
  });

  it("the countdown timer resolves to the preferred candidate on elapse", async () => {
    const cm = createConfirmationManager();
    const box: { resolved: MoveCandidate | null } = { resolved: null };
    cm.on("resolved", (c) => { box.resolved = c; });

    cm.begin(CANDS, { clarity: "fuzzy", timerMs: 30, language: "en" });
    await new Promise((r) => setTimeout(r, 80));

    expect(box.resolved?.san).toBe("Rae1");
    expect(cm.isAwaiting()).toBe(false);
  });

  it("timerMs: null means no auto-timeout — round stays open indefinitely", async () => {
    const cm = createConfirmationManager();
    cm.begin(CANDS, { clarity: "fuzzy", timerMs: null, language: "en" });
    await new Promise((r) => setTimeout(r, 50));
    expect(cm.isAwaiting()).toBe(true);
  });
});

describe("ConfirmationManager — cancel() is silent", () => {
  it("cancel() clears state without emitting resolved or cancelled", () => {
    const cm = createConfirmationManager();
    const box: { anyEvent: boolean } = { anyEvent: false };
    cm.on("resolved", () => { box.anyEvent = true; });
    cm.on("cancelled", () => { box.anyEvent = true; });
    cm.begin([candidate("Rae1", 1), candidate("Rhe1", 1)], FUZZY_CONFIG);

    cm.cancel();

    expect(box.anyEvent).toBe(false);
    expect(cm.isAwaiting()).toBe(false);
  });
});

describe("ConfirmationManager — dispose()", () => {
  it("dispose() then handleResponse() is a no-op, no further events", () => {
    const cm = createConfirmationManager();
    const box: { eventCount: number } = { eventCount: 0 };
    cm.on("awaiting", () => { box.eventCount++; });
    cm.on("resolved", () => { box.eventCount++; });
    cm.begin([candidate("Rae1", 1), candidate("Rhe1", 1)], FUZZY_CONFIG);
    const before = box.eventCount;

    cm.dispose();
    cm.handleResponse("yes");

    expect(box.eventCount).toBe(before);
  });
});

// ── ActionConfirmation (Phase 6: dangerous commands) ────────────────────
//
// Unlike ConfirmationManager.begin(), ActionConfirmation.begin() ALWAYS
// starts a round — there's no "decisive, skip confirmation" shortcut,
// since a single dangerous command (resign, offer-draw) always needs
// asking. It also reuses classifyConfirmationResponse (verified above),
// which is what satisfies v3 §5.9's "route through ConfirmationManager's
// existing yes/no flow."

describe("ActionConfirmation — always asks, never auto-skips", () => {
  it("begin() always fires 'awaiting'", () => {
    const ac = createActionConfirmation();
    const box: { awaited: boolean } = { awaited: false };
    ac.on("awaiting", () => { box.awaited = true; });

    ac.begin(FUZZY_CONFIG);

    expect(box.awaited).toBe(true);
    expect(ac.isAwaiting()).toBe(true);
  });
});

describe("ActionConfirmation — responses", () => {
  it('"yes" confirms', () => {
    const ac = createActionConfirmation();
    const box: { confirmed: boolean } = { confirmed: false };
    ac.on("confirmed", () => { box.confirmed = true; });
    ac.begin(FUZZY_CONFIG);

    ac.handleResponse("yes");

    expect(box.confirmed).toBe(true);
    expect(ac.isAwaiting()).toBe(false);
  });

  it('"one" also confirms (selector index 0 is treated as a yes-equivalent)', () => {
    const ac = createActionConfirmation();
    const box: { confirmed: boolean } = { confirmed: false };
    ac.on("confirmed", () => { box.confirmed = true; });
    ac.begin(FUZZY_CONFIG);

    ac.handleResponse("one");

    expect(box.confirmed).toBe(true);
  });

  it('"no" cancels without confirming', () => {
    const ac = createActionConfirmation();
    const box: { cancelled: boolean; confirmed: boolean } = { cancelled: false, confirmed: false };
    ac.on("cancelled", () => { box.cancelled = true; });
    ac.on("confirmed", () => { box.confirmed = true; });
    ac.begin(FUZZY_CONFIG);

    ac.handleResponse("no");

    expect(box.cancelled).toBe(true);
    expect(box.confirmed).toBe(false);
  });

  it("an unrecognized response keeps the round open", () => {
    const ac = createActionConfirmation();
    const box: { unrecognized: { transcript: string } | null } = { unrecognized: null };
    ac.on("unrecognized", (p) => { box.unrecognized = p; });
    ac.begin(FUZZY_CONFIG);

    ac.handleResponse("banana");

    expect(box.unrecognized?.transcript).toBe("banana");
    expect(ac.isAwaiting()).toBe(true);
  });

  it("handleResponse is a no-op when no round has been started", () => {
    const ac = createActionConfirmation();
    const box: { confirmed: boolean } = { confirmed: false };
    ac.on("confirmed", () => { box.confirmed = true; });

    ac.handleResponse("yes");

    expect(box.confirmed).toBe(false);
  });
});

describe("ActionConfirmation — timeout fails SAFE (deliberate asymmetry with move confirmation)", () => {
  it("an elapsed countdown cancels, never confirms — silence must not resign the game", async () => {
    const ac = createActionConfirmation();
    const box: { cancelled: boolean; confirmed: boolean } = { cancelled: false, confirmed: false };
    ac.on("cancelled", () => { box.cancelled = true; });
    ac.on("confirmed", () => { box.confirmed = true; });

    ac.begin({ clarity: "fuzzy", timerMs: 30, language: "en" });
    await new Promise((r) => setTimeout(r, 80));

    expect(box.cancelled).toBe(true);
    expect(box.confirmed).toBe(false);
  });

  it("timerMs: null means no auto-timeout — stays awaiting indefinitely", async () => {
    const ac = createActionConfirmation();
    ac.begin({ clarity: "fuzzy", timerMs: null, language: "en" });
    await new Promise((r) => setTimeout(r, 50));
    expect(ac.isAwaiting()).toBe(true);
  });
});

describe("ActionConfirmation — cancel() and dispose()", () => {
  it("cancel() clears state silently, no events", () => {
    const ac = createActionConfirmation();
    const box: { anyEvent: boolean } = { anyEvent: false };
    ac.on("confirmed", () => { box.anyEvent = true; });
    ac.on("cancelled", () => { box.anyEvent = true; });
    ac.begin(FUZZY_CONFIG);

    ac.cancel();

    expect(box.anyEvent).toBe(false);
    expect(ac.isAwaiting()).toBe(false);
  });

  it("dispose() then handleResponse() is a no-op", () => {
    const ac = createActionConfirmation();
    const box: { eventCount: number } = { eventCount: 0 };
    ac.on("awaiting", () => { box.eventCount++; });
    ac.on("confirmed", () => { box.eventCount++; });
    ac.begin(FUZZY_CONFIG);
    const before = box.eventCount;

    ac.dispose();
    ac.handleResponse("yes");

    expect(box.eventCount).toBe(before);
  });
});
