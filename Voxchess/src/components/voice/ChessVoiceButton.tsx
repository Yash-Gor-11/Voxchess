import { MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { isSpeechSupported } from "@/lib/voice/speechRecognition";
import { useVoiceStore } from "@/stores/voiceStore";

interface Props {
  onActivate: () => void;
  isActive: boolean;
  enabled?: boolean;
  size?: "sm" |"md" | "lg";
}

function Knight(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M7 21h10v-2H7v2zM18 4c-2-2-5-2-7 0L8 7c-1 1-2 3-2 4v3l4-2 1 2-2 2v3h11v-2c0-3-1-7-2-9V4z" />
    </svg>
  );
}

export function ChessVoiceButton({ onActivate, isActive, enabled = true, size = "lg" }: Props) {
  const supported = typeof window === "undefined" ? true : isSpeechSupported();
  const disabled = !enabled || !supported;
  const status = useVoiceStore((s) => s.status);
  const px = size === "lg" ? "h-16 w-16" : size === "md" ? "h-12 w-12" : "h-9 w-9";
  const iconSize = size === "lg" ? "h-7 w-7" : size === "md" ? "h-5 w-5" : "h-4 w-4";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onActivate}
            disabled={disabled}
            aria-label="Activate chess voice"
            className={cn(
              "relative inline-flex items-center justify-center rounded-full transition-all",
              "bg-[var(--accent-chess)] text-white shadow-sm hover:opacity-90",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              isActive && status === "listening" && "animate-mic-green",
              px,
            )}
          >
            {isActive && status === "listening" ? (
              <MicOff className={iconSize} />
            ) : (
              <Knight className={iconSize} />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {!supported
            ? "Voice requires Chrome or Edge"
            : !enabled
              ? "Only active during a game"
              : "Make a move by voice · Press Space"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}