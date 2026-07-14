// src/lib/voice/controller/VoiceSession.test.ts
//
// Run with: bun test
//
// Every scenario here was run against real compiled output before being
// written into this file, not hand-derived. The fake recognizer factory
// matches RecognizerFactory's real shape exactly, so these tests exercise
// the actual pipeline end-to-end (Normalizer -> IntentParser ->
// CandidateGenerator -> MoveRanker -> ConfirmationManager -> ChessAdapter),
// just without a live browser.
//
// NOTE ON PATTERN: values captured from event callbacks use a small
// `{ value: T | null }` box object rather than a bare `let x = null`
// variable — a bare `let` reassigned only inside a closure was found to be
// over-narrowed to `never` by at least one TypeScript compiler version
// (see commit notes). The box pattern sidesteps that and is more robust
// across TS versions.

import { describe, expect, it } from "bun:test";
import { createVoiceEngine } from "./VoiceEngine";
import { createTestChessAdapter } from "../adapters/ChessAdapter";
import { VoiceState } from "./VoiceState";
import type { RecognitionCallbacks, RecognizerFactory } from "../recognition/BrowserRecognizer";
import type { VoiceError, MoveCandidate } from "../types";

interface FakeRecognizer {
  factory: RecognizerFactory;
  trigger: (transcript: string, confidence?: number) => void;
  triggerError: (err: VoiceError) => void;
  wasStopped: () => boolean;
  startCount: () => number;
}

function makeFakeRecognizer(): FakeRecognizer {
  const box: { callbacks: RecognitionCallbacks | null; stopped: boolean; starts: number } = {
    callbacks: null,
    stopped: false,
    starts: 0,
  };
  const factory: RecognizerFactory = (callbacks) => {
    box.callbacks = callbacks;
    box.stopped = false;
    box.starts++;
    return { stop: () => { box.stopped = true; } };
  };
  return {
    factory,
    trigger: (transcript, confidence) => box.callbacks!.onResult({ transcript, isFinal: true, confidence }),
    triggerError: (err) => box.callbacks!.onError?.(err),
    wasStopped: () => box.stopped,
    startCount: () => box.starts,
  };
}

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// Rooks on a1 and h1, e1 empty, kings not blocking — genuine two-rook ambiguity to e1.
const AMBIG_FEN = "4k3/8/8/8/8/8/3K4/R6R w - - 0 1";

describe("VoiceSession — single-candidate auto-commit path (unambiguous)", () => {
  it("executes the move, emits moveCommitted, and returns to Idle without ever entering AwaitingConfirmation", () => {
    const fake = makeFakeRecognizer();
    const engine = createVoiceEngine(fake.factory);
    const box: { executed: unknown; committed: unknown } = { executed: null, committed: null };
    const adapter = createTestChessAdapter(START_FEN, (m) => { box.executed = m; });
    const session = engine.createSession(adapter);

    const states: VoiceState[] = [];
    session.on("stateChange", (s) => states.push(s));
    session.on("moveCommitted", (m) => { box.committed = m; });

    session.start();
    fake.trigger("knight f3");

    expect(box.executed).toEqual({ from: "g1", to: "f3", promotion: undefined });
    expect(box.committed).toEqual({ from: "g1", to: "f3", promotion: undefined });
    expect(states).toEqual([
      VoiceState.Listening,
      VoiceState.Parsing,
      VoiceState.Ranking,
      VoiceState.Executing,
      VoiceState.Idle,
    ]);
  });
});

