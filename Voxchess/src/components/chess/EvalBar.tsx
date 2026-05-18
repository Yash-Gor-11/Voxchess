import { cn } from "@/lib/utils";
import type { StockfishEval } from "@/lib/chess/stockfish";

interface Props {
  evaluation: StockfishEval | null;
  orientation?: "white" | "black";
}

function scoreToPercent(score: number, mate: number | null): number {
  if (mate !== null) return mate > 0 ? 95 : 5;
  // Sigmoid-like conversion: 0 cp = 50%, ±500cp ≈ 80/20%
  const clamped = Math.max(-1000, Math.min(1000, score));
  return 50 + (50 * clamped) / (Math.abs(clamped) + 400);
}

function formatScore(score: number, mate: number | null): string {
  if (mate !== null) return `M${Math.abs(mate)}`;
  const abs = Math.abs(score / 100);
  return (score >= 0 ? "+" : "-") + abs.toFixed(1);
}

export function EvalBar({ evaluation, orientation = "white" }: Props) {
  const score = evaluation?.score ?? 0;
  const mate = evaluation?.mate ?? null;
  const whitePercent = scoreToPercent(score, mate);
  const blackPercent = 100 - whitePercent;

  const topPercent = orientation === "white" ? blackPercent : whitePercent;
  const bottomPercent = orientation === "white" ? whitePercent : blackPercent;
  const scoreLabel = formatScore(score, mate);
  const whiteAdvantage = score >= 0;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-6 h-64 rounded overflow-hidden border border-border/40 flex flex-col">
        <div
          className="bg-foreground/80 transition-all duration-500"
          style={{ height: `${topPercent}%` }}
        />
        <div
          className="bg-background border-t border-border/20 transition-all duration-500"
          style={{ height: `${bottomPercent}%` }}
        />
      </div>
      <div className={cn(
        "text-xs font-mono font-semibold",
        whiteAdvantage ? "text-foreground" : "text-muted-foreground"
      )}>
        {evaluation ? scoreLabel : "—"}
      </div>
      {evaluation && (
        <div className="text-[10px] text-muted-foreground">
          d{evaluation.depth}
        </div>
      )}
    </div>
  );
}