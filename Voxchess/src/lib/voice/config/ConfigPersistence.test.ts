// src/lib/voice/config/ConfigPersistence.test.ts
//
// Run with: bun test
//
// Uses an in-memory fake adapter to verify the load/save helper wiring —
// no real storage mechanism is part of this module (see file header in
// ConfigPersistence.ts), so a fake is the correct test double here, not a
// gap.

import { describe, expect, it } from "bun:test";
import { loadVoiceConfig, saveVoiceConfig, type ConfigPersistenceAdapter } from "./ConfigPersistence";
import { DEFAULT_VOICE_CONFIG } from "./defaults";
import type { VoiceConfig } from "../types";

function createFakeAdapter(initial: string | null = null): ConfigPersistenceAdapter & { getStored: () => string | null } {
  let stored: string | null = initial;
  return {
    load: async () => stored,
    save: async (serialized) => { stored = serialized; },
    getStored: () => stored,
  };
}

describe("loadVoiceConfig", () => {
  it("returns defaults when the adapter has nothing stored", async () => {
    const adapter = createFakeAdapter(null);
    const result = await loadVoiceConfig(adapter);
    expect(result.config).toEqual(DEFAULT_VOICE_CONFIG);
    expect(result.usedFallback).toBe(true);
  });

  it("returns the stored config when present and valid", async () => {
    const config: VoiceConfig = { clarity: "clear", timerMs: 1500, language: "en" };
    const adapter = createFakeAdapter(JSON.stringify({ version: 1, config }));
    const result = await loadVoiceConfig(adapter);
    expect(result.config).toEqual(config);
    expect(result.usedFallback).toBe(false);
  });
});

describe("saveVoiceConfig", () => {
  it("persists a serialized, versioned form the adapter can round-trip", async () => {
    const adapter = createFakeAdapter();
    const config: VoiceConfig = { clarity: "clear", timerMs: 800, language: "en" };

    await saveVoiceConfig(adapter, config);
    const result = await loadVoiceConfig(adapter);

    expect(result.config).toEqual(config);
    expect(result.usedFallback).toBe(false);
  });
});
