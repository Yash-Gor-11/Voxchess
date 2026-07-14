// src/lib/voice/config/validation.test.ts
//
// Run with: bun test

import { describe, expect, it } from "bun:test";
import { validateVoiceConfig } from "./validation";

describe("validateVoiceConfig — valid input", () => {
  it("accepts a fully valid config", () => {
    const result = validateVoiceConfig({ clarity: "fuzzy", timerMs: 2500, language: "en" });
    expect(result.valid).toBe(true);
  });

  it("accepts timerMs: null", () => {
    const result = validateVoiceConfig({ clarity: "clear", timerMs: null, language: "en" });
    expect(result.valid).toBe(true);
  });

  it("accepts timerMs: 0", () => {
    const result = validateVoiceConfig({ clarity: "fuzzy", timerMs: 0, language: "en" });
    expect(result.valid).toBe(true);
  });
});

describe("validateVoiceConfig — invalid input", () => {
  it("rejects a non-object", () => {
    expect(validateVoiceConfig(null).valid).toBe(false);
    expect(validateVoiceConfig("hello").valid).toBe(false);
    expect(validateVoiceConfig(42).valid).toBe(false);
  });

  it("rejects an invalid clarity value", () => {
    const result = validateVoiceConfig({ clarity: "medium", timerMs: 2500, language: "en" });
    expect(result.valid).toBe(false);
  });

  it("rejects a negative timerMs", () => {
    const result = validateVoiceConfig({ clarity: "fuzzy", timerMs: -100, language: "en" });
    expect(result.valid).toBe(false);
  });

  it("rejects a non-numeric, non-null timerMs", () => {
    const result = validateVoiceConfig({ clarity: "fuzzy", timerMs: "2500", language: "en" });
    expect(result.valid).toBe(false);
  });

  it("rejects an unsupported language", () => {
    const result = validateVoiceConfig({ clarity: "fuzzy", timerMs: 2500, language: "fr" });
    expect(result.valid).toBe(false);
  });

  it("reports every invalid field, not just the first", () => {
    const result = validateVoiceConfig({ clarity: "bad", timerMs: -1, language: "fr" });
    if (result.valid) throw new Error("expected invalid");
    expect(result.errors.length).toBe(3);
  });
});
