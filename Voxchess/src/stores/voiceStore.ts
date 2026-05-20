import { create } from "zustand";
import type { VoiceMode, VoiceStatus } from "@/types/chess";

interface VoiceState {
  activeMode: VoiceMode;
  status: VoiceStatus;
  transcript: string;
  lastResult: { ok: boolean; message?: string } | null;
  activateChessCallback: (() => void) | null;
  setActive: (mode: VoiceMode) => void;
  setStatus: (s: VoiceStatus) => void;
  setTranscript: (t: string) => void;
  setResult: (r: { ok: boolean; message?: string } | null) => void;
  setActivateChessCallback: (fn: (() => void) | null) => void;
  reset: () => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  activeMode: null,
  status: "idle",
  transcript: "",
  lastResult: null,
  activateChessCallback: null,
  setActive: (mode) => set({ activeMode: mode }),
  setStatus: (status) => set({ status }),
  setTranscript: (transcript) => set({ transcript }),
  setResult: (lastResult) => set({ lastResult }),
  setActivateChessCallback: (fn) => set({ activateChessCallback: fn }),
  reset: () => set({ activeMode: null, status: "idle", transcript: "", lastResult: null }),
}));