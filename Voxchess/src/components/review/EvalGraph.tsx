// src/components/review/EvalGraph.tsx

import { useMemo, useRef, useState, useCallback } from "react";
import type { MoveReview, MoveClassification } from "@/lib/chess/reviewEngine";
import { CLASSIFICATION_META } from "@/components/review/MoveClassificationBadge";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EvalGraphProps {
  moves: readonly MoveReview[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
  openingEndPly: number;
  endgameStartPly: number;
  className?: string;
}

interface PlotPoint {
  ply: number;
  san: string | null;        // null for start position
  x: number;
  y: number;
  isMate: boolean;
  mateIn: number | null;
  mateForWhite: boolean;
  evalPawns: number;
  rawEval: number | null;
  classification: MoveClassification | null; // null for start position
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EVAL_CAP   = 10;
const SVG_W      = 400;
const SVG_H      = 120;
const PAD_LEFT   = 4;
const PAD_RIGHT  = 4;
const PAD_TOP    = 8;
const PAD_BOTTOM = 8;
const PLOT_W     = SVG_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H     = SVG_H - PAD_TOP - PAD_BOTTOM;
const ZERO_Y     = PAD_TOP + PLOT_H / 2;

// Classifications notable enough to mark directly on the graph, mirroring
// the chess.com/lichess convention of flagging only the moves that matter —
// Good/Excellent/Inaccuracy are too common to be worth the visual noise.
const NOTABLE_CLASSIFICATIONS: ReadonlySet<MoveClassification> = new Set([
  "brilliant", "great", "missedWin", "mistake", "blunder",
]);

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function evalToY(pawns: number): number {
  const clamped = Math.max(-EVAL_CAP, Math.min(EVAL_CAP, pawns));
  return PAD_TOP + ((EVAL_CAP - clamped) / (2 * EVAL_CAP)) * PLOT_H;
}

/** ply is 0-indexed within the point array (0 = start position). */
function indexToX(index: number, total: number): number {
  if (total <= 1) return PAD_LEFT + PLOT_W / 2;
  return PAD_LEFT + (index / (total - 1)) * PLOT_W;
}

function formatTooltip(p: PlotPoint): string {
  if (p.isMate) {
    if (p.mateIn === 0) return "Checkmate";
    const side = p.mateForWhite ? "+" : "-";
    return `${side}M${Math.abs(p.mateIn ?? 0)}`;
  }
  const sign = p.evalPawns >= 0 ? "+" : "";
  return `${sign}${p.evalPawns.toFixed(1)}`;
}

function formatMoveLabel(p: PlotPoint): string {
  if (p.ply === 0) return "Start";
  const moveNum = Math.ceil(p.ply / 2);
  const isWhite = p.ply % 2 === 1;
  const san = p.san ?? "";
  return isWhite ? `${moveNum}. ${san}` : `${moveNum}... ${san}`;
}

/** Tailwind text-color utility -> matching fill-color utility (e.g. "text-red-400" -> "fill-red-400"). */
function toFillClass(colorClass: string): string {
  return colorClass.replace(/^text-/, "fill-");
}

// ─── Plot point construction ──────────────────────────────────────────────────

function buildPlotPoints(moves: readonly MoveReview[]): PlotPoint[] {
  // Total points = start position + one per move
  const total = moves.length + 1;

  // Index 0 — start position, always equal
  const points: PlotPoint[] = [{
    ply:         0,
    san:         null,
    x:           indexToX(0, total),
    y:           ZERO_Y,
    isMate:      false,
    mateIn:      null,
    mateForWhite:false,
    evalPawns:   0,
    rawEval:     null,
    classification: null,
  }];

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    let isMate      = false;
    let mateIn: number | null = null;
    let mateForWhite = false;
    let evalPawns   = 0;

    if (m.mateAfter !== null) {
      isMate       = true;
      mateIn       = m.mateAfter;
      mateForWhite = m.mateAfter > 0;
      evalPawns    = mateForWhite ? EVAL_CAP : -EVAL_CAP;
    } else if (m.evalAfter !== null) {
      evalPawns = Math.max(-EVAL_CAP,
                  Math.min( EVAL_CAP, m.evalAfter / 100));
    }

    points.push({
      ply:         m.ply,           // 1-indexed, matches rest of UI
      san:         m.san,
      x:           indexToX(i + 1, total),  // i+1 because index 0 is start
      y:           evalToY(evalPawns),
      isMate,
      mateIn,
      mateForWhite,
      evalPawns,
      rawEval:     m.evalAfter,
      classification: m.classification,
    });
  }

  return points;
}

function buildPolyline(points: readonly PlotPoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

function phaseX(ply: number, total: number): number | null {
  if (ply < 0 || total === 0) return null;
  // ply is 1-indexed move ply; add 1 for the start position index offset
  return indexToX(ply, total);
}

// ─── Hit-testing ──────────────────────────────────────────────────────────────

function nearestPly(
  clientX: number,
  svgEl: SVGSVGElement,
  points: readonly PlotPoint[],
): number | null {
  if (points.length === 0) return null;

  const rect   = svgEl.getBoundingClientRect();
  const rawX   = ((clientX - rect.left) / rect.width) * SVG_W;
  // Clamp to plot area so edge clicks map to first/last point
  const mouseX = Math.max(PAD_LEFT, Math.min(PAD_LEFT + PLOT_W, rawX));

  let best     = points[0];
  let bestDist = Math.abs(mouseX - best.x);

  for (const p of points) {
    const d = Math.abs(mouseX - p.x);
    if (d < bestDist) { best = p; bestDist = d; }
  }

  return best.ply;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EvalGraph({
  moves,
  currentPly,
  onSelectPly,
  openingEndPly,
  endgameStartPly,
  className = "",
}: EvalGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredPly, setHoveredPly] = useState<number | null>(null);

  const points   = useMemo(() => buildPlotPoints(moves), [moves]);
  const polyline = useMemo(() => buildPolyline(points),  [points]);
  const total    = points.length;

  // O(1) point lookup by ply — ply 0 = index 0, ply N = index N
  const pointByPly = useCallback(
    (ply: number): PlotPoint | null => points[ply] ?? null,
    [points],
  );

  const currentPoint = pointByPly(currentPly);
  const hoveredPoint = hoveredPly !== null ? pointByPly(hoveredPly) : null;
  const tooltipPoint = hoveredPoint ?? currentPoint;

  // Phase boundary x positions
  const openingX  = useMemo(
    () => phaseX(openingEndPly,   total), [openingEndPly,   total],
  );
  const endgameX  = useMemo(
    () => phaseX(endgameStartPly, total), [endgameStartPly, total],
  );

  // Filled area paths
  const whiteAreaPath = useMemo(() => {
    if (points.length < 2) return "";
    const first = points[0];
    const last  = points[points.length - 1];
    return (
      `M ${first.x},${ZERO_Y} ` +
      points.map((p) => `L ${p.x},${Math.min(p.y, ZERO_Y)}`).join(" ") +
      ` L ${last.x},${ZERO_Y} Z`
    );
  }, [points]);

  const blackAreaPath = useMemo(() => {
    if (points.length < 2) return "";
    const first = points[0];
    const last  = points[points.length - 1];
    return (
      `M ${first.x},${ZERO_Y} ` +
      points.map((p) => `L ${p.x},${Math.max(p.y, ZERO_Y)}`).join(" ") +
      ` L ${last.x},${ZERO_Y} Z`
    );
  }, [points]);

  const matePoints = useMemo(
    () => points.filter((p) => p.isMate),
    [points],
  );

  // Notable moves (Brilliant/Great/Missed Win/Mistake/Blunder) — marked
  // directly on the graph, mirroring chess.com/lichess's "important events"
  // treatment. Mate points are handled separately above (triangle marker)
  // since a mate-delivering move is also visually distinct regardless of
  // its classification.
  const notablePoints = useMemo(
    () =>
      points.filter(
        (p): p is PlotPoint & { classification: MoveClassification } =>
          p.classification !== null && NOTABLE_CLASSIFICATIONS.has(p.classification),
      ),
    [points],
  );

  // ── Interaction ─────────────────────────────────────────────────────────

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;
      setHoveredPly(nearestPly(e.clientX, svgRef.current, points));
    },
    [points],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;
      const ply = nearestPly(e.clientX, svgRef.current, points);
      if (ply !== null) onSelectPly(ply);
    },
    [points, onSelectPly],
  );

  const handleMouseLeave = useCallback(() => setHoveredPly(null), []);

  // ── Render ──────────────────────────────────────────────────────────────

  const tooltipClassification =
    tooltipPoint?.classification && NOTABLE_CLASSIFICATIONS.has(tooltipPoint.classification)
      ? tooltipPoint.classification
      : null;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>

      {/* Tooltip bar */}
      <div className="flex items-center justify-between px-1 h-5 shrink-0">
        {tooltipPoint ? (
          <>
            <span className="text-[10px] text-muted-foreground font-mono">
              {formatMoveLabel(tooltipPoint)}
            </span>
            <div className="flex items-center gap-1.5">
              {tooltipClassification && (
                <span
                  className={`text-[10px] font-semibold ${CLASSIFICATION_META[tooltipClassification].colorClass}`}
                >
                  {CLASSIFICATION_META[tooltipClassification].label}
                </span>
              )}
              <span className={`text-[10px] font-mono font-semibold ${
                tooltipPoint.evalPawns > 0
                  ? "text-foreground"
                  : "text-muted-foreground"
              }`}>
                {formatTooltip(tooltipPoint)}
              </span>
            </div>
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground">Evaluation</span>
        )}
      </div>

      {/* SVG — explicit render order: fills → curve → phase lines →
                 mate markers → notable-move markers → current line →
                 current dot → hover dot                                  */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="none"
        className="w-full rounded cursor-pointer select-none"
        style={{ height: SVG_H }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        aria-label="Evaluation graph"
        role="img"
      >
        {/* 1. Background */}
        <rect
          x={0} y={0} width={SVG_W} height={SVG_H}
          rx={4} fillOpacity={0.15}
          className="fill-muted"
        />

        {/* 2. White advantage fill */}
        <path d={whiteAreaPath} fillOpacity={0.25} className="fill-foreground" />

        {/* 3. Black advantage fill */}
        <path d={blackAreaPath} fillOpacity={0.1}  className="fill-foreground" />

        {/* 4. Zero line */}
        <line
          x1={PAD_LEFT} y1={ZERO_Y}
          x2={SVG_W - PAD_RIGHT} y2={ZERO_Y}
          strokeWidth={0.75}
          className="stroke-border"
        />

        {/* 5. Phase lines — always visible, faint */}
        {openingX !== null && (
          <>
            <line
              x1={openingX} y1={PAD_TOP}
              x2={openingX} y2={SVG_H - PAD_BOTTOM}
              strokeWidth={1} strokeDasharray="3 2"
              className="stroke-blue-400/40"
            />
            <text
              x={openingX + 3} y={PAD_TOP + 8}
              fontSize={8} fillOpacity={0.4}
              className="fill-blue-400"
            >
              Mid
            </text>
          </>
        )}
        {endgameX !== null && (
          <>
            <line
              x1={endgameX} y1={PAD_TOP}
              x2={endgameX} y2={SVG_H - PAD_BOTTOM}
              strokeWidth={1} strokeDasharray="3 2"
              className="stroke-orange-400/40"
            />
            <text
              x={endgameX + 3} y={PAD_TOP + 8}
              fontSize={8} fillOpacity={0.4}
              className="fill-orange-400"
            >
              End
            </text>
          </>
        )}

        {/* 6. Eval curve */}
        {points.length >= 2 && (
          <polyline
            points={polyline}
            fill="none"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            className="stroke-foreground/70"
          />
        )}

        {/* 7. Mate markers */}
        {matePoints.map((p) => {
          const size = 5;
          const tipY  = p.mateForWhite ? PAD_TOP : SVG_H - PAD_BOTTOM;
          const baseY = p.mateForWhite
            ? PAD_TOP + size * 1.5
            : SVG_H - PAD_BOTTOM - size * 1.5;
          return (
            <polygon
              key={`mate-${p.ply}`}
              points={`${p.x},${tipY} ${p.x - size},${baseY} ${p.x + size},${baseY}`}
              fillOpacity={0.8}
              className={p.mateForWhite ? "fill-foreground" : "fill-muted-foreground"}
            />
          );
        })}

        {/* 7b. Notable move markers — Brilliant / Great / Missed Win /
               Mistake / Blunder. Colored to match MoveClassificationBadge
               exactly, so the graph and the move-breakdown table agree. */}
        {notablePoints.map((p) => (
          <circle
            key={`notable-${p.ply}`}
            cx={p.x} cy={p.y}
            r={3.5}
            strokeWidth={1}
            className={`${toFillClass(CLASSIFICATION_META[p.classification].colorClass)} stroke-background`}
          />
        ))}

        {/* 8. Current ply vertical line */}
        {currentPoint && (
          <line
            x1={currentPoint.x} y1={PAD_TOP}
            x2={currentPoint.x} y2={SVG_H - PAD_BOTTOM}
            strokeWidth={1.5}
            className="stroke-[var(--accent-chess)]"
          />
        )}

        {/* 9. Current ply dot */}
        {currentPoint && (
          <circle
            cx={currentPoint.x} cy={currentPoint.y}
            r={3}
            strokeWidth={1.5}
            className="fill-[var(--accent-chess)] stroke-background"
          />
        )}

        {/* 10. Hover dot (only when different from current) */}
        {hoveredPoint && hoveredPoint.ply !== currentPly && (
          <circle
            cx={hoveredPoint.x} cy={hoveredPoint.y}
            r={2.5}
            strokeWidth={1}
            className="fill-muted-foreground/60 stroke-background"
          />
        )}
      </svg>

      {/* Phase legend */}
      <div className="flex items-center gap-3 px-1 shrink-0">
        {openingX !== null && (
          <div className="flex items-center gap-1">
            <svg width={12} height={8}>
              <line
                x1={0} y1={4} x2={12} y2={4}
                strokeWidth={1} strokeDasharray="3 2"
                className="stroke-blue-400/60"
              />
            </svg>
            <span className="text-[9px] text-muted-foreground/60">Opening</span>
          </div>
        )}
        {endgameStartPly >= 0 && (
          <div className="flex items-center gap-1">
            <svg width={12} height={8}>
              <line
                x1={0} y1={4} x2={12} y2={4}
                strokeWidth={1} strokeDasharray="3 2"
                className="stroke-orange-400/60"
              />
            </svg>
            <span className="text-[9px] text-muted-foreground/60">Endgame</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[9px] text-foreground/40">White ↑</span>
          <span className="text-[9px] text-muted-foreground/40">Black ↓</span>
        </div>
      </div>
    </div>
  );
}