import { cn } from "@/lib/utils";
import { useVoiceStore } from "@/stores/voiceStore";

export function TranscriptDisplay({ mode }: { mode: "nav" | "chess" }) {
  const { activeMode, transcript, status, lastResult, confirmationPrompt } = useVoiceStore();
  const promptActive = mode === "chess" && !!confirmationPrompt;

  if (!promptActive) {
    if (activeMode !== mode && !lastResult) return null;
    if (activeMode !== mode && status === "idle") return null;
  }

  const showLive = activeMode === mode && transcript && !promptActive;
  const showResult = lastResult && activeMode === null && !promptActive;

  return (
    <div
      className={cn(
        "mt-3 rounded-md border bg-muted/40 px-3 py-2 text-xs font-mono animate-fade-up",
        status === "error" && "border-destructive/40 text-destructive",
        status === "success" && "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
      )}
    >
      {promptActive && (
        <div className="whitespace-pre-line font-sans not-italic text-foreground">
          {confirmationPrompt}
        </div>
      )}
      {!promptActive && showLive && <span>“{transcript}”</span>}
      {!promptActive && !showLive && showResult && <span>{lastResult?.message}</span>}
      {!promptActive && !showLive && !showResult && status === "listening" && (
        <span className="text-muted-foreground">Listening…</span>
      )}
    </div>
  );
}