describe("VoiceSession — ambiguity triggers a confirmation round (Phase 5)", () => {
  it("emits candidates, transitions to AwaitingConfirmation, and does not execute until resolved", () => {
    const fake = makeFakeRecognizer();
    const engine = createVoiceEngine(fake.factory);
    const box: { executed: unknown; candidates: MoveCandidate[] | null } = { executed: null, candidates: null };
    const adapter = createTestChessAdapter(AMBIG_FEN, (m) => { box.executed = m; });
    const session = engine.createSession(adapter);

    session.on("candidates", (c) => { box.candidates = c; });
    const states: VoiceState[] = [];
    session.on("stateChange", (s) => states.push(s));

    session.start();
    fake.trigger("rook to e one");

    expect(box.executed).toBeNull();
    expect(box.candidates?.length).toBe(2);
    expect(states[states.length - 1]).toBe(VoiceState.AwaitingConfirmation);
    // The mic reopens automatically to capture the confirmation reply.
    expect(fake.startCount()).toBe(2);
  });

  it('resolves via a selector ("one") and commits the corresponding candidate', () => {
    const fake = makeFakeRecognizer();
    const engine = createVoiceEngine(fake.factory);
    const box: { executed: { from: string; to: string } | null; committed: unknown } = {
      executed: null,
      committed: null,
    };
    const adapter = createTestChessAdapter(AMBIG_FEN, (m) => { box.executed = m; });
    const session = engine.createSession(adapter);
    session.on("moveCommitted", (m) => { box.committed = m; });
    const states: VoiceState[] = [];
    session.on("stateChange", (s) => states.push(s));

    session.start();
    fake.trigger("rook to e one");
    fake.trigger("one");

    expect(box.executed?.from).toBe("a1");
    expect(box.executed?.to).toBe("e1");
    expect(box.committed).not.toBeNull();
    expect(states[states.length - 1]).toBe(VoiceState.Idle);
  });

  it('resolves via "yes" and commits the preferred (first-ranked) candidate', () => {
    const fake = makeFakeRecognizer();
    const engine = createVoiceEngine(fake.factory);
    const box: { executed: { from: string } | null } = { executed: null };
    const adapter = createTestChessAdapter(AMBIG_FEN, (m) => { box.executed = m; });
    const session = engine.createSession(adapter);

    session.start();
    fake.trigger("rook to e one");
    fake.trigger("yes");

    expect(box.executed?.from).toBe("a1"); // Rae1 is ranked first
  });

  it('"no" cancels the round, returns to Listening, and a fresh move works normally afterward', () => {
    const fake = makeFakeRecognizer();
    const engine = createVoiceEngine(fake.factory);
    const box: { executed: { from: string; to: string } | null } = { executed: null };
    const adapter = createTestChessAdapter(AMBIG_FEN, (m) => { box.executed = m; });
    const session = engine.createSession(adapter);
    const states: VoiceState[] = [];
    session.on("stateChange", (s) => states.push(s));

    session.start();
    fake.trigger("rook to e one");
    fake.trigger("no");

    expect(states[states.length - 1]).toBe(VoiceState.Listening);
    expect(box.executed).toBeNull();

    // A subsequent, unambiguous move phrase should work exactly as normal.
    fake.trigger("king d3");
    expect(box.executed).toEqual({ from: "d2", to: "d3" });
  });

  it("an unrecognized response surfaces an error, stays in AwaitingConfirmation, and re-listens", () => {
    const fake = makeFakeRecognizer();
    const engine = createVoiceEngine(fake.factory);
    const session = engine.createSession(createTestChessAdapter(AMBIG_FEN));
    const box: { errors: VoiceError[] } = { errors: [] };
    session.on("error", (e) => { box.errors.push(e); });
    const states: VoiceState[] = [];
    session.on("stateChange", (s) => states.push(s));

    session.start();
    fake.trigger("rook to e one");
    fake.trigger("banana");

    expect(box.errors.length).toBe(1);
    expect(box.errors[0].code).toBe("parse-fail");
    expect(states[states.length - 1]).toBe(VoiceState.AwaitingConfirmation);
    expect(fake.startCount()).toBe(3); // initial + confirmation reply + retry after unrecognized

    // Recovery: a valid response afterward still resolves correctly.
    fake.trigger("yes");
    expect(states[states.length - 1]).toBe(VoiceState.Idle);
  });

  it("dispose() during an active confirmation round tears down cleanly with no further events", () => {
    const fake = makeFakeRecognizer();
    const engine = createVoiceEngine(fake.factory);
    const session = engine.createSession(createTestChessAdapter(AMBIG_FEN));

    session.start();
    fake.trigger("rook to e one");

    const box: { eventCount: number } = { eventCount: 0 };
    session.on("stateChange", () => { box.eventCount++; });
    session.dispose();

    expect(fake.wasStopped()).toBe(true);
    fake.trigger("yes"); // should not throw or fire anything
    expect(box.eventCount).toBe(0);
  });
});

