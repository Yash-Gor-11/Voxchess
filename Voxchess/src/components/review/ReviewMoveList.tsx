// src/components/review/ReviewMoveList.tsx

import { useMemo, useEffect, useRef, Fragment } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MoveClassificationBadge } from "@/components/review/MoveClassificationBadge";
import type { MoveReview } from "@/lib/chess/reviewEngine";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReviewMoveListProps {
  moves: readonly MoveReview[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
  openingEndPly: number;       // -1 if no opening detected
  className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pairMoves(
  moves: readonly MoveReview[],
): [MoveReview, MoveReview | null][] {
  const pairs: [MoveReview, MoveReview | null][] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push([moves[i], moves[i + 1] ?? null]);
  }
  return pairs;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReviewMoveList({
  moves,
  currentPly,
  onSelectPly,
  openingEndPly,
  className = "",
}: ReviewMoveListProps) {
  const pairs = useMemo(() => pairMoves(moves), [moves]);
  const activeRowRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [currentPly]);

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 shrink-0 px-1">
        Moves
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <table className="w-full text-xs font-mono">
          <tbody>
            {pairs.map(([white, black], pairIndex) => {
              const moveNumber = pairIndex + 1;
              const whitePly = white.ply;
              const blackPly = black?.ply ?? null;

              const isWhiteActive = currentPly === whitePly;
              const isBlackActive = blackPly !== null && currentPly === blackPly;

              const isLastOpeningPair =
                openingEndPly >= 0 &&
                whitePly <= openingEndPly &&
                (blackPly === null ||
                  blackPly > openingEndPly ||
                  blackPly === openingEndPly);

              return (
                <Fragment key={moveNumber}>
                  <tr
                    ref={isWhiteActive || isBlackActive ? activeRowRef : null}
                    className="border-b border-border/20 last:border-0"
                  >
                    <td className="py-1 pr-2 text-muted-foreground w-7 select-none">
                      {moveNumber}.
                    </td>

                    <td className="py-1 pr-1 w-[44%]">
                      <MoveCell
                        move={white}
                        isActive={isWhiteActive}
                        onClick={() => onSelectPly(whitePly)}
                      />
                    </td>

                    <td className="py-1 w-[44%]">
                      {black && (
                        <MoveCell
                          move={black}
                          isActive={isBlackActive}
                          onClick={() => onSelectPly(black.ply)}
                        />
                      )}
                    </td>
                  </tr>

                  {isLastOpeningPair && (
                    <tr>
                      <td colSpan={3} className="py-1.5 select-none">
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                          <div className="flex-1 h-px bg-border/40" />
                          <span>Opening ends</span>
                          <div className="flex-1 h-px bg-border/40" />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

// ─── MoveCell ─────────────────────────────────────────────────────────────────

interface MoveCellProps {
  move: MoveReview;
  isActive: boolean;
  onClick: () => void;
}

function MoveCell({ move, isActive, onClick }: MoveCellProps) {
  return (
    <button
      onClick={onClick}
      aria-current={isActive ? "step" : undefined}
      className={`
        flex items-center gap-1 px-1.5 py-0.5 rounded w-full text-left
        transition-colors hover:bg-muted
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--accent-chess)]
        ${isActive
          ? "bg-[var(--accent-chess)]/20 text-[var(--accent-chess)] font-semibold"
          : ""}
      `}
    >
      <span className="truncate">{move.san}</span>

      {move.classification !== "best" &&
       move.classification !== "good" &&
       move.classification !== "book" && (
        <span className="ml-auto shrink-0">
          <MoveClassificationBadge
            classification={move.classification}
            variant="symbol"
          />
        </span>
      )}
    </button>
  );
}