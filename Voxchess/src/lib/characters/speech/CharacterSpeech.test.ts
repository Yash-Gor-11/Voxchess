// src/lib/characters/speech/CharacterSpeech.test.ts
//
// Run with: bun test
//
// Same honest scope limitation as BrowserRecognizer/selectVoice: no real
// Audio/SpeechSynthesis exists in this test environment. What IS verified:
// the module never throws when browser APIs are absent, and onComplete
// still fires so callers relying on it (per this module's design — see
// CharacterSpeech.ts's header on the play.tsx timeout-vs-event-driven
// divergence) don't hang waiting for a completion that will never
// naturally occur without real Audio/TTS.

import { describe, expect, it } from "bun:test";
import { createCharacterSpeech } from "./CharacterSpeech";

const VOICE = { pitch: 1, rate: 1, volume: 1, preferredVoices: ["Alex"] };

describe("CharacterSpeech — non-browser environment", () => {
  it("speak() does not throw when no Audio/window API exists", () => {
    const cs = createCharacterSpeech();
    expect(() => cs.speak("hello", { characterId: "frost", voice: VOICE })).not.toThrow();
  });

  it("speak() still calls onComplete even with no browser APIs available", () => {
    const cs = createCharacterSpeech();
    const box: { completed: boolean } = { completed: false };
    cs.speak("hello", { characterId: "frost", voice: VOICE, onComplete: () => { box.completed = true; } });
    expect(box.completed).toBe(true);
  });

  it("stop() is safe to call with nothing in flight", () => {
    const cs = createCharacterSpeech();
    expect(() => cs.stop()).not.toThrow();
  });

  it("stop() is safe to call repeatedly", () => {
    const cs = createCharacterSpeech();
    cs.stop();
    expect(() => cs.stop()).not.toThrow();
  });

  it("each controller instance is independent (no shared module-level audio state)", () => {
    const csA = createCharacterSpeech();
    const csB = createCharacterSpeech();
    const box: { aCompleted: boolean; bCompleted: boolean } = { aCompleted: false, bCompleted: false };
    csA.speak("a", { characterId: "frost", voice: VOICE, onComplete: () => { box.aCompleted = true; } });
    csB.speak("b", { characterId: "sterling", voice: VOICE, onComplete: () => { box.bCompleted = true; } });
    expect(box.aCompleted).toBe(true);
    expect(box.bCompleted).toBe(true);
  });
});
