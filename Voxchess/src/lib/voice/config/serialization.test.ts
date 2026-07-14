// src/lib/voice/config/serialization.test.ts
//
// Run with: bun test

import { describe, expect, it } from "bun:test";
import { serializeVoiceConfig, deserializeVoiceConfig, CONFIG_SCHEMA_VERSION } from "./serialization";
import { DEFAULT_VOICE_CONFIG } from "./defaults";
import type { VoiceConfig } from "../types";

describe("serializeVoiceConfig / deserializeVoiceConfig — round trip", () => {
  it("round-trips a config exactly", () => {
    const config: VoiceConfig = { clarity: "clear", timerMs: 1000, language: "en" };
    const serialized = serializeVoiceConfig(config);
    const result = deserializeVoiceConfig(serialized);
    expect(result.config).toEqual(config);
    expect(result.usedFallback).toBe(false);
  });

  it("round-trips timerMs: null", () => {
    const config: VoiceConfig = { clarity: "fuzzy", timerMs: null, language: "en" };
    const result = deserializeVoiceConfig(serializeVoiceConfig(config));
    expect(result.config).toEqual(config);
  });

  it("includes the current schema version in the serialized form", () => {
    const serialized = serializeVoiceConfig(DEFAULT_VOICE_CONFIG);
    const parsed = JSON.parse(serialized);
    expect(parsed.version).toBe(CONFIG_SCHEMA_VERSION);
  });
});

describe("deserializeVoiceConfig — graceful fallback, never throws", () => {
  it("falls back to defaults for null input", () => {
    const result = deserializeVoiceConfig(null);
    expect(result.config).toEqual(DEFAULT_VOICE_CONFIG);
    expect(result.usedFallback).toBe(true);
  });

  it("falls back to defaults for undefined input", () => {
    const result = deserializeVoiceConfig(undefined);
    expect(result.usedFallback).toBe(true);
  });

  it("falls back to defaults for an empty string", () => {
    const result = deserializeVoiceConfig("");
    expect(result.usedFallback).toBe(true);
  });

  it("falls back to defaults for invalid JSON, without throwing", () => {
    expect(() => deserializeVoiceConfig("{not valid json")).not.toThrow();
    const result = deserializeVoiceConfig("{not valid json");
    expect(result.usedFallback).toBe(true);
    expect(result.errors?.[0]).toMatch(/invalid JSON/);
  });

  it("falls back to defaults for a JSON value that isn't an object", () => {
    const result = deserializeVoiceConfig(JSON.stringify("just a string"));
    expect(result.usedFallback).toBe(true);
  });

  it("falls back to defaults when the versioned config fails validation", () => {
    const badPayload = JSON.stringify({ version: 1, config: { clarity: "invalid", timerMs: 2500, language: "en" } });
    const result = deserializeVoiceConfig(badPayload);
    expect(result.usedFallback).toBe(true);
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it("falls back to defaults for an unrecognized schema version", () => {
    const result = deserializeVoiceConfig(JSON.stringify({ version: 999, config: DEFAULT_VOICE_CONFIG }));
    expect(result.usedFallback).toBe(true);
  });
});

describe("deserializeVoiceConfig — legacy unversioned config support", () => {
  it("treats a bare VoiceConfig-shaped object (no version wrapper) as implicit v1", () => {
    const bare = JSON.stringify({ clarity: "clear", timerMs: 500, language: "en" });
    const result = deserializeVoiceConfig(bare);
    expect(result.usedFallback).toBe(false);
    expect(result.config).toEqual({ clarity: "clear", timerMs: 500, language: "en" });
  });
});
