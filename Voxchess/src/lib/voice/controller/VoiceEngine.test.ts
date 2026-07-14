// src/lib/voice/controller/VoiceEngine.test.ts
//
// Run with: bun test

import { describe, expect, it } from "bun:test";
import { createVoiceEngine } from "./VoiceEngine";
import { createTestChessAdapter } from "../adapters/ChessAdapter";
import type { RecognitionCallbacks, RecognizerFactory } from "../recognition/BrowserRecognizer";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function makeNoopFactory(): RecognizerFactory {
  return () => ({ stop: () => {} });
}

describe("createVoiceEngine", () => {
  it("uses the injected recognizerFactory instead of the real BrowserRecognizer", () => {
    const box: { called: boolean } = { called: false };
    const factory: RecognizerFactory = () => {
      box.called = true;
      return { stop: () => {} };
    };
    const engine = createVoiceEngine(factory);
    const session = engine.createSession(createTestChessAdapter(START_FEN));
    session.start();
    expect(box.called).toBe(true);
  });

  it("configure() does not throw and a session created afterward still works end-to-end", () => {
    const box: { callbacks: RecognitionCallbacks | null; committed: unknown } = {
      callbacks: null,
      committed: null,
    };
    const factory: RecognizerFactory = (cb) => {
      box.callbacks = cb;
      return { stop: () => {} };
    };
    const engine = createVoiceEngine(factory);
    engine.configure({ clarity: "clear", timerMs: 1000, language: "en" });

    const adapter = createTestChessAdapter(START_FEN, () => {});
    const session = engine.createSession(adapter);
    session.on("moveCommitted", (m) => { box.committed = m; });

    session.start();
    box.callbacks!.onResult({ transcript: "knight f3", isFinal: true });

    expect(box.committed).not.toBeNull();
  });

  it("createSession returns an independent session each call", () => {
    const engine = createVoiceEngine(makeNoopFactory());
    const adapter = createTestChessAdapter(START_FEN);
    const sessionA = engine.createSession(adapter);
    const sessionB = engine.createSession(adapter);
    expect(sessionA).not.toBe(sessionB);
  });
});
