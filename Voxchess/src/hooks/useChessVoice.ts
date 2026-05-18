import { useCallback, useRef } from "react";
import { toast } from "sonner";
import type { Chess } from "chess.js";
import { useVoiceStore } from "@/stores/voiceStore";
import { isSpeechSupported, startRecognition, type RecognitionHandle } from "@/lib/voice/speechRecognition";
import { applyChessVoice } from "@/lib/voice/chessVoiceHandler";

interface Opts { game: Chess; onMove: (san: string) => boolean; }

export function useChessVoice({ game, onMove }: Opts) {
  const handleRef = useRef<RecognitionHandle | null>(null);
  const { activeMode, setActive, setStatus, setTranscript, setResult } = useVoiceStore();

  const stop = useCallback(() => { handleRef.current?.stop(); handleRef.current = null; }, []);

  const activate = useCallback(() => {
    if (!isSpeechSupported()) { toast.error("Voice requires Chrome or Edge"); return; }
    if (activeMode === "chess") { stop(); setActive(null); setStatus("idle"); return; }
    setActive("chess"); setStatus("listening"); setTranscript(""); setResult(null);
    handleRef.current = startRecognition({
      onResult: (t, isFinal) => {
        setTranscript(t);
        if (!isFinal) return;
        const r = applyChessVoice(game, t);
        if (r.ok && r.san) {
          const applied = onMove(r.san);
          if (applied) {
            setStatus("success");
            setResult({ ok: true, message: `Played ${r.san}` });
          } else {
            setStatus("error");
            setResult({ ok: false, message: `Could not play ${r.san}` });
            toast.error(`Could not play ${r.san}`);
          }
        }
        else { setStatus("error"); setResult({ ok: false, message: r.message }); toast.error(r.message ?? "Couldn't play move"); }
        setTimeout(() => { setActive(null); setStatus("idle"); }, 1500);
      },
      onEnd: () => { const s = useVoiceStore.getState(); if (s.status === "listening") { s.setActive(null); s.setStatus("idle"); } },
      onError: () => { setStatus("error"); setTimeout(() => { setActive(null); setStatus("idle"); }, 1500); },
    });
    if (!handleRef.current) { setActive(null); setStatus("idle"); toast.error("Could not start microphone"); }
  }, [activeMode, game, onMove, setActive, setResult, setStatus, setTranscript, stop]);

  return { activate, stop, isActive: activeMode === "chess" };
}