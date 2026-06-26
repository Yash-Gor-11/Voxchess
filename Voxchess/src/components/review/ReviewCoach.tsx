// src/components/review/ReviewCoach.tsx

import { useState, useEffect, useRef } from "react";
import { getClassificationMeta } from "@/components/review/MoveClassificationBadge";
import {
  getPersonality, pickRandom,
  type PersonalityId, type AvatarState,
} from "@/lib/chess/personalities";
import { hashText } from "@/lib/voice/hashText";
import { selectVoice } from "@/lib/voice/selectVoice";
import type { MoveReview, MoveClassification } from "@/lib/chess/reviewEngine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NavigationSource =
  | "forward"
  | "backward"
  | "move-list"
  | "eval-graph"
  | "jump"
  | "initial";

interface ReviewCoachProps {
  move: MoveReview | null;       // null = start position (before move 1)
  personalityId: PersonalityId;
  navigationSource: NavigationSource;
  isVisible: boolean;
}

// ─── Classification policy ────────────────────────────────────────────────────

/** Notable moves trigger audio on approved navigation sources. */
const NOTABLE: ReadonlySet<MoveClassification> = new Set([
  "brilliant", "great", "inaccuracy", "mistake", "blunder", "missedWin",
]);

/** Sources that can trigger audio for notable moves. */
const SPEAKING_SOURCES: ReadonlySet<NavigationSource> = new Set([
  "forward", "move-list", "eval-graph", "jump",
]);

/** Explicit sources: arriving here intentionally, replay even if already spoken. */
const EXPLICIT_SOURCES: ReadonlySet<NavigationSource> = new Set([
  "move-list", "eval-graph",
]);

// ─── Response bank selector ───────────────────────────────────────────────────

function getResponseBank(
  classification: MoveClassification,
  personality: ReturnType<typeof getPersonality>,
): string[] {
  switch (classification) {
    case "brilliant":  return personality.responses.reviewBrilliant;
    case "great":      return personality.responses.reviewGreat;
    case "best":       return personality.responses.reviewBest;
    case "excellent":   return personality.responses.reviewExcellent;
    case "good":       return personality.responses.reviewGood;
    case "inaccuracy": return personality.responses.reviewInaccuracy;
    case "mistake":    return personality.responses.reviewMistake;
    case "blunder":
    case "missedWin":  return personality.responses.reviewBlunder;
    case "book":       return personality.responses.reviewBook;
  }
}

// ─── Non-repeating random pick ────────────────────────────────────────────────

function pickNonRepeating(bank: string[], lastLine: string | null): string {
  if (bank.length <= 1) return bank[0] ?? "";
  let pick = pickRandom(bank);
  // One reroll if we hit the same line as last time
  if (pick === lastLine) pick = pickRandom(bank);
  return pick;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReviewCoach({
  move,
  personalityId,
  navigationSource,
  isVisible,
}: ReviewCoachProps) {
  const personality = getPersonality(personalityId);

  const [avatarText, setAvatarText] = useState("");
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  // displayText is always set — shown in panel regardless of whether audio fires
  const [displayText, setDisplayText] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSpokenPlyRef = useRef<number | null>(null);
  const lastLineRef = useRef<string | null>(null);

  // ── Text for every move (always shown) ───────────────────────────────────

  useEffect(() => {
    if (!move) {
      setDisplayText("Navigate through the game to hear commentary.");
      return;
    }
    const bank = getResponseBank(move.classification, personality);
    // Pick display text deterministically by ply so it's stable across re-renders
    // Use modulo to avoid seeding issues — consistent for a given ply in this session
    const text = bank[move.ply % bank.length] ?? bank[0];
    setDisplayText(text);
  // Recompute when the move changes or personality changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [move?.ply, personalityId]);

  // ── Audio trigger logic ───────────────────────────────────────────────────

  useEffect(() => {
    if (!move) {
      stopAudio();
      setAvatarState("idle");
      setAvatarText("");
      return;
    }

    // Going backward: silence the coach, keep display text
    if (navigationSource === "backward" || navigationSource === "initial") {
      stopAudio();
      setAvatarState("idle");
      setAvatarText("");
      return;
    }

    if (!SPEAKING_SOURCES.has(navigationSource)) return;
    if (!NOTABLE.has(move.classification)) return;

    // Suppress automatic re-trigger on same ply unless user explicitly clicked
    const isExplicit = EXPLICIT_SOURCES.has(navigationSource);
    const alreadySpoken = move.ply === lastSpokenPlyRef.current;
    if (alreadySpoken && !isExplicit) return;

    const bank = getResponseBank(move.classification, personality);
    const text = pickNonRepeating(bank, lastLineRef.current);
    lastLineRef.current = text;
    lastSpokenPlyRef.current = move.ply;

    speakLine(text);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [move?.ply, move?.classification, personalityId, navigationSource]);

  // ── Audio helpers ─────────────────────────────────────────────────────────

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function onSpeechEnd() {
    setAvatarState("idle");
    setAvatarText("");
  }

  function speakLine(text: string) {
    stopAudio();
    setAvatarText(text);
    setAvatarState("talking");

    const volume = personality.voice.volume ?? 1.0;
    const hash = hashText(text);
    const audio = new Audio(`/characters/${personality.id}/audio/${hash}.mp3`);
    audio.volume = volume;
    audioRef.current = audio;

    // Synchronize avatar with actual audio completion
    audio.onended = onSpeechEnd;

    audio.play()
      .then(() => { window.speechSynthesis?.cancel(); })
      .catch(() => {
        audioRef.current = null;
        if (typeof window === "undefined" || !window.speechSynthesis) return;
        const utt = new SpeechSynthesisUtterance(text);
        const v = personality.voice;
        utt.pitch = v.pitch;
        utt.rate = v.rate;
        utt.volume = volume;
        utt.onend = onSpeechEnd;
        const voice = selectVoice(v.preferredVoices);
        if (voice) utt.voice = voice;
        window.speechSynthesis.speak(utt);
      });
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => { stopAudio(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isVisible) return null;

  const meta = move ? getClassificationMeta(move.classification) : null;

  return (
    <div className="p-4 shrink-0">
      <div className="flex items-start gap-3">

        {/* Avatar */}
        <div className="shrink-0 w-16 h-16">
          <img
            key={avatarState}
            src={personality.images[avatarState]}
            alt={personality.name}
            className="w-full h-full object-contain drop-shadow-sm"
            style={{
              animation:
                avatarState === "idle"
                  ? "avatarBob 3s ease-in-out infinite"
                  : "avatarTalk 0.3s ease-in-out",
            }}
            onError={(e) => {
              const el = e.currentTarget as HTMLImageElement;
              el.style.display = "none";
              const fallback = el.nextSibling as HTMLElement | null;
              if (fallback) fallback.style.display = "flex";
            }}
          />
          <div
            style={{ display: "none" }}
            className="w-full h-full items-center justify-center text-4xl"
          >
            {personality.emoji}
          </div>
        </div>

        {/* Text panel */}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-foreground">
            {personality.name}
          </div>
          <div className="text-[10px] text-muted-foreground mb-1">
            {personality.species}
          </div>

          {/* Classification label */}
          {move && meta && (
            <div className={`text-[10px] font-medium mb-1 ${meta.colorClass}`}>
              {meta.label}
            </div>
          )}

          {/*
            Always show a coach line.
            If audio is playing, show the spoken line (avatarText).
            Otherwise show the stable display text for this move.
          */}
          <div className="text-xs text-foreground/80 leading-relaxed">
            {avatarText || displayText}
          </div>
        </div>
      </div>
    </div>
  );
}