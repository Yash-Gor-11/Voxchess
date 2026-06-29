// src/hooks/useResizableBoard.ts

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drag-to-resize logic extracted from the Analysis page, unchanged in
 * behavior. Each page keeps its own initial-size formula (passed in as
 * `calcInitialSize`) since page chrome — eval bar presence, sidebar
 * width, nav rows — genuinely differs per page. What's shared and
 * reused here is the part that was already robust: the drag math,
 * clamped against the board card's real measured size, plus the
 * window-resize/orientation-change bookkeeping around it.
 *
 * Usage:
 *   const { boardSize, boardCardRef, dragHandleProps } = useResizableBoard({
 *     calcInitialSize: calcMyPageBoardSize,
 *   });
 *
 *   <Card ref={boardCardRef}>
 *     ...
 *     {!isPortrait && <ResizeHandle {...dragHandleProps} />}
 *   </Card>
 */

export interface UseResizableBoardOptions {
  /** Page-specific initial/responsive size formula (vh/vw based). */
  calcInitialSize: () => number;
  /** Hard floor for board size, in px. Defaults to 180 (matches Analysis). */
  minSize?: number;
  /** Hard ceiling for board size, in px. Defaults to 600 (matches Analysis). */
  maxSize?: number;
}

export interface UseResizableBoardResult {
  boardSize: number;
  /** Attach to the Card (or equivalent container) the board sits inside. */
  boardCardRef: React.RefObject<HTMLDivElement | null>;
  /** Spread onto the drag-handle element's pointer event props. */
  dragHandleProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
  };
}

export function useResizableBoard({
  calcInitialSize,
  minSize = 180,
  maxSize = 600,
}: UseResizableBoardOptions): UseResizableBoardResult {
  const [boardSize, setBoardSize] = useState(calcInitialSize);

  // Set once a manual drag happens; stops the window-resize effect from
  // overwriting a deliberate user resize. Reset on orientation flip, same
  // as Analysis — switching to portrait re-derives from the formula.
  const userResizedRef = useRef(false);

  const boardCardRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; size: number } | null>(null);

  useEffect(() => {
    function onResize() {
      // Derived fresh from window here, not from a prop — matches the
      // original Analysis implementation exactly. A prop-based isPortrait
      // would be one render behind during this same resize event (the
      // page's own resize listener hasn't necessarily re-rendered yet),
      // so this can't be trusted from outside; it must be read live.
      const portrait = window.innerWidth < window.innerHeight;
      if (portrait) userResizedRef.current = false;
      if (!userResizedRef.current) {
        setBoardSize(calcInitialSize());
      }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // calcInitialSize is expected to be referentially stable per page
    // (module-level or useCallback'd by the caller), matching how
    // Analysis originally captured it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragStartRef.current = { x: e.clientX, y: e.clientY, size: boardSize };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [boardSize],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current) return;
      e.preventDefault();
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const delta = (dx + dy) / 2;
      const newRaw = dragStartRef.current.size + delta;

      const card = boardCardRef.current;
      let clampedMax = maxSize;
      if (card) {
        const rect = card.getBoundingClientRect();
        // Same chrome budget Analysis subtracted: padding + drag-handle
        // footprint + a little breathing room, separately for width/height.
        const maxW = rect.width - 32 - 8 - 24;
        const maxH = rect.height - 52 - 24;
        clampedMax = Math.min(maxW, maxH, maxSize);
      }

      userResizedRef.current = true;
      setBoardSize(Math.min(Math.max(newRaw, minSize), clampedMax));
    },
    [minSize, maxSize],
  );

  const onPointerUp = useCallback(() => {
    dragStartRef.current = null;
  }, []);

  return {
    boardSize,
    boardCardRef,
    dragHandleProps: { onPointerDown, onPointerMove, onPointerUp },
  };
}