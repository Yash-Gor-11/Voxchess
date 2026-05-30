import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Chess } from "chess.js";
import { ArrowLeft, ChevronRight, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
    buildTreeWithComments,
    parsePgnText,
} from "@/lib/chess/pgnImport";
import type { ParsedGame } from "@/lib/chess/pgnImport";
import {
    createStudy,
    saveImportedGame,
    saveFenPosition,
    saveStudyChapter,
} from "@/lib/supabase/games";
import { saveAnnotations } from "@/lib/supabase/annotations";

export const Route = createFileRoute("/_app/import")({
    head: () => ({ meta: [{ title: "Import — VoxChess" }] }),
    component: ImportPage,
});

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Mode = "pgn" | "fen" | "url";
type NavigateFn = ReturnType<typeof useNavigate>;

// ─────────────────────────────────────────────────────────────────────────────
// Shared import helpers
// ─────────────────────────────────────────────────────────────────────────────

async function doImportSingle(game: ParsedGame, navigate: NavigateFn) {
    const metadata = {
        White: game.headers.White ?? "White",
        Black: game.headers.Black ?? "Black",
        Event: game.headers.Event,
        Date: game.headers.Date,
    };
    const saved = await saveImportedGame(game.pgn, metadata, game.result);
    const hasSidelines = game.pgn.includes("(");
    const hasComments = game.comments.some((c) => c !== undefined) || !!game.rootComment;
    if (hasSidelines || hasComments) {
        await saveAnnotations(saved.id, buildTreeWithComments(game));
    }
    navigate({ to: "/analysis/$gameId", params: { gameId: saved.id } });
}

