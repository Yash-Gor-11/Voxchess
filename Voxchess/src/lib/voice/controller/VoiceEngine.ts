// src/lib/voice/controller/VoiceEngine.ts
//
// The permanent, long-lived object. Owns configuration and creates
// sessions — it does NOT itself hold transcript/candidate/timer state,
// which is what made the v1 design risk becoming a god object (v3 §5.1).
//
// Phase 9A update: configure() now validates its input via
// validateVoiceConfig() rather than trusting the caller blindly. Throws
// on invalid input — same reasoning as config/index.ts's
// createVoiceConfig(): a caller passing a malformed VoiceConfig object
// directly to configure() is a programming error. A config that might
// legitimately be corrupted (e.g. loaded from storage) should go through
// config/serialization.ts's deserializeVoiceConfig() first, which already
// falls back to defaults gracefully — by the time something reaches
// configure(), it's expected to already be valid.

import { startRecognition, type RecognizerFactory } from "../recognition/BrowserRecognizer";
import { createVoiceSession, type VoiceSession } from "./VoiceSession";
import type { ChessAdapter } from "../adapters/ChessAdapter";
import type { VoiceConfig } from "../types";
import { DEFAULT_VOICE_CONFIG } from "../config/defaults";
import { validateVoiceConfig } from "../config/validation";

export interface VoiceEngine {
  configure(config: VoiceConfig): void;
  /**
   * Added during integration (not part of the original Phase 9A build):
   * read-only access to the engine's current config. Needed so page-level
   * confirmation-prompt UI can phrase itself correctly (e.g. only saying
   * "wait to auto-pick #1" when timerMs is actually set) without silently
   * assuming a default that Settings might later change. Purely additive
   * and behavior-preserving -- exposes existing closure state, changes
   * nothing about configure()/createSession()'s contract.
   */
  getConfig(): VoiceConfig;
  createSession(adapter: ChessAdapter): VoiceSession;
}

/**
 * createVoiceEngine's recognizerFactory parameter defaults to the real
 * BrowserRecognizer but is overridable — this is the fixture-testing seam,
 * mirroring the createChessAdapter/createTestChessAdapter split from
 * Phase 3. There's no live browser in this build/test environment (no
 * Web Speech API in Node), so tests inject a fake RecognizerFactory here
 * rather than needing a separate createTestVoiceEngine wrapper.
 */
export function createVoiceEngine(recognizerFactory: RecognizerFactory = startRecognition): VoiceEngine {
  let config: VoiceConfig = DEFAULT_VOICE_CONFIG;

  return {
    configure(newConfig) {
      const result = validateVoiceConfig(newConfig);
      if (!result.valid) {
        const message = result.errors.map((e) => `${e.field}: ${e.message}`).join("; ");
        throw new Error(`VoiceEngine.configure() received an invalid VoiceConfig: ${message}`);
      }
      config = result.config;
    },
    getConfig() {
      return config;
    },
    createSession(adapter) {
      return createVoiceSession(adapter, recognizerFactory, () => config);
    },
  };
}