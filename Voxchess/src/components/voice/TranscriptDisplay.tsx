import { cn } from "@/lib/utils";
import { useVoiceStore } from "@/stores/voiceStore";

export function TranscriptDisplay({ mode }: { mode: "nav" | "chess" }) {
  const { activeMode, transcript, status, lastResult } = useVoiceStore();
  if (activeMode !== mode && !lastResult) return null;
  if (activeMode !== mode && status === "idle") return null;

  const showLive = activeMode === mode && transcript;
  const showResult = lastResult && activeMode === null;

  return (
    <div
      className={cn(
        "mt-3 rounded-md border bg-muted/40 px-3 py-2 text-xs font-mono animate-fade-up",
        status === "error" && "border-destructive/40 text-destructive",
        status === "success" && "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
      )}
    >
      {showLive && <span>“{transcript}”</span>}
      {!showLive && showResult && <span>{lastResult?.message}</span>}
      {!showLive && !showResult && status === "listening" && <span className="text-muted-foreground">Listening…</span>}
    </div>
  );
}