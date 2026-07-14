// src/stores/voiceStore.ts
//
// Adapted per the voice-engine integration's Phase 1 audit table: activeMode
// / status / transcript / lastResult / activateChessCallback keep their
// original shape and ownership handoff described below. `confirmationPrompt`
// was added in a later polish pass (see its own doc comment) after review
// feedback correctly flagged that reusing `transcript` for ambiguous-move
// "Which one?" prompts made the transcript display lie about its contents.
//
// Previously, `transcript` and `lastResult` were set directly by ad hoc
// recognition callbacks living inside each page's voice hook
// (useChessVoice's onResult/onEnd, and Analysis's inline
// startRecognition() usage). Now, for chess/move-input voice, those
// fields mirror VoiceSession events instead: useVoiceEngine.ts subscribes
// to a VoiceSession's stateChange/moveCommitted/error events and calls
// these exact same setters in response. The store itself doesn't know or
// care that the driving logic moved -- existing consumers (VoiceStatusBar,
// ChessVoiceButton, NavVoiceButton) keep working unmodified; only
// TranscriptDisplay needed a small update for the confirmationPrompt field.
//
// Nav-voice (useNavVoice.ts, "go to dashboard" etc.) is untouched by the
// voice engine migration -- it's a separate, simpler feature (per the
// handoff's Phase 1 audit) and keeps setting these fields directly itself.

import { create } from "zustand";
import type { VoiceMode, VoiceStatus } from "@/types/chess";

interface VoiceState {
  activeMode: VoiceMode;
  status: VoiceStatus;
  /** What was actually heard -- reset to "" on Listening, never repurposed for anything else. */
  transcript: string;
  lastResult: { ok: boolean; message?: string } | null;
  /**
   * Set only while an ambiguous-candidate or dangerous-command confirmation
   * round is awaiting a reply ("Which one? 1. ... 2. ..."). Kept separate
   * from `transcript` deliberately -- a prompt describing what the ENGINE
   * is asking is not "what the user said," and conflating the two made
   * TranscriptDisplay lie about its own contents.
   */
  confirmationPrompt: string | null;
  activateChessCallback: (() => void) | null;
  setActive: (mode: VoiceMode) => void;
  setStatus: (s: VoiceStatus) => void;
  setTranscript: (t: string) => void;
  setResult: (r: { ok: boolean; message?: string } | null) => void;
  setConfirmationPrompt: (p: string | null) => void;
  setActivateChessCallback: (fn: (() => void) | null) => void;
  reset: () => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  activeMode: null,
  status: "idle",
  transcript: "",
  lastResult: null,
  confirmationPrompt: null,
  activateChessCallback: null,
  setActive: (mode) => set({ activeMode: mode }),
  setStatus: (status) => set({ status }),
  setTranscript: (transcript) => set({ transcript }),
  setResult: (lastResult) => set({ lastResult }),
  setConfirmationPrompt: (confirmationPrompt) => set({ confirmationPrompt }),
  setActivateChessCallback: (fn) => set({ activateChessCallback: fn }),
  reset: () => set({ activeMode: null, status: "idle", transcript: "", lastResult: null, confirmationPrompt: null }),
}));