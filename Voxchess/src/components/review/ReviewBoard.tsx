// src/components/review/ReviewBoard.tsx

import { useState, useEffect, useRef, useCallback } from "react";
import {
    ChevronLeft, MoreHorizontal, FlipHorizontal2,
    Check, BarChart2, Cpu, User2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Chessboard } from "react-chessboard";
import { BoardOverlay } from "@/components/chess/BoardOverlay";
import { EvalBar } from "@/components/chess/EvalBar";
import { ReviewCoach, type NavigationSource } from "@/components/review/ReviewCoach";
import { ReviewMoveList } from "@/components/review/ReviewMoveList";
import { EvalGraph } from "@/components/review/EvalGraph";
import { MoveClassificationBadge } from "@/components/review/MoveClassificationBadge";
import { MenuItem, MenuSeparator } from "@/components/chess/MenuItems";
import { useSettingsStore, BOARD_THEMES } from "@/stores/settingsStore";
import type { ReviewModel } from "@/lib/chess/reviewEngine";
import type { PersonalityId } from "@/lib/chess/personalities";
import { getPersonality } from "@/lib/chess/personalities";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReviewBoardProps {
    review: ReviewModel;
    fenHistory: readonly string[];   // index = ply (0 = start position)
    playerColor: "white" | "black";
    personalityId: PersonalityId | null;
    onBackToOverview: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcBoardSize(): number {
    if (typeof window === "undefined") return 420;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isPortrait = vw < vh;
    if (isPortrait) return Math.min(Math.max(vw - 48, 180), 500);
    const sidebarW = vw >= 768 ? 240 : 0;
    const rightPanelW = vw >= 1024 ? 300 : 0;
    const padding = 56;
    const availW = vw - sidebarW - rightPanelW - padding;
    const availH = vh - 64 - 48 - 80 - padding;
    return Math.min(Math.max(Math.min(availH, availW), 180), 580);
}

/** Format a mate score for engine line display, matching EvalGraph convention. */
function formatMateScore(mate: number): string {
    return mate > 0 ? `+M${mate}` : `-M${Math.abs(mate)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReviewBoard({
    review,
    fenHistory,
    playerColor,
    personalityId,
    onBackToOverview,
}: ReviewBoardProps) {
    const { boardThemeIndex } = useSettingsStore();
    const boardTheme = BOARD_THEMES[boardThemeIndex] ?? BOARD_THEMES[0];

    // ── Panel visibility ──────────────────────────────────────────────────────
    const [showCoach, setShowCoach] = useState(true);
    const [showEngine, setShowEngine] = useState(true);
    const [showEvalGraph, setShowEvalGraph] = useState(false);
    const [flipped, setFlipped] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [boardSize, setBoardSize] = useState(calcBoardSize);
    const [isPortrait, setIsPortrait] = useState(
        typeof window !== "undefined"
            ? window.innerWidth < window.innerHeight
            : false,
    );

    // ── Navigation state ──────────────────────────────────────────────────────
    const [currentPly, setCurrentPly] = useState(0);
    const [navigationSource, setNavigationSource] =
        useState<NavigationSource>("initial");

    const menuRef = useRef<HTMLDivElement>(null);
    const boardRef = useRef<HTMLDivElement>(null);

    // ── Derived values ────────────────────────────────────────────────────────
    const totalPlies = review.moves.length;
    const currentMove = review.moves[currentPly - 1] ?? null; // ply 0 = no move yet
    const displayFen = fenHistory[currentPly] ?? fenHistory[fenHistory.length - 1];
    const personality = personalityId ? getPersonality(personalityId) : null;

    const evalForBar =
        currentMove === null
            ? null
            : {
                score: currentMove.evalAfter ?? 0,
                mate: currentMove.mateAfter,
                bestMoves: [],
                depth: review.depth,
            };
    // Best move arrow — handle UCI strings of length 4 (normal) and 5 (promotion)
    const bestMoveArrows = (() => {
        const bm = currentMove?.bestMove;
        if (!bm || bm.length < 4) return [];
        return [{
            from: bm.slice(0, 2),
            to: bm.slice(2, 4),
            promotion: bm.length > 4 ? bm[4] : undefined,
        }];
    })();

    // Board orientation: flipped toggles relative to the player's default side
    const defaultOrientation: "white" | "black" =
        playerColor === "black" ? "black" : "white";
    const boardOrientation: "white" | "black" =
        flipped
            ? (defaultOrientation === "white" ? "black" : "white")
            : defaultOrientation;


    // ── Navigation ────────────────────────────────────────────────────────────

    const goToPly = useCallback(
        (ply: number, source: NavigationSource) => {
            const clamped = Math.max(0, Math.min(totalPlies, ply));
            // Always update source so coach trigger matrix fires correctly,
            // but skip the ply update if we're already there
            if (clamped !== currentPly) setCurrentPly(clamped);
            setNavigationSource(source);
        },
        [currentPly, totalPlies],
    );

    const goForward = useCallback(
        () => goToPly(currentPly + 1, "forward"), [currentPly, goToPly],
    );
    const goBackward = useCallback(
        () => goToPly(currentPly - 1, "backward"), [currentPly, goToPly],
    );
    const goFirst = useCallback(
        () => goToPly(0, "jump"), [goToPly],
    );
    const goLast = useCallback(
        () => goToPly(totalPlies, "jump"), [totalPlies, goToPly],
    );

    // ── Keyboard shortcuts ────────────────────────────────────────────────────

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const el = document.activeElement as HTMLElement | null;
            const inputFocused =
                !!el &&
                (el instanceof HTMLInputElement ||
                    el instanceof HTMLTextAreaElement ||
                    el.isContentEditable);
            if (inputFocused) return;

            if (e.key === "ArrowLeft") { e.preventDefault(); goBackward(); }
            if (e.key === "ArrowRight") { e.preventDefault(); goForward(); }
            if (e.key === "Home") { e.preventDefault(); goFirst(); }
            if (e.key === "End") { e.preventDefault(); goLast(); }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [goBackward, goForward, goFirst, goLast]);

    // ── Resize ────────────────────────────────────────────────────────────────

    useEffect(() => {
        function onResize() {
            setIsPortrait(window.innerWidth < window.innerHeight);
            setBoardSize(calcBoardSize());
        }
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    // ── Menu outside click ────────────────────────────────────────────────────

    useEffect(() => {
        function handleOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        }
        if (menuOpen) document.addEventListener("mousedown", handleOutside);
        return () => document.removeEventListener("mousedown", handleOutside);
    }, [menuOpen]);

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="h-full overflow-y-auto">
            <div className={`flex flex-col p-3 gap-3 ${isPortrait ? "overflow-y-auto" : "h-full overflow-hidden"
                }`}>

                {/* ── Action bar ─────────────────────────────────────────────────── */}
                <div className="flex items-center gap-2 shrink-0">

                    <button
                        onClick={onBackToOverview}
                        className="inline-flex items-center gap-1 h-8 px-2 rounded-md
                       hover:bg-accent transition-colors text-sm
                       text-muted-foreground"
                    >
                        <ChevronLeft className="h-4 w-4" />
                        <span className="hidden sm:inline">Overview</span>
                    </button>

                    {/* Current move indicator */}
                    <div className="flex items-center gap-1.5 min-w-0">
                        {currentMove ? (
                            <>
                                <Badge
                                    variant="outline"
                                    className="shrink-0 font-mono text-xs"
                                >
                                    {Math.ceil(currentMove.ply / 2)}
                                    {currentMove.ply % 2 === 1 ? "." : "…"}
                                    {" "}{currentMove.san}
                                </Badge>
                                <MoveClassificationBadge
                                    classification={currentMove.classification}
                                    variant="symbol"
                                />
                            </>
                        ) : (
                            <Badge variant="outline" className="shrink-0 text-xs">
                                Start
                            </Badge>
                        )}
                    </div>

                    <div className="ml-auto flex items-center gap-1 shrink-0">
                        <button
                            onClick={goBackward}
                            disabled={currentPly === 0}
                            aria-label="Previous move"
                            className="inline-flex items-center justify-center h-8 w-8
                         rounded-md hover:bg-accent transition-colors
                         disabled:opacity-40 disabled:pointer-events-none
                         text-sm"
                        >‹</button>
                        <button
                            onClick={goForward}
                            disabled={currentPly === totalPlies}
                            aria-label="Next move"
                            className="inline-flex items-center justify-center h-8 w-8
                         rounded-md hover:bg-accent transition-colors
                         disabled:opacity-40 disabled:pointer-events-none
                         text-sm"
                        >›</button>

                        {/* ... menu */}
                        <div className="relative" ref={menuRef}>
                            <button
                                onClick={() => setMenuOpen((o) => !o)}
                                className="inline-flex items-center justify-center h-8 w-8
                           rounded-md border border-input bg-background
                           hover:bg-accent transition-colors"
                            >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>

                            {menuOpen && (
                                <div className="absolute right-0 top-full mt-1 w-52
                                bg-card border border-border rounded-md
                                shadow-lg py-1 z-50">
                                    <MenuItem
                                        label="Flip Board"
                                        icon={FlipHorizontal2}
                                        onClick={() => {
                                            setFlipped((f) => !f);
                                            setMenuOpen(false);
                                        }}
                                    />
                                    <MenuSeparator />
                                    <MenuItem
                                        label="Show Coach"
                                        icon={Check}
                                        isCheckbox
                                        checked={showCoach}
                                        onClick={() => setShowCoach((v) => !v)}
                                    />
                                    <MenuItem
                                        label="Show Engine Lines"
                                        icon={Cpu}
                                        isCheckbox
                                        checked={showEngine}
                                        onClick={() => setShowEngine((v) => !v)}
                                    />
                                    <MenuItem
                                        label="Show Eval Graph"
                                        icon={BarChart2}
                                        isCheckbox
                                        checked={showEvalGraph}
                                        onClick={() => setShowEvalGraph((v) => !v)}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Main grid ──────────────────────────────────────────────────── */}
                <div className={
                    isPortrait
                        ? "flex flex-col gap-3"
                        : "flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3 overflow-hidden"
                }>

                    {/* Board card */}
                    <Card className={`p-3 ${isPortrait ? "shrink-0" : "overflow-hidden"}`}>
                        <div className={`flex flex-col items-center gap-2 ${isPortrait ? "" : "justify-center h-full"
                            }`}>

                            {/* Opponent label */}
                            <div className="flex items-center gap-2 text-sm
                              text-muted-foreground w-full justify-center">
                                {personality ? (
                                    <>
                                        <img
                                            src={personality.images.idle}
                                            alt={personality.name}
                                            className="h-5 w-5 object-contain"
                                            loading="lazy"
                                            decoding="async"
                                            onError={(e) => {
                                                (e.currentTarget as HTMLImageElement).style.display =
                                                    "none";
                                            }}
                                        />
                                        <span className="font-medium text-foreground text-xs">
                                            {personality.name}
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-xs text-muted-foreground">
                                        {playerColor === "white" ? "Black" : "White"}
                                    </span>
                                )}
                            </div>

                            {/* Board + eval bar */}
                            <div className="flex items-center gap-2">
                                <EvalBar
                                    evaluation={evalForBar}
                                    orientation={boardOrientation}
                                />
                                <div
                                    ref={boardRef}
                                    className="relative"
                                    style={{ width: boardSize, height: boardSize }}
                                >
                                    <Chessboard
                                        options={{
                                            position: displayFen,
                                            boardOrientation,
                                            boardStyle: { borderRadius: 6, overflow: "hidden" },
                                            darkSquareStyle: { backgroundColor: boardTheme.dark },
                                            lightSquareStyle: { backgroundColor: boardTheme.light },
                                        }}
                                    />
                                    <BoardOverlay
                                        arrows={bestMoveArrows}
                                        highlights={[]}
                                        boardRef={boardRef}
                                    />
                                </div>
                            </div>

                            {/* Player label */}
                            <div className="flex items-center gap-2 text-sm w-full justify-center">
                                <User2 className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium text-xs">You</span>
                                <span className="text-xs text-muted-foreground">
                                    · {playerColor === "white" ? "White" : "Black"}
                                </span>
                            </div>

                            {/* Portrait navigation row */}
                            {isPortrait && (
                                <div className="flex items-center gap-2 w-full justify-center">
                                    {[
                                        { label: "⏮", action: goFirst, disabled: currentPly === 0 },
                                        { label: "‹", action: goBackward, disabled: currentPly === 0 },
                                        { label: "›", action: goForward, disabled: currentPly === totalPlies },
                                        { label: "⏭", action: goLast, disabled: currentPly === totalPlies },
                                    ].map(({ label, action, disabled }) => (
                                        <button
                                            key={label}
                                            onClick={action}
                                            disabled={disabled}
                                            className="h-8 px-3 rounded hover:bg-accent transition-colors
                                 disabled:opacity-40 disabled:pointer-events-none
                                 text-sm"
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* Right panel */}
                    <div className={`flex flex-col gap-3 ${isPortrait ? "" : "min-h-0 overflow-hidden lg:h-full"
                        }`}>

                        {/* Coach */}
                        {showCoach && (
                            <Card className="shrink-0">
                                <ReviewCoach
                                    move={currentMove}
                                    personalityId={personalityId ?? "frost"}
                                    navigationSource={navigationSource}
                                    isVisible={true}
                                />
                            </Card>
                        )}

                        {/* Eval graph */}
                        {showEvalGraph && (
                            <Card className="p-4 shrink-0">
                                <EvalGraph
                                    moves={review.moves}
                                    currentPly={currentPly}
                                    onSelectPly={(ply) => goToPly(ply, "eval-graph")}
                                    openingEndPly={review.openingEndPly}
                                    endgameStartPly={review.endgameStartPly}
                                />
                            </Card>
                        )}

                        {/* Engine lines */}
                        {showEngine && currentMove && (
                            <Card className="p-4 shrink-0">
                                <div className="text-xs font-medium uppercase tracking-wider
                                text-muted-foreground mb-2">
                                    Engine
                                </div>
                                <div className="space-y-1">
                                    {currentMove.engineLines.length > 0
                                        ? currentMove.engineLines.map((line, i) => (
                                            <div
                                                key={i}
                                                className="flex items-center justify-between
                                     gap-2 text-xs font-mono"
                                            >
                                                <span className="text-muted-foreground truncate">
                                                    {line.san.slice(0, 6).join(" ")}
                                                    {line.san.length > 6 ? "…" : ""}
                                                </span>
                                                <span className={`shrink-0 font-semibold ${(line.eval ?? 0) >= 0
                                                    ? "text-foreground"
                                                    : "text-muted-foreground"
                                                    }`}>
                                                    {line.mate !== null
                                                        ? formatMateScore(line.mate)
                                                        : line.eval !== null
                                                            ? `${line.eval >= 0 ? "+" : ""}${(line.eval / 100).toFixed(2)}`
                                                            : "—"
                                                    }
                                                </span>
                                            </div>
                                        ))
                                        : (
                                            <div className="text-xs text-muted-foreground italic">
                                                No engine data for this position.
                                            </div>
                                        )
                                    }
                                    <div className="text-[10px] text-muted-foreground/50 pt-1">
                                        Depth {review.depth}
                                    </div>
                                </div>
                            </Card>
                        )}

                        {/* Move list — always visible */}
                        <Card className={`p-4 flex flex-col ${isPortrait ? "min-h-48" : "flex-1 min-h-0"
                            }`}>
                            <ReviewMoveList
                                moves={review.moves}
                                currentPly={currentPly}
                                onSelectPly={(ply) => goToPly(ply, "move-list")}
                                openingEndPly={review.openingEndPly}
                                className="flex-1 min-h-0"
                            />
                        </Card>
                    </div>
                </div>

                <style>{`
          @keyframes avatarBob {
            0%, 100% { transform: translateY(0px); }
            50%       { transform: translateY(-4px); }
          }
          @keyframes avatarTalk {
            0%, 100% { transform: scale(1); }
            50%       { transform: scale(1.05); }
          }
        `}</style>
            </div>
        </div>
    );
}