async function doImportAsStudy(
    games: ParsedGame[],
    studyName: string,
    navigate: NavigateFn,
) {
    const study = await createStudy(studyName.trim() || "Imported Study");
    for (let i = 0; i < games.length; i++) {
        const game = games[i];
        const metadata = {
            White: game.headers.White ?? "White",
            Black: game.headers.Black ?? "Black",
            Event: game.headers.Event,
            Date: game.headers.Date,
            ChapterName: game.headers.ChapterName,
        };
        const saved = await saveStudyChapter(
            study.id,
            game.pgn,
            metadata,
            game.result,
            i,
        );
        const hasSidelines = game.pgn.includes("(");
        const hasComments = game.comments.some((c) => c !== undefined) || !!game.rootComment;
        if (hasSidelines || hasComments) {
            try {
                await saveAnnotations(saved.id, buildTreeWithComments(game));
            } catch (e) {
                console.warn("Annotations failed for chapter, skipping:", e);
            }
        }
    }
    navigate({
        to: "/games/studies/$studyId",
        params: { studyId: study.id },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

function ImportPage() {
    const navigate = useNavigate();
    const [mode, setMode] = useState<Mode>("pgn");

    return (
        <div className="h-full overflow-y-auto">
            <div className="p-6 max-w-2xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate({ to: "/games" })}
                        aria-label="Back to games"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h2 className="text-lg font-semibold">Import</h2>
                        <p className="text-sm text-muted-foreground">
                            Add games to your library
                        </p>
                    </div>
                </div>

                {/* Mode tabs */}
                <div className="flex border-b">
                    {(["pgn", "fen", "url"] as Mode[]).map((m) => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            className={cn(
                                "px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                                mode === m
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {m.toUpperCase()}
                        </button>
                    ))}
                </div>

                {mode === "pgn" && <PgnPanel navigate={navigate} />}
                {mode === "fen" && <FenPanel navigate={navigate} />}
                {mode === "url" && <UrlPanel navigate={navigate} />}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PGN panel
// ─────────────────────────────────────────────────────────────────────────────

function PgnPanel({ navigate }: { navigate: NavigateFn }) {
    const [raw, setRaw] = useState("");
    const [parsed, setParsed] = useState<ParsedGame[] | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    function handleParse() {
        if (!raw.trim()) { toast.error("Paste a PGN first"); return; }
        const games = parsePgnText(raw);
        if (games.length === 0) {
            toast.error("No valid games found — check your PGN");
            return;
        }
        setParsed(games);
    }

    function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setRaw((ev.target?.result as string) ?? "");
        reader.readAsText(file);
    }

    if (parsed !== null) {
        return (
            <Preview games={parsed} onBack={() => setParsed(null)} navigate={navigate} />
        );
    }

    return (
        <div className="space-y-3">
            <Textarea
                placeholder={"[Event \"Example\"]\n[White \"Alice\"]\n[Black \"Bob\"]\n[Result \"1-0\"]\n\n1. e4 e5 2. Nf3 Nc6 ..."}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                className="h-52 font-mono text-xs resize-none"
            />
            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    Upload .pgn
                </Button>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".pgn,.txt"
                    className="hidden"
                    onChange={handleFile}
                />
                <Button
                    size="sm"
                    className="ml-auto"
                    onClick={handleParse}
                    disabled={!raw.trim()}
                >
                    Parse
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// FEN panel
// ─────────────────────────────────────────────────────────────────────────────

function FenPanel({ navigate }: { navigate: NavigateFn }) {
    const [fen, setFen] = useState("");
    const [name, setName] = useState("");
    const [fenError, setFenError] = useState("");
    const [saving, setSaving] = useState(false);

    function onFenChange(val: string) {
        setFen(val);
        if (!val.trim()) { setFenError(""); return; }
        try {
            new Chess(val.trim());
            setFenError("");
        } catch {
            setFenError("Invalid FEN string");
        }
    }

    async function handleImport() {
        const trimmed = fen.trim();
        if (!trimmed || fenError) return;
        setSaving(true);
        try {
            const saved = await saveFenPosition(
                trimmed,
                name.trim() || "Saved Position",
            );
            toast.success("Position saved");
            navigate({ to: "/analysis/$gameId", params: { gameId: saved.id } });
        } catch {
            toast.error("Failed to save position");
            setSaving(false);
        }
    }

    const isValid = !!(fen.trim() && !fenError);

    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <label className="text-sm font-medium">FEN string</label>
                <Input
                    value={fen}
                    onChange={(e) => onFenChange(e.target.value)}
                    placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                    className={cn(
                        "font-mono text-xs",
                        fenError && "border-destructive focus-visible:ring-destructive",
                    )}
                />
                {fenError && (
                    <p className="text-xs text-destructive">{fenError}</p>
                )}
                {isValid && (
                    <p className="text-xs text-[var(--accent-chess)]">Valid position ✓</p>
                )}
            </div>

            <div className="space-y-1.5">
                <label className="text-sm font-medium">
                    Name{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Sicilian Najdorf — critical line"
                />
            </div>

            <Button
                className="w-full"
                onClick={handleImport}
                disabled={!isValid || saving}
            >
                {saving ? "Saving…" : "Open in Analysis"}
            </Button>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// URL panel
// ─────────────────────────────────────────────────────────────────────────────

type UrlPlatform = "lichess_game" | "lichess_study" | "chessdotcom" | null;

interface UrlInfo {
    platform: UrlPlatform;
    apiUrl: string | null;
}

function detectUrl(url: string): UrlInfo {
    // Lichess study: lichess.org/study/{studyId}
    let m = url.match(/lichess\.org\/study\/([a-zA-Z0-9]+)/);
    if (m)
        return {
            platform: "lichess_study",
            apiUrl: `https://lichess.org/api/study/${m[1]}.pgn`,
        };

    // Lichess game: lichess.org/{8-char id}
    m = url.match(/lichess\.org\/([a-zA-Z0-9]{8})(?:[/?#]|$)/);
    if (m)
        return {
            platform: "lichess_game",
            apiUrl: `https://lichess.org/game/export/${m[1]}?clocks=false&evals=false`,
        };

    // Chess.com game: chess.com/game/live|daily|computer/{id}
    m = url.match(/chess\.com\/(?:game|analysis)\/(?:live|daily|computer)\/(\d+)/);
    if (m)
        return {
            platform: "chessdotcom",
            apiUrl: `https://api.chess.com/pub/game/${m[1]}`,
        };

    return { platform: null, apiUrl: null };
}

const PLATFORM_LABEL: Record<NonNullable<UrlPlatform>, string> = {
    lichess_game: "Lichess game",
    lichess_study: "Lichess study (multi-game)",
    chessdotcom: "Chess.com game",
};

function UrlPanel({ navigate }: { navigate: NavigateFn }) {
    const [url, setUrl] = useState("");
    const [fetching, setFetching] = useState(false);
    const [parsed, setParsed] = useState<ParsedGame[] | null>(null);

    const { platform, apiUrl } = detectUrl(url.trim());

    async function handleFetch() {
        if (!apiUrl || !platform) return;

        if (platform === "chessdotcom") {
            toast.error(
                "Chess.com games can't be fetched by URL — paste the PGN instead (Share → Copy PGN in the game viewer)",
            );
            return;
        }

        setFetching(true);
        try {
            const res = await fetch(apiUrl, {
                headers: { Accept: "application/x-chess-pgn" },
            });
            if (!res.ok) throw new Error(`Lichess returned ${res.status}`);
            const pgnText = await res.text();
            if (!pgnText.trim()) throw new Error("Empty response — is the game public?");
            const games = parsePgnText(pgnText);
            if (games.length === 0) throw new Error("No valid games in response");
            setParsed(games);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Fetch failed");
        } finally {
            setFetching(false);
        }
    }
    if (parsed !== null) {
        return (
            <Preview games={parsed} onBack={() => setParsed(null)} navigate={navigate} />
        );
    }

    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <label className="text-sm font-medium">Game or study URL</label>
                <div className="flex gap-2">
                    <Input
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://lichess.org/xYzAbC12"
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && platform) handleFetch();
                        }}
                    />
                    <Button onClick={handleFetch} disabled={!platform || fetching}>
                        {fetching ? "Fetching…" : "Fetch"}
                    </Button>
                </div>

                {platform ? (
                    <p className="text-xs text-muted-foreground">
                        Detected:{" "}
                        <span className="text-foreground font-medium">
                            {PLATFORM_LABEL[platform]}
                        </span>
                    </p>
                ) : url.trim() ? (
                    <p className="text-xs text-destructive">
                        URL not recognised — see supported formats below
                    </p>
                ) : null}
            </div>

            <div className="rounded-lg border bg-muted/40 p-4 space-y-1.5">
                <p className="text-xs font-medium text-foreground mb-2">
                    Supported URLs
                </p>
                {[
                    ["Lichess game", "lichess.org/{gameId}"],
                    ["Lichess study", "lichess.org/study/{studyId}"],
                    ["Chess.com game", "chess.com/game/live/{gameId}"],
                ].map(([label, fmt]) => (
                    <div key={label} className="flex gap-3 text-xs">
                        <span className="text-muted-foreground w-28 flex-shrink-0">
                            {label}
                        </span>
                        <span className="font-mono text-muted-foreground">{fmt}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared preview — single game or multi-game study flow
// ─────────────────────────────────────────────────────────────────────────────

function Preview({
    games,
    onBack,
    navigate,
}: {
    games: ParsedGame[];
    onBack: () => void;
    navigate: NavigateFn;
}) {
    const isSingle = games.length === 1;

    const [selected, setSelected] = useState<Set<number>>(
        () => new Set(games.map((_, i) => i)),
    );
    const [studyName, setStudyName] = useState(() => {
        const ev = games[0]?.headers.Event;
        return ev && ev !== "?" && ev !== "Casual Game" ? ev : "Imported Study";
    });
    const [saving, setSaving] = useState(false);

    function toggle(i: number) {
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(i) ? next.delete(i) : next.add(i);
            return next;
        });
    }

    function toggleAll() {
        setSelected(
            selected.size === games.length
                ? new Set()
                : new Set(games.map((_, i) => i)),
        );
    }

    async function handleImportSingle() {
        setSaving(true);
        try {
            await doImportSingle(games[0], navigate);
            toast.success("Game imported");
        } catch {
            toast.error("Import failed");
            setSaving(false);
        }
    }

    async function handleImportAsStudy() {
        const toImport = games.filter((_, i) => selected.has(i));
        if (toImport.length === 0) {
            toast.error("Select at least one game");
            return;
        }
        setSaving(true);
        try {
            await doImportAsStudy(toImport, studyName, navigate);
            toast.success(
                `"${studyName.trim() || "Imported Study"}" created with ${toImport.length} chapter${toImport.length !== 1 ? "s" : ""}`,
            );
        } catch {
            toast.error("Import failed");
            setSaving(false);
        }
    }

    return (
        <div className="space-y-4">
            {/* Back + count */}
            <div className="flex items-center gap-2">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onBack}
                    className="h-8 px-2"
                >
                    <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                    Back
                </Button>
                <span className="text-sm text-muted-foreground">
                    {games.length} game{games.length !== 1 ? "s" : ""} found
                </span>
            </div>

            {isSingle ? (
                /* ── Single game preview ── */
                <Card className="p-5 space-y-4">
                    <GameCard game={games[0]} />
                    <Button className="w-full" onClick={handleImportSingle} disabled={saving}>
                        {saving ? "Importing…" : "Import & Analyse"}
                    </Button>
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs">
                            <span className="bg-card px-2 text-muted-foreground">or save as study</span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Input
                            value={studyName}
                            onChange={(e) => setStudyName(e.target.value)}
                            placeholder="Study name"
                            className="flex-1"
                        />
                        <Button variant="outline" onClick={handleImportAsStudy} disabled={saving}>
                            {saving ? "Saving…" : "Save"}
                        </Button>
                    </div>
                </Card>
            ) : (
                /* ── Multi-game: study flow ── */
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Study name</label>
                        <Input
                            value={studyName}
                            onChange={(e) => setStudyName(e.target.value)}
                            placeholder="My Study"
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                                Games{" "}
                                <span className="font-normal text-muted-foreground">
                                    ({selected.size} of {games.length} selected)
                                </span>
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={toggleAll}
                            >
                                {selected.size === games.length ? "Deselect all" : "Select all"}
                            </Button>
                        </div>

                        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
                            {games.map((game, i) => (
                                <Card
                                    key={i}
                                    className={cn(
                                        "flex items-center gap-3 px-4 py-3 cursor-pointer select-none transition-colors hover:bg-muted/50",
                                        selected.has(i) && "border-primary/40 bg-primary/[0.02]",
                                    )}
                                    onClick={() => toggle(i)}
                                >
                                    <Checkbox
                                        checked={selected.has(i)}
                                        onCheckedChange={() => toggle(i)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    <div className="w-5 flex-shrink-0 text-xs font-mono text-muted-foreground text-right">
                                        {i + 1}
                                    </div>
                                    <GameCard game={game} compact />
                                </Card>
                            ))}
                        </div>
                    </div>

                    <Button
                        className="w-full"
                        onClick={handleImportAsStudy}
                        disabled={saving || selected.size === 0}
                    >
                        {saving
                            ? "Importing…"
                            : `Import ${selected.size} game${selected.size !== 1 ? "s" : ""} as Study`}
                    </Button>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Game summary card (used in both single-preview and multi-game list)
// ─────────────────────────────────────────────────────────────────────────────

function GameCard({
    game,
    compact = false,
}: {
    game: ParsedGame;
    compact?: boolean;
}) {
    const white = game.headers.White ?? "White";
    const black = game.headers.Black ?? "Black";
    const event = game.headers.Event;
    const date = game.headers.Date;
    const fullMoves = Math.ceil(game.moves.length / 2);
    const commentCount =
        game.comments.filter((c) => c !== undefined).length +
        (game.rootComment ? 1 : 0);

    const resultBadge =
        game.result === "white"
            ? "1–0"
            : game.result === "black"
                ? "0–1"
                : game.result === "draw"
                    ? "½–½"
                    : null;

    const subtitle = [
        event && event !== "?" ? event : null,
        date && date !== "????.??.??" ? date : null,
        `${fullMoves} move${fullMoves !== 1 ? "s" : ""}`,
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium truncate">
                    {white} vs {black}
                </span>
                {resultBadge && (
                    <Badge variant="secondary" className="flex-shrink-0 text-xs py-0">
                        {resultBadge}
                    </Badge>
                )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
                {subtitle}
                {!compact && commentCount > 0 && (
                    <span className="ml-1.5 text-[var(--accent-chess)]">
                        · {commentCount} annotation{commentCount !== 1 ? "s" : ""}
                    </span>
                )}
            </div>
        </div>
    );
}