// src/lib/voice/controller/VoiceState.ts
//
// Single source of truth for voice engine state — every module compares
// against this enum, never against magic strings (v3 §4).

export enum VoiceState {
  Idle,
  Listening,
  Parsing,
  Ranking,
  AwaitingConfirmation,
  Executing,
  Error,
}
