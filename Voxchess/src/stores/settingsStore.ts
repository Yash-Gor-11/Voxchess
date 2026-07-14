import { create } from "zustand";
import type { ConfirmationTimeoutTier, RecognitionStyle } from "@/lib/voiceSettingsMapping";

export const BOARD_THEMES = [
  { name: "Classic", dark: "#769656", light: "#EEEED2" },
  { name: "Ocean", dark: "#4682B4", light: "#B0C4DE" },
  { name: "Walnut", dark: "#7B4F2E", light: "#E8C99A" },
  { name: "Midnight", dark: "#2C2C54", light: "#6C6C9E" },
  { name: "Forest", dark: "#2D5A27", light: "#A8D5A2" },
];

interface SettingsState {
  boardThemeIndex: number;
  setBoardTheme: (i: number) => void;

  // Voice settings -- mirrors the board-prefs pattern exactly. Kept as
  // the UI-facing tier/style values (not raw VoiceConfig), matching what
  // gets persisted to Supabase preferences; voiceSettingsMapping.ts is
  // the only place that translates these to/from actual VoiceConfig
  // values when calling getSharedVoiceEngine().configure() (via
  // applyVoiceSettings()).
  //
  // No voiceLanguage field here: only one language exists today and the
  // selector on Settings renders it as a static disabled option with no
  // state binding, rather than carrying a store field/setter that could
  // never actually be exercised. Add it back for real once a second
  // language exists.
  voiceConfirmationTimeout: ConfirmationTimeoutTier;
  voiceRecognitionStyle: RecognitionStyle;
  setVoiceConfirmationTimeout: (tier: ConfirmationTimeoutTier) => void;
  setVoiceRecognitionStyle: (style: RecognitionStyle) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  boardThemeIndex: 0,
  setBoardTheme: (boardThemeIndex) => set({ boardThemeIndex }),

  voiceConfirmationTimeout: "standard",
  voiceRecognitionStyle: "forgiving",
  setVoiceConfirmationTimeout: (voiceConfirmationTimeout) => set({ voiceConfirmationTimeout }),
  setVoiceRecognitionStyle: (voiceRecognitionStyle) => set({ voiceRecognitionStyle }),
}));