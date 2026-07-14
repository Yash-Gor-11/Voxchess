// src/lib/characters/speech/selectVoice.test.ts
//
// Run with: bun test
//
// Limited scope, same honest reasoning as recognition/BrowserRecognizer.test.ts:
// there's no real SpeechSynthesis in any Node-based test runner. What's
// testable here is inferGender()'s pure logic and selectVoice()'s graceful
// degradation when no browser voice API exists at all.

import { describe, expect, it } from "bun:test";
import { inferGender, selectVoice } from "./selectVoice";

describe("inferGender", () => {
  it("infers female from known female voice name substrings", () => {
    expect(inferGender(["Samantha", "Karen"])).toBe("female");
  });

  it("infers male from known male voice name substrings", () => {
    expect(inferGender(["Alex", "Daniel"])).toBe("male");
  });

  it("returns null when the list is empty", () => {
    expect(inferGender([])).toBeNull();
  });

  it("returns null when female/male signal is tied", () => {
    expect(inferGender(["Alex", "Karen"])).toBeNull();
  });
});

describe("selectVoice — non-browser environment", () => {
  it("returns null gracefully rather than throwing when no window/speechSynthesis exists", () => {
    expect(() => selectVoice(["Alex"])).not.toThrow();
    expect(selectVoice(["Alex"])).toBeNull();
  });
});
