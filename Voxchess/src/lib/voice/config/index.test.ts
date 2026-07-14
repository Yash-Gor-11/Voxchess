// src/lib/voice/config/index.test.ts
//
// Run with: bun test

import { describe, expect, it } from "bun:test";
import { createVoiceConfig } from "./index";
import { DEFAULT_VOICE_CONFIG } from "./defaults";

describe("createVoiceConfig", () => {
  it("returns the defaults when called with no overrides", () => {
    expect(createVoiceConfig()).toEqual(DEFAULT_VOICE_CONFIG);
  });

  it("applies partial overrides on top of defaults", () => {
    const config = createVoiceConfig({ clarity: "clear" });
    expect(config.clarity).toBe("clear");
    expect(config.timerMs).toBe(DEFAULT_VOICE_CONFIG.timerMs);
    expect(config.language).toBe("en");
  });

  it("returns a frozen object", () => {
    const config = createVoiceConfig();
    expect(Object.isFrozen(config)).toBe(true);
  });

  it("throws for invalid overrides rather than silently falling back", () => {
    // @ts-expect-error deliberately invalid for the test
    expect(() => createVoiceConfig({ clarity: "invalid" })).toThrow();
  });

  it("throws for a negative timerMs override", () => {
    expect(() => createVoiceConfig({ timerMs: -50 })).toThrow();
  });
});
