// src/lib/voiceSettingsMapping.ts
//
// Translates between user-facing Settings labels and the engine's actual
// VoiceConfig values (VoiceConfig itself stays exactly as the engine
// defines it -- this file is the ONE place that knows "Standard" means
// 5000ms, so Settings UI and the persisted-preferences shape can't
// silently drift apart from each other or from the engine's real units).

import type { VoiceConfig } from "@/lib/voice/types";

export type ConfirmationTimeoutTier = "fast" | "standard" | "relaxed" | "never";
export type RecognitionStyle = "forgiving" | "precise";

export const CONFIRMATION_TIMEOUT_OPTIONS: Array<{
  tier: ConfirmationTimeoutTier;
  label: string;
  ms: number | null;
}> = [
  { tier: "fast", label: "Fast (2.5s)", ms: 2500 },
  { tier: "standard", label: "Standard (5s)", ms: 5000 },
  { tier: "relaxed", label: "Relaxed (10s)", ms: 10000 },
  { tier: "never", label: "Never auto-pick", ms: null },
];

export const RECOGNITION_STYLE_OPTIONS: Array<{
  style: RecognitionStyle;
  label: string;
  description: string;
  clarity: VoiceConfig["clarity"];
}> = [
  {
    style: "forgiving",
    label: "Forgiving (Recommended)",
    description: "Accepts more natural phrases and minor recognition mistakes.",
    clarity: "fuzzy",
  },
  {
    style: "precise",
    label: "Precise",
    description: "Requires clearer commands but reduces accidental matches.",
    clarity: "clear",
  },
];

export function timeoutTierToMs(tier: ConfirmationTimeoutTier): number | null {
  return CONFIRMATION_TIMEOUT_OPTIONS.find((o) => o.tier === tier)?.ms ?? 5000;
}

/**
 * Reverse mapping for hydration: the persisted value is already the tier
 * name (that's what gets saved), so this only exists to validate/fall
 * back safely if the stored value is ever missing or corrupted.
 */
export function isConfirmationTimeoutTier(value: unknown): value is ConfirmationTimeoutTier {
  return typeof value === "string" && CONFIRMATION_TIMEOUT_OPTIONS.some((o) => o.tier === value);
}

export function recognitionStyleToClarity(style: RecognitionStyle): VoiceConfig["clarity"] {
  return RECOGNITION_STYLE_OPTIONS.find((o) => o.style === style)?.clarity ?? "fuzzy";
}

export function isRecognitionStyle(value: unknown): value is RecognitionStyle {
  return typeof value === "string" && RECOGNITION_STYLE_OPTIONS.some((o) => o.style === value);
}

/** Only one option exists today, but the type/shape is here so adding a
 * second language later is a data change, not a structural one. */
export type VoiceLanguage = "en";
export const VOICE_LANGUAGE_OPTIONS: Array<{ code: VoiceLanguage; label: string }> = [
  { code: "en", label: "English" },
];

/**
 * Single source of truth for "which language is actually active" --
 * used both by applyVoiceSettings() (instead of hardcoding "en" inline)
 * and by Settings' language-option highlight (compared by value, not by
 * array index, so reordering VOICE_LANGUAGE_OPTIONS later can't silently
 * highlight the wrong option).
 */
export const CURRENT_VOICE_LANGUAGE: VoiceLanguage = "en";