describe("VoiceSession — error paths", () => {
  it('emits "no-speech" for an empty transcript', () => {
    const fake = makeFakeRecognizer();
    const engine = createVoiceEngine(fake.factory);
    const session = engine.createSession(createTestChessAdapter(START_FEN));
    const box: { error: VoiceError | null } = { error: null };
    session.on("error", (e) => { box.error = e; });

    session.start();
    fake.trigger("");

    expect(box.error?.code).toBe("no-speech");
  });

  it('emits "parse-fail" for unrecognized gibberish', () => {
    const fake = makeFakeRecognizer();
    const engine = createVoiceEngine(fake.factory);
    const session = engine.createSession(createTestChessAdapter(START_FEN));
    const box: { error: VoiceError | null } = { error: null };
    session.on("error", (e) => { box.error = e; });

    session.start();
    fake.trigger("gibberish nonsense");

    expect(box.error?.code).toBe("parse-fail");
  });

  it('emits "illegal" when the phrase parses but matches no legal move', () => {
    const fake = makeFakeRecognizer();
    const engine = createVoiceEngine(fake.factory);
    const session = engine.createSession(createTestChessAdapter(START_FEN));
    const box: { error: VoiceError | null } = { error: null };
    session.on("error", (e) => { box.error = e; });

    session.start();
    fake.trigger("knight to a1"); // occupied by own rook

    expect(box.error?.code).toBe("illegal");
  });

  it('emits "asr-error" when the recognizer factory fails to start (returns null)', () => {
    const nullFactory: RecognizerFactory = () => null;
    const engine = createVoiceEngine(nullFactory);
    const session = engine.createSession(createTestChessAdapter(START_FEN));
    const box: { error: VoiceError | null } = { error: null };
    session.on("error", (e) => { box.error = e; });

    session.start();

    expect(box.error?.code).toBe("asr-error");
  });

  it("propagates a recognizer-reported error", () => {
    const fake = makeFakeRecognizer();
    const engine = createVoiceEngine(fake.factory);
    const session = engine.createSession(createTestChessAdapter(START_FEN));
    const box: { error: VoiceError | null } = { error: null };
    session.on("error", (e) => { box.error = e; });

    session.start();
    fake.triggerError({ code: "asr-error", message: "network" });

    expect(box.error?.code).toBe("asr-error");
  });
});

describe("VoiceSession — lifecycle", () => {
  it("start() is a no-op if already active (does not call recognizerFactory twice)", () => {
    const box: { callCount: number } = { callCount: 0 };
    const fake = makeFakeRecognizer();
    const countingFactory: RecognizerFactory = (cb) => {
      box.callCount++;
      return fake.factory(cb);
    };
    const engine = createVoiceEngine(countingFactory);
    const session = engine.createSession(createTestChessAdapter(START_FEN));

    session.start();
    session.start();

    expect(box.callCount).toBe(1);
  });

  it("stop() calls the recognizer handle's stop()", () => {
    const fake = makeFakeRecognizer();
    const engine = createVoiceEngine(fake.factory);
    const session = engine.createSession(createTestChessAdapter(START_FEN));

    session.start();
    session.stop();

    expect(fake.wasStopped()).toBe(true);
  });

  it("dispose() stops the recognizer and clears all subscriptions", () => {
    const fake = makeFakeRecognizer();
    const engine = createVoiceEngine(fake.factory);
    const session = engine.createSession(createTestChessAdapter(START_FEN));

    const box: { eventCount: number; countBeforeDispose: number } = { eventCount: 0, countBeforeDispose: 0 };
    session.on("stateChange", () => { box.eventCount++; });
    session.start();
    box.countBeforeDispose = box.eventCount;

    session.dispose();
    expect(fake.wasStopped()).toBe(true);

    fake.trigger("knight f3");
    expect(box.eventCount).toBe(box.countBeforeDispose);
  });

  it("on() returns a working unsubscribe function", () => {
    const fake = makeFakeRecognizer();
    const engine = createVoiceEngine(fake.factory);
    const session = engine.createSession(createTestChessAdapter(START_FEN));

    const box: { count: number; countAfterStart: number } = { count: 0, countAfterStart: 0 };
    const unsubscribe = session.on("stateChange", () => { box.count++; });
    session.start();
    box.countAfterStart = box.count;

    unsubscribe();
    fake.trigger("knight f3");

    expect(box.count).toBe(box.countAfterStart);
  });
});

