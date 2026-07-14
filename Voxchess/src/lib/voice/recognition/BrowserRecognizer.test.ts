// src/lib/voice/recognition/BrowserRecognizer.test.ts
//
// Run with: bun test
//
// Limited scope: there's no real Web Speech API in any test runner
// (Node, bun, jsdom without a polyfill), so this only tests what's
// testable without a live browser: isSpeechSupported()'s guard behavior
// and startRecognition()'s graceful-failure path when unsupported. The
// confidence-capture and error-mapping deltas (see file header comment in
// BrowserRecognizer.ts) are exercised indirectly through VoiceSession's
// tests, which inject a fake RecognizerFactory matching this file's
// exported shape — that's the actual integration point that matters.

import { describe, expect, it } from "bun:test";
import { isSpeechSupported, startRecognition } from "./BrowserRecognizer";

describe("isSpeechSupported", () => {
  it("returns false in a non-browser environment (no window.SpeechRecognition)", () => {
    // This test environment has no window object at all, which is exactly
    // the guard this function is meant to handle gracefully.
    expect(isSpeechSupported()).toBe(false);
  });
});

describe("startRecognition", () => {
  it("returns null rather than throwing when speech is unsupported", () => {
    const handle = startRecognition({ onResult: () => {} });
    expect(handle).toBeNull();
  });
});
