import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { AvatarState, Personality } from "@/lib/chess/personalities";

interface Props {
  open: boolean;
  result: string;
  onClose: () => void;
  onNew: () => void;
  personality: Personality;
  avatarState: AvatarState;
  avatarText: string;
}

export function GameOverDialog({ open, result, onClose, onNew, personality, avatarState, avatarText }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Game over</DialogTitle>
          <DialogDescription>{result}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 py-2">
          <div className="shrink-0 w-24 h-24">
            <img
              key={avatarState}
              src={personality.images[avatarState]}
              alt={personality.name}
              className="w-full h-full object-contain drop-shadow-sm"
              style={{ animation: "avatarSlideIn 0.4s ease-out" }}
              onError={(e) => {
                const el = e.currentTarget as HTMLImageElement;
                el.style.display = "none";
                const fb = el.nextSibling as HTMLElement | null;
                if (fb) fb.style.display = "flex";
              }}
            />
            <div style={{ display: "none" }} className="w-full h-full items-center justify-center text-4xl">
              {personality.emoji}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">{personality.name}</div>
            <div className="text-xs text-muted-foreground mb-2">{personality.species}</div>
            {avatarText && (
              <div className="text-sm text-foreground/80 leading-relaxed italic">
                "{avatarText}"
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Review board</Button>
          <Button onClick={onNew}>New game</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}