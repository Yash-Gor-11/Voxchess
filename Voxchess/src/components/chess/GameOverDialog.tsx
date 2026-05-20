import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  result: string;
  onClose: () => void;
  onNew: () => void;
}
export function GameOverDialog({ open, result, onClose, onNew }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Game over</DialogTitle>
          <DialogDescription>{result}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Review board
          </Button>
          <Button onClick={onNew}>New game</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