describe("VoiceSession — commands (Phase 6)", () => {
  it("a non-dangerous command (undo) fires 'command' immediately with no confirmation round", () => {
    const fake = makeFakeRecognizer();
    const engine = createVoiceEngine(fake.factory);
    const session = engine.createSession(createTestChessAdapter(START_FEN));
    const box: { command: unknown } = { command: null };
    session.on("command", (c) => { box.command = c; });
    const states: VoiceState[] = [];
    session.on("stateChange", (s) => states.push(s));

    session.start();
    fake.trigger("undo");

    expect(box.command).toEqual({ type: "undo" });
    expect(states.includes(VoiceState.AwaitingConfirmation)).toBe(false);
    expect(states[states.length - 1]).toBe(VoiceState.Idle);
    expect(fake.startCount()).toBe(1); // mic not reopened, no confirmation needed
  });

  it("a non-dangerous command (flip-board) fires 'command' immediately", () => {
    const fake = makeFakeRecognizer();
    const engine = createVoiceEngine(fake.factory);
    const session = engine.createSession(createTestChessAdapter(START_FEN));
    const box: { command: unknown } = { command: null };
    session.on("command", (c) => { box.command = c; });

    session.start();
    fake.trigger("flip board");

    expect(box.command).toEqual({ type: "flip-board" });
  });

  it("a dangerous command (resign) requires confirmation before firing 'command'", () => {
    const fake = makeFakeRecognizer();
    const engine = createVoiceEngine(fake.factory);
    const session = engine.createSession(createTestChessAdapter(START_FEN));
    const box: { command: unknown } = { command: null };
    session.on("command", (c) => { box.command = c; });
    const states: VoiceState[] = [];
    session.on("stateChange", (s) => states.push(s));

    session.start();
    fake.trigger("resign");

    expect(box.command).toBeNull();
    expect(states[states.length - 1]).toBe(VoiceState.AwaitingConfirmation);
    expect(fake.startCount()).toBe(2); // mic reopened for the yes/no reply

    fake.trigger("yes");
    expect(box.command).toEqual({ type: "resign" });
    expect(states[states.length - 1]).toBe(VoiceState.Idle);
  });

  it('a dangerous command cancelled with "no" never fires \'command\' and returns to Listening', () => {
    const fake = makeFakeRecognizer();
    const engine = createVoiceEngine(fake.factory);
    const session = engine.createSession(createTestChessAdapter(START_FEN));
    const box: { command: unknown } = { command: null };
    session.on("command", (c) => { box.command = c; });
    const states: VoiceState[] = [];
    session.on("stateChange", (s) => states.push(s));

    session.start();
    fake.trigger("offer draw");
    fake.trigger("no");

    expect(box.command).toBeNull();
    expect(states[states.length - 1]).toBe(VoiceState.Listening);
  });

  it("an unrecognized response during command confirmation surfaces an error and stays awaiting", () => {
    const fake = makeFakeRecognizer();
    const engine = createVoiceEngine(fake.factory);
    const session = engine.createSession(createTestChessAdapter(START_FEN));
    const box: { errors: VoiceError[] } = { errors: [] };
    session.on("error", (e) => { box.errors.push(e); });
    const states: VoiceState[] = [];
    session.on("stateChange", (s) => states.push(s));

    session.start();
    fake.trigger("resign");
    fake.trigger("banana");

    expect(box.errors.length).toBe(1);
    expect(box.errors[0].code).toBe("parse-fail");
    expect(states[states.length - 1]).toBe(VoiceState.AwaitingConfirmation);
    expect(fake.startCount()).toBe(3);
  });

  it("a command phrase never falls through to the move pipeline (no executeMove attempt)", () => {
    const fake = makeFakeRecognizer();
    const engine = createVoiceEngine(fake.factory);
    const box: { executed: unknown } = { executed: null };
    const session = engine.createSession(createTestChessAdapter(START_FEN, (m) => { box.executed = m; }));

    session.start();
    fake.trigger("undo");

    expect(box.executed).toBeNull();
  });

  it("dispose() during a dangerous-command confirmation round tears down cleanly", () => {
    const fake = makeFakeRecognizer();
    const engine = createVoiceEngine(fake.factory);
    const session = engine.createSession(createTestChessAdapter(START_FEN));

    session.start();
    fake.trigger("resign");

    const box: { eventCount: number } = { eventCount: 0 };
    session.on("stateChange", () => { box.eventCount++; });
    session.dispose();

    expect(fake.wasStopped()).toBe(true);
    fake.trigger("yes");
    expect(box.eventCount).toBe(0);
  });
});

describe("VoiceSession — interim (non-final) results are ignored", () => {
  it("does not process a transcript until isFinal is true", () => {
    const box: { callbacks: RecognitionCallbacks | null; executed: unknown } = { callbacks: null, executed: null };
    const factory: RecognizerFactory = (cb) => {
      box.callbacks = cb;
      return { stop: () => {} };
    };
    const engine = createVoiceEngine(factory);
    const session = engine.createSession(createTestChessAdapter(START_FEN, (m) => { box.executed = m; }));

    session.start();
    box.callbacks!.onResult({ transcript: "knight f3", isFinal: false });

    expect(box.executed).toBeNull();
  });
});
