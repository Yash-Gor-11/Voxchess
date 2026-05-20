import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function MoveList({ moves, currentPly }: { moves: string[]; currentPly?: number }) {
  const pairs: Array<[string, string?]> = [];
  for (let i = 0; i < moves.length; i += 2) pairs.push([moves[i], moves[i + 1]]);

  return (
    <ScrollArea className="h-64">
      <div className="font-mono text-xs leading-relaxed pr-3">
        {pairs.length === 0 ? (
          <span className="text-muted-foreground">No moves yet</span>
        ) : (
          pairs.map(([w, b], i) => {
            const whitePly = i * 2 + 1;
            const blackPly = i * 2 + 2;
            return (
              <div key={i} className="grid grid-cols-[2.5rem_1fr_1fr] gap-2">
                <span className="text-muted-foreground">{i + 1}.</span>
                <span
                  className={cn(
                    currentPly === whitePly &&
                      "bg-accent-chess/20 text-accent-chess rounded px-1 font-semibold",
                  )}
                >
                  {w}
                </span>
                <span
                  className={cn(
                    b &&
                      currentPly === blackPly &&
                      "bg-accent-chess/20 text-accent-chess rounded px-1 font-semibold",
                  )}
                >
                  {b ?? ""}
                </span>
              </div>
            );
          })
        )}
      </div>
    </ScrollArea>
  );
}
