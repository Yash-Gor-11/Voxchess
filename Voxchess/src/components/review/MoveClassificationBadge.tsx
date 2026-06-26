// src/components/review/MoveClassificationBadge.tsx

import type { MoveClassification } from "@/lib/chess/reviewEngine";

// ─── Classification metadata ──────────────────────────────────────────────────

export type ClassificationMeta = {
  readonly label:       string;
  readonly symbol:      string;
  readonly colorClass:  string;
  readonly bgClass:     string;
  readonly borderClass: string;
  readonly order:       number; // canonical sort order for tables and legends
};

export const CLASSIFICATION_META: Record<MoveClassification, ClassificationMeta> = {
  brilliant: {
    label:       "Brilliant",
    symbol:      "!!",
    colorClass:  "text-cyan-400",
    bgClass:     "bg-cyan-400/10",
    borderClass: "border-cyan-400/30",
    order:       0,
  },
  great: {
    label:       "Great",
    symbol:      "!",
    colorClass:  "text-emerald-400",
    bgClass:     "bg-emerald-400/10",
    borderClass: "border-emerald-400/30",
    order:       1,
  },
  best: {
    label:       "Best",
    symbol:      "★",
    colorClass:  "text-green-400",
    bgClass:     "bg-green-400/10",
    borderClass: "border-green-400/30",
    order:       2,
  },
  excellent: {
    label:       "Excellent",
    symbol:      "✓",
    colorClass:  "text-lime-400",
    bgClass:     "bg-lime-400/10",
    borderClass: "border-lime-400/30",
    order:       3,
  },
  good: {
    label:       "Good",
    symbol:      "✓",
    colorClass:  "text-green-300",
    bgClass:     "bg-green-300/10",
    borderClass: "border-green-300/20",
    order:       4,
  },
  inaccuracy: {
    label:       "Inaccuracy",
    symbol:      "?!",
    colorClass:  "text-yellow-400",
    bgClass:     "bg-yellow-400/10",
    borderClass: "border-yellow-400/30",
    order:       5,
  },
  mistake: {
    label:       "Mistake",
    symbol:      "?",
    colorClass:  "text-orange-400",
    bgClass:     "bg-orange-400/10",
    borderClass: "border-orange-400/30",
    order:       6,
  },
  blunder: {
    label:       "Blunder",
    symbol:      "??",
    colorClass:  "text-red-400",
    bgClass:     "bg-red-400/10",
    borderClass: "border-red-400/30",
    order:       7,
  },
  missedWin: {
    label:       "Missed Win",
    symbol:      "⊗",
    colorClass:  "text-red-300",
    bgClass:     "bg-red-300/10",
    borderClass: "border-red-300/20",
    order:       8,
  },
  book: {
    label:       "Book",
    symbol:      "≡",
    colorClass:  "text-blue-400",
    bgClass:     "bg-blue-400/10",
    borderClass: "border-blue-400/20",
    order:       9,
  },
};

// ─── Single accessor ──────────────────────────────────────────────────────────

export function getClassificationMeta(
  classification: MoveClassification,
): ClassificationMeta {
  return CLASSIFICATION_META[classification];
}

// ─── Variant types ────────────────────────────────────────────────────────────

type BadgeVariant =
  | "symbol"  // symbol only — inline in move list
  | "pill"    // symbol + label — overview table, coach panel
  | "label";  // label text only — coach panel header

interface MoveClassificationBadgeProps {
  classification: MoveClassification;
  variant?: BadgeVariant;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MoveClassificationBadge({
  classification,
  variant = "symbol",
  className = "",
}: MoveClassificationBadgeProps) {
  const meta = CLASSIFICATION_META[classification];

  if (variant === "symbol") {
    return (
      <span
        role="img"
        className={`font-bold text-xs leading-none ${meta.colorClass} ${className}`}
        title={meta.label}
        aria-label={meta.label}
      >
        {meta.symbol}
      </span>
    );
  }

  if (variant === "label") {
    return (
      <span
        className={`text-xs font-semibold ${meta.colorClass} ${className}`}
        title={meta.label}
        aria-label={meta.label}
      >
        {meta.label}
      </span>
    );
  }

  // pill
  return (
    <span
      className={`
        inline-flex items-center gap-1 px-1.5 py-0.5
        rounded border text-xs font-medium
        ${meta.colorClass} ${meta.bgClass} ${meta.borderClass}
        ${className}
      `}
      title={meta.label}
      aria-label={meta.label}
    >
      <span aria-hidden="true" className="font-bold leading-none">
        {meta.symbol}
      </span>
      <span>{meta.label}</span>
    </span>
  );
}