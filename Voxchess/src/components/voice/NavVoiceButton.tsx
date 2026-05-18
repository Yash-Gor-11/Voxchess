import { Compass, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavVoice } from "@/hooks/useNavVoice";
import { isSpeechSupported } from "@/lib/voice/speechRecognition";
import { useVoiceStore } from "@/stores/voiceStore";

export function NavVoiceButton({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const { activate, isActive } = useNavVoice();
  const supported = typeof window === "undefined" ? true : isSpeechSupported();
  const status = useVoiceStore((s) => s.status);
  const px = size === "lg" ? "h-14 w-14" : size === "sm" ? "h-9 w-9" : "h-12 w-12";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={activate}
            disabled={!supported}
            aria-label="Activate navigation voice"
            className={cn(
              "relative inline-flex items-center justify-center rounded-full transition-all",
              "bg-[var(--accent-blue)] text-white shadow-sm hover:opacity-90",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              isActive && status === "listening" && "animate-mic-blue",
              px,
            )}
          >
            {isActive && status === "listening" ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Compass className="h-4 w-4" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {!supported ? "Voice requires Chrome or Edge" : "Navigate by voice · Press N"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}