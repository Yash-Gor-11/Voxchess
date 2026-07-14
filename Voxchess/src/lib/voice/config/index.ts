// src/lib/voice/config/index.ts

import type { VoiceConfig } from "../types";
import { DEFAULT_VOICE_CONFIG } from "./defaults";
import { validateVoiceConfig } from "./validation";

export * from "./defaults";
export * from "./validation";
export * from "./serialization";
export * from "./ConfigPersistence";

/**
 * Programmatic construction of a validated, frozen VoiceConfig.
 *
 * Distinct from deserializeVoiceConfig()'s contract on purpose: this
 * THROWS on invalid overrides, since a caller passing bad values here is
 * a programming error (TypeScript's Partial<VoiceConfig> already blocks
 * most invalid values at the call site — this is defense against a cast,
 * `any`, or genuinely external untyped input reaching this path directly
 * instead of going through deserializeVoiceConfig() first, which is the
 * correct entry point for "config that might legitimately be corrupted").
 */
export function createVoiceConfig(overrides?: Partial<VoiceConfig>): Readonly<VoiceConfig> {
  const merged = { ...DEFAULT_VOICE_CONFIG, ...overrides };
  const result = validateVoiceConfig(merged);
  if (!result.valid) {
    const message = result.errors.map((e) => `${e.field}: ${e.message}`).join("; ");
    throw new Error(`Invalid VoiceConfig overrides: ${message}`);
  }
  return Object.freeze(result.config);
}
