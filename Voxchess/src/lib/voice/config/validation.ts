// src/lib/voice/config/validation.ts
//
// Runtime validation for VoiceConfig. Exists because TypeScript's type
// system only protects call sites that are themselves typed — a config
// loaded from persisted storage (localStorage, a settings API response,
// etc.) arrives as `unknown` at the actual boundary, and needs real
// runtime checks, not just a type assertion someone was hoping is true.

import type { VoiceConfig } from "../types";

export interface ConfigValidationError {
  field: string;
  message: string;
}

export type ValidationResult =
  | { valid: true; config: VoiceConfig }
  | { valid: false; errors: ConfigValidationError[] };

export function validateVoiceConfig(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null) {
    return { valid: false, errors: [{ field: "<root>", message: "config must be an object" }] };
  }

  const c = input as Record<string, unknown>;
  const errors: ConfigValidationError[] = [];

  if (c.clarity !== "fuzzy" && c.clarity !== "clear") {
    errors.push({
      field: "clarity",
      message: `must be "fuzzy" or "clear", got ${JSON.stringify(c.clarity)}`,
    });
  }

  if (c.timerMs !== null && (typeof c.timerMs !== "number" || !Number.isFinite(c.timerMs) || c.timerMs < 0)) {
    errors.push({
      field: "timerMs",
      message: `must be a non-negative finite number or null, got ${JSON.stringify(c.timerMs)}`,
    });
  }

  if (c.language !== "en") {
    errors.push({
      field: "language",
      message: `must be "en" (the only supported language currently), got ${JSON.stringify(c.language)}`,
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    config: {
      clarity: c.clarity as "fuzzy" | "clear",
      timerMs: c.timerMs as number | null,
      language: "en",
    },
  };
}
