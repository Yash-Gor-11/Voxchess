import { useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useVoiceStore } from "@/stores/voiceStore";
import {
  isSpeechSupported,
  startRecognition,
  type RecognitionHandle,
} from "@/lib/voice/speechRecognition";
import { parseNavPhrase } from "@/lib/voice/navVoiceHandler";
import { supabase } from "@/integrations/supabase/client";

export function useNavVoice() {
  const navigate = useNavigate();
  const handleRef = useRef<RecognitionHandle | null>(null);
  const { activeMode, setActive, setStatus, setTranscript, setResult } = useVoiceStore();

  const stop = useCallback(() => {
    handleRef.current?.stop();
    handleRef.current = null;
  }, []);

  const activate = useCallback(() => {
    if (!isSpeechSupported()) {
      toast.error("Voice requires Chrome or Edge");
      return;
    }
    if (activeMode === "nav") {
      stop();
      setActive(null);
      setStatus("idle");
      return;
    }
    setActive("nav");
    setStatus("listening");
    setTranscript("");
    setResult(null);
    handleRef.current = startRecognition({
      onResult: (t, isFinal) => {
        setTranscript(t);
        if (!isFinal) return;
        const cmd = parseNavPhrase(t);
        if (!cmd.ok) {
          setStatus("error");
          setResult({ ok: false, message: cmd.message });
          toast.error(cmd.message ?? "Unknown command");
        } else if (cmd.action === "signout") {
          supabase.auth.signOut();
          setStatus("success");
          setResult({ ok: true, message: "Signing out…" });
        } else if (cmd.to) {
          navigate({ to: cmd.to as any });
          setStatus("success");
          setResult({ ok: true, message: `Going to ${cmd.to}` });
        }
        setTimeout(() => {
          setActive(null);
          setStatus("idle");
        }, 1500);
      },
      onEnd: () => {
        const s = useVoiceStore.getState();
        if (s.status === "listening") {
          s.setActive(null);
          s.setStatus("idle");
        }
      },
      onError: () => {
        setStatus("error");
        setTimeout(() => {
          setActive(null);
          setStatus("idle");
        }, 1500);
      },
    });
    if (!handleRef.current) {
      setActive(null);
      setStatus("idle");
      toast.error("Could not start microphone");
    }
  }, [activeMode, navigate, setActive, setResult, setStatus, setTranscript, stop]);

  return { activate, stop, isActive: activeMode === "nav" };
}
