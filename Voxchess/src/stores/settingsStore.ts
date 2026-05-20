import { create } from "zustand";

export const BOARD_THEMES = [
  { name: "Classic", dark: "#769656", light: "#EEEED2" },
  { name: "Ocean", dark: "#4682B4", light: "#B0C4DE" },
  { name: "Walnut", dark: "#7B4F2E", light: "#E8C99A" },
  { name: "Midnight", dark: "#2C2C54", light: "#6C6C9E" },
  { name: "Forest", dark: "#2D5A27", light: "#A8D5A2" },
];

interface SettingsState {
  boardThemeIndex: number;
  boardSize: number;
  setBoardTheme: (i: number) => void;
  setBoardSize: (px: number) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  boardThemeIndex: 0,
  boardSize: 280,
  setBoardTheme: (boardThemeIndex) => set({ boardThemeIndex }),
  setBoardSize: (boardSize) => set({ boardSize }),
}));
