export type GameMode = "play" | "analysis";
export type VoiceMode = "nav" | "chess" | null;
export type VoiceStatus = "idle" | "listening" | "success" | "error";

export interface Arrow {
  from: string;
  to: string;
  color?: string;
}
export interface Highlight {
  square: string;
  color?: string;
}
export interface MoveResult {
  ok: boolean;
  san?: string;
  message?: string;
}