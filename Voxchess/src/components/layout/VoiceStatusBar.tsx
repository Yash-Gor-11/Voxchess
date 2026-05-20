import { cn } from "@/lib/utils";
import { useVoiceStore } from "@/stores/voiceStore";

export function VoiceStatusBar() {
  const { activeMode, transcript, status } = useVoiceStore();
  const visible = activeMode !== null;

  return (
    <div
      className={cn(
        "h-10 border-b bg-card/60 backdrop-blur transition-all overflow-hidden",
        visible ? "opacity-100" : "opacity-0 h-0 border-b-0",
      )}
    >
      <div className="flex h-10 items-center gap-3 px-4 text-xs">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            activeMode === "nav" ? "bg-[var(--accent-blue)]" : "bg-[var(--accent-chess)]",
            status === "listening" && "animate-pulse",
          )}
        />
        <span className="font-medium text-muted-foreground">
          {activeMode === "nav" ? "Navigating…" : "Listening for move…"}
        </span>
        {transcript && <span className="font-mono text-foreground truncate">“{transcript}”</span>}
      </div>
    </div>
  );
}
