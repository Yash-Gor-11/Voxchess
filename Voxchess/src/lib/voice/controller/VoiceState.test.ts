// src/lib/voice/controller/VoiceState.test.ts
//
// Run with: bun test

import { describe, expect, it } from "bun:test";
import { VoiceState } from "./VoiceState";

describe("VoiceState", () => {
  it("has exactly the seven states defined in v3 §4", () => {
    const values = Object.keys(VoiceState).filter((k) => Number.isNaN(Number(k)));
    expect(values).toEqual([
      "Idle",
      "Listening",
      "Parsing",
      "Ranking",
      "AwaitingConfirmation",
      "Executing",
      "Error",
    ]);
  });
});
