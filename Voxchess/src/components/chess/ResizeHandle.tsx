// src/components/chess/ResizeHandle.tsx

import { GripIcon } from "lucide-react";

interface ResizeHandleProps {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
}

/**
 * Drag-to-resize handle, extracted verbatim from the Analysis page's
 * JSX/styling. Rendered absolutely positioned in the bottom-right
 * corner of whatever wraps the board (the caller is responsible for
 * that wrapper being `relative`).
 */
export function ResizeHandle({ onPointerDown, onPointerMove, onPointerUp }: ResizeHandleProps) {
  return (
    <div
      className="absolute bottom-0 right-0 z-20 w-6 h-6 flex items-center justify-center rounded-tl-md bg-background/80 border border-border/50 cursor-nwse-resize opacity-40 hover:opacity-100 transition-opacity touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      title="Drag to resize board"
    >
      <GripIcon className="w-3 h-3 text-muted-foreground" />
    </div>
  );
}