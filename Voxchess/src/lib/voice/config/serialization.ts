// src/lib/voice/config/serialization.ts
//
// Versioned persistence format for VoiceConfig, separate from the runtime
// VoiceConfig type itself (which has no version field — that's purely a
// persistence-layer concern, kept out of the shape controller/matching
// code depends on).

import type { VoiceConfig } from "../types";
import { validateVoiceConfig } from "./validation";
import { DEFAULT_VOICE_CONFIG } from "./defaults";

export const CONFIG_SCHEMA_VERSION = 1 as const;

export interface PersistedVoiceConfigV1 {
  version: 1;
  config: VoiceConfig;
}

/**
 * The union of every schema version ever persisted. Extend this (e.g.
 * `| PersistedVoiceConfigV2`) when a future field change needs a new
 * version — migrateToLatest() is the seam that handles converting older
 * shapes forward, so callers never see anything but the current version.
 */
export type PersistedVoiceConfig = PersistedVoiceConfigV1;

export function serializeVoiceConfig(config: VoiceConfig): string {
  const payload: PersistedVoiceConfigV1 = { version: CONFIG_SCHEMA_VERSION, config };
  return JSON.stringify(payload);
}

export interface DeserializeResult {
  config: VoiceConfig;
  /** True if the input was missing, malformed, unversioned, or invalid and defaults were substituted. */
  usedFallback: boolean;
  errors?: string[];
}

/**
 * Migration entry point. Only version 1 exists today — this is where a
 * hypothetical v2 would branch and transform v1 -> v2 shape, rather than
 * scattering version-handling logic throughout the codebase. Also accepts
 * a bare (unversioned) VoiceConfig-shaped object as an implicit v1, for
 * backward compatibility with anything saved before this module existed.
 */
function migrateToLatest(data: Record<string, unknown>): PersistedVoiceConfigV1 | null {
  if (data.version === 1 && typeof data.config === "object" && data.config !== null) {
    return data as unknown as PersistedVoiceConfigV1;
  }

  if (data.version === undefined && ("clarity" in data || "timerMs" in data || "language" in data)) {
    return { version: 1, config: data as unknown as VoiceConfig };
  }

  return null;
}


/**
 * Deserializes a persisted config string. Never throws — always returns a
 * usable VoiceConfig, falling back to defaults on any problem (missing
 * input, invalid JSON, unrecognized version, failed validation), since a
 * corrupted settings blob should degrade gracefully rather than crash
 * voice engine startup. `usedFallback`/`errors` let a caller log or
 * surface a "your voice settings were reset" notice if it wants to.
 */
export function deserializeVoiceConfig(raw: string | null | undefined): DeserializeResult {
  if (!raw) {
    return { config: DEFAULT_VOICE_CONFIG, usedFallback: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { config: DEFAULT_VOICE_CONFIG, usedFallback: true, errors: ["invalid JSON"] };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { config: DEFAULT_VOICE_CONFIG, usedFallback: true, errors: ["parsed value is not an object"] };
  }

  const migrated = migrateToLatest(parsed as Record<string, unknown>);
  if (!migrated) {
    return { config: DEFAULT_VOICE_CONFIG, usedFallback: true, errors: ["unrecognized schema version"] };
  }

  const result = validateVoiceConfig(migrated.config);
  if (!result.valid) {
    return {
      config: DEFAULT_VOICE_CONFIG,
      usedFallback: true,
      errors: result.errors.map((e) => `${e.field}: ${e.message}`),
    };
  }

  return { config: result.config, usedFallback: false };
}
