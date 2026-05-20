import { create } from "zustand";

interface GameState {
  fen: string;
  history: string[];
  setFen: (fen: string) => void;
  setHistory: (h: string[]) => void;
  reset: () => void;
}

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const useGameStore = create<GameState>((set) => ({
  fen: START,
  history: [],
  setFen: (fen) => set({ fen }),
  setHistory: (history) => set({ history }),
  reset: () => set({ fen: START, history: [] }),
}));
