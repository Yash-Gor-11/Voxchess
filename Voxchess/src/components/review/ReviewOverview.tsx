// src/components/review/ReviewOverview.tsx

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoveClassificationBadge, CLASSIFICATION_META } from "@/components/review/MoveClassificationBadge";
import { EvalGraph } from "@/components/review/EvalGraph";
import type { ReviewModel, MoveClassification } from "@/lib/chess/reviewEngine";
import { CURRENT_REVIEW_VERSION } from "@/lib/chess/reviewConstants";
import type { PersonalityId } from "@/lib/chess/personalities";
import { getPersonality } from "@/lib/chess/personalities";
import { AlertTriangle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReviewOverviewProps {
  review: ReviewModel;
  gameResult: string | null;
  totalMoves: number;
  playerColor: "white" | "black";
  personalityId: PersonalityId | null;
  onReviewGame: () => void;
  onReanalyse: () => void;
  currentPly: number;
  onSelectPly: (ply: number) => void;
}

// ─── Constants (module-level, never recomputed) ───────────────────────────────

// "book" is included here and renders through the SAME generic row as every
// other classification, using counts.book (already split per-side in
// computeSideStats) — there is no longer a separate combined book summary.
const ORDERED_CLASSIFICATIONS: MoveClassification[] = (
  Object.entries(CLASSIFICATION_META) as [
    MoveClassification,
    typeof CLASSIFICATION_META[MoveClassification],
  ][]
)
  .sort((a, b) => a[1].order - b[1].order)
  .map(([cls]) => cls);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAccuracy(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(1)}%`;
}

function formatResult(result: string | null): string {
  if (!result) return "—";
  if (result === "1-0")     return "1–0  White won";
  if (result === "0-1")     return "0–1  Black won";
  if (result === "1/2-1/2") return "½–½  Draw";
  return result;
}

// ─── SideCard ─────────────────────────────────────────────────────────────────

interface SideCardProps {
  label: string;
  isPlayer: boolean;
  stats: ReviewModel["white"];
  personalityId: PersonalityId | null;
}

function SideCard({ label, isPlayer, stats, personalityId }: SideCardProps) {
  const personality = !isPlayer && personalityId
    ? getPersonality(personalityId)
    : null;

  return (
    <div className="flex flex-col gap-2 flex-1 min-w-0">

      {/* Side label */}
      <div className="flex items-center gap-2">
        {personality && (
          <img
            src={personality.images.idle}
            alt={personality.name}
            className="h-5 w-5 object-contain"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <span className="text-xs font-semibold text-foreground truncate">
          {personality ? personality.name : label}
        </span>
        {isPlayer && (
          <span className="text-[10px] text-muted-foreground">(You)</span>
        )}
      </div>

      {/* Accuracy */}
      <div className="flex flex-col gap-0.5">
        <span className="text-2xl font-bold text-foreground leading-none">
          {formatAccuracy(stats.accuracy)}
        </span>
        <span className="text-[10px] text-muted-foreground">accuracy</span>
      </div>

      {/* Estimated performance */}
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold font-mono text-foreground">
          ~{stats.estimatedPerformance}
        </span>
        <span className="text-[10px] text-muted-foreground">
          estimated performance
        </span>
      </div>

      {/* ACPL */}
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold font-mono text-foreground">
          {stats.acpl}
        </span>
        <span className="text-[10px] text-muted-foreground">avg CPL</span>
      </div>

      {/* Phase accuracies */}
      <div className="flex flex-col gap-1 pt-1 border-t border-border/40">
        {(
          [
            ["Opening",    stats.openingAccuracy],
            ["Middlegame", stats.middlegameAccuracy],
            ["Endgame",    stats.endgameAccuracy],
          ] as const
        ).map(([phase, val]) => (
          <div key={phase} className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">{phase}</span>
            <span className="text-[10px] font-mono font-medium text-foreground">
              {formatAccuracy(val)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReviewOverview({
  review,
  gameResult,
  totalMoves,
  playerColor,
  personalityId,
  onReviewGame,
  onReanalyse,
  currentPly,
  onSelectPly,
}: ReviewOverviewProps) {
  const isStale = review.version < CURRENT_REVIEW_VERSION;

  const playerStats   = playerColor === "white" ? review.white : review.black;
  const opponentStats = playerColor === "white" ? review.black : review.white;
  const playerLabel   = playerColor === "white" ? "White" : "Black";
  const opponentLabel = playerColor === "white" ? "Black" : "White";

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 max-w-lg mx-auto space-y-4">

        {/* Stale version banner */}
        {isStale && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg
                          bg-yellow-400/10 border border-yellow-400/30">
            <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 shrink-0 mt-0.5" />
            <div className="text-xs text-yellow-400 leading-relaxed">
              This review was generated with an older version of VoxChess.
              Re-analyse for best results.
            </div>
          </div>
        )}

        {/* Opening + result header */}
        <div className="space-y-0.5">
          <div className="text-sm font-semibold text-foreground">
            {review.eco !== "?" && (
              <span className="text-muted-foreground font-normal mr-1.5">
                {review.eco}
              </span>
            )}
            {review.opening}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatResult(gameResult)} · {Math.ceil(totalMoves / 2)} moves ·{" "}
            Depth {review.depth}
          </div>
        </div>

        {/* Per-side stats */}
        <Card className="p-4">
          <div className="flex gap-4 divide-x divide-border/40">
            <SideCard
              label={playerLabel}
              isPlayer={true}
              stats={playerStats}
              personalityId={null}
            />
            <div className="pl-4 flex-1 min-w-0">
              <SideCard
                label={opponentLabel}
                isPlayer={false}
                stats={opponentStats}
                personalityId={personalityId}
              />
            </div>
          </div>
        </Card>

        {/* Move classification counts — book included, per-side, same row
            format as every other classification (counts.book is already
            split per-side in computeSideStats). */}
        <Card className="p-4">
          <div className="text-xs font-medium uppercase tracking-wider
                          text-muted-foreground mb-3">
            Move breakdown
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-normal pb-1.5 w-1/2">
                  Classification
                </th>
                <th className="text-right font-normal pb-1.5 pr-4">
                  {playerLabel}
                </th>
                <th className="text-right font-normal pb-1.5">
                  {opponentLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {ORDERED_CLASSIFICATIONS.map((cls) => {
                const playerCount   = playerStats.counts[cls];
                const opponentCount = opponentStats.counts[cls];
                if (playerCount === 0 && opponentCount === 0) return null;
                return (
                  <tr key={cls} className="border-t border-border/10">
                    <td className="py-1">
                      <MoveClassificationBadge
                        classification={cls}
                        variant="pill"
                      />
                    </td>
                    <td className={`py-1 text-right pr-4 font-mono font-semibold
                      ${playerCount > 0
                        ? CLASSIFICATION_META[cls].colorClass
                        : "text-muted-foreground/40"}`}>
                      {playerCount}
                    </td>
                    <td className={`py-1 text-right font-mono font-semibold
                      ${opponentCount > 0
                        ? CLASSIFICATION_META[cls].colorClass
                        : "text-muted-foreground/40"}`}>
                      {opponentCount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        {/* Eval graph */}
        <Card className="p-4">
          <div className="text-xs font-medium uppercase tracking-wider
                          text-muted-foreground mb-3">
            Evaluation
          </div>
          <EvalGraph
            moves={review.moves}
            currentPly={currentPly}
            onSelectPly={onSelectPly}
            openingEndPly={review.openingEndPly}
            endgameStartPly={review.endgameStartPly}
          />
        </Card>

        {/* Actions */}
        <div className="flex gap-3 pb-2">
          <Button className="flex-1" onClick={onReviewGame}>
            Review Game
          </Button>
          <Button variant="outline" className="flex-1" onClick={onReanalyse}>
            Re-analyse
          </Button>
        </div>

      </div>
    </div>
  );
}