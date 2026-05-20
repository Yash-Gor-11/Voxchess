import { create } from "zustand";
import type { VoiceMode, VoiceStatus } from "@/types/chess";

interface VoiceState {
  activeMode: VoiceMode;
  status: VoiceStatus;
  transcript: string;
  lastResult: { ok: boolean; message?: string } | null;
  setActive: (mode: VoiceMode) => void;
  setStatus: (s: VoiceStatus) => void;
  setTranscript: (t: string) => void;
  setResult: (r: { ok: boolean; message?: string } | null) => void;
  reset: () => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  activeMode: null,
  status: "idle",
  transcript: "",
  lastResult: null,
  setActive: (mode) => set({ activeMode: mode }),
  setStatus: (status) => set({ status }),
  setTranscript: (transcript) => set({ transcript }),
  setResult: (lastResult) => set({ lastResult }),
  reset: () => set({ activeMode: null, status: "idle", transcript: "", lastResult: null }),
}));
