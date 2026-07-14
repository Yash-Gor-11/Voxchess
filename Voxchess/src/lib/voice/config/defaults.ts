// src/lib/voice/config/defaults.ts
//
// Phase 9A: engine-facing configuration model. Per this session's scope
// narrowing — the React settings UI itself belongs in the real VoxChess
// app and can't be meaningfully built in this sandbox, but the
// configuration system those components will eventually drive (defaults,
// validation, versioned serialization, a persistence-adapter interface)
// is fully self-contained and buildable here.

import type { VoiceConfig } from "../types";

export const DEFAULT_VOICE_CONFIG: Readonly<VoiceConfig> = Object.freeze({
  clarity: "fuzzy",
  // Was 2500 -- real-browser testing showed this was too tight: toast
  // render + user noticing + reaction + speaking + actual recognition
  // latency (plus BrowserRecognizer's mic-teardown safety net, up to
  // ~900ms on browsers that need it) can plausibly exceed 2.5s end to
  // end, causing the auto-timeout to commit the default candidate before
  // a genuine spoken reply ("one"/"two"/a piece name) was ever captured
  // -- which looks indistinguishable from "saying the number does
  // nothing." 5000ms matches the "Standard" tier this becomes once
  // Settings exposes it as user-configurable (Fast 2.5s / Standard 5s /
  // Relaxed 10s / Never).
  timerMs: 5000,
  language: "en",
});