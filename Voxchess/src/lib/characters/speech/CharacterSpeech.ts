// src/lib/characters/speech/CharacterSpeech.ts
//
// Unifies the two near-identical implementations found during the Phase 1
// audit: play.tsx's speakAvatar() and ReviewCoach.tsx's speakLine().
// Verified against the CURRENT source of both files before writing this
// (not the versions originally audited) — the underlying audio/TTS
// mechanics are byte-for-byte identical between the two call sites; only
// their AVATAR-STATE handling around that mechanics differs, and that
// difference is deliberately NOT unified (see below).
//
// ONE REAL BEHAVIORAL DIVERGENCE FOUND AND RESOLVED:
//   - ReviewCoach.speakLine() attaches `audio.onended` / `utt.onend` and
//     reverts avatar state exactly when speech actually finishes.
//   - play.tsx's speakAvatar() instead uses an independent
//     `setTimeout(duration)` (default 4000ms) to revert avatar state,
//     completely decoupled from whether the audio/TTS is still playing —
//     and does NOT attach onend to the TTS fallback path at all.
//
// This means play.tsx's original implementation has a latent bug: if the
// TTS fallback takes longer than `duration` to finish speaking a longer
// line, the avatar visually stops "talking" while speech is still
// playing. This module adopts ReviewCoach's event-driven approach as
// canonical (it's strictly more correct) via the `onComplete` callback,
// which fires from whichever path actually completes (audio.onended OR
// utt.onend) — always, for both paths, unlike the original play.tsx.
//
// This module has ZERO opinion about avatar state (idle/talking/win/lose/
// draw) — that's presentation logic the caller owns. A caller wanting
// play.tsx's "persistent" win/lose/draw behavior (never auto-revert)
// simply doesn't reset state inside its own onComplete callback for those
// cases; nothing here needs a "persistent" flag. Keeping this module
// single-purpose (audio mechanics only) is what let both callers' actual
// requirements be satisfied without the module needing to know why.
//
// INTEGRATION NOTE for the future Play/ReviewCoach refactor: adopting
// this module means replacing play.tsx's `avatarTimeoutRef`/duration
// pattern with this module's `onComplete` callback — that's an actual
// behavior change (a fix), not just a refactor, and should be called out
// as such when it happens, not silently folded into a "no-op extraction."

import { hashText } from "./hashText";
import { selectVoice } from "./selectVoice";

export interface VoiceProfile {
  pitch: number;
  rate: number;
  volume?: number;
  preferredVoices: string[];
}

export interface SpeakOptions {
  characterId: string;
  voice: VoiceProfile;
  /** Fires when speech completes, whether via the audio file or the TTS fallback. */
  onComplete?: () => void;
}

export interface CharacterSpeechController {
  speak(text: string, options: SpeakOptions): void;
  /** Stops any in-flight audio/TTS immediately. Does not fire onComplete. */
  stop(): void;
}

/**
 * createCharacterSpeech() -> CharacterSpeechController
 *
 * One controller instance should be owned per "speaker" (one per avatar/
 * personality slot on screen) — it holds a single in-flight Audio
 * reference, matching both original call sites' single-audioRef pattern.
 */
export function createCharacterSpeech(): CharacterSpeechController {
  let currentAudio: HTMLAudioElement | null = null;

  function stop(): void {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
      currentAudio = null;
    }
    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
    }
  }

  function speak(text: string, options: SpeakOptions): void {
    // Both original implementations stop any prior speech before starting
    // new speech — preserved here.
    stop();

    if (typeof window === "undefined" || typeof Audio === "undefined") {
      // No browser audio API available at all (e.g. SSR, or this sandbox's
      // Node test environment) — nothing to play, but still notify the
      // caller so UI state doesn't wait forever for a completion that will
      // never come.
      options.onComplete?.();
      return;
    }

    const volume = options.voice.volume ?? 1.0;
    const hash = hashText(text);
    const audio = new Audio(`/characters/${options.characterId}/audio/${hash}.mp3`);
    audio.volume = volume;
    currentAudio = audio;

    audio.onended = () => {
      options.onComplete?.();
    };

    audio
      .play()
      .then(() => {
        // Audio file is playing — hard-cancel any TTS that might have been
        // queued from a race with a previous attempt. Matches both
        // original implementations.
        window.speechSynthesis?.cancel();
      })
      .catch(() => {
        // Audio file missing or failed to play — fall back to browser TTS.
        currentAudio = null;

        if (!window.speechSynthesis) {
          // No TTS available either — still notify the caller.
          options.onComplete?.();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.pitch = options.voice.pitch;
        utterance.rate = options.voice.rate;
        utterance.volume = volume;
        utterance.onend = () => {
          options.onComplete?.();
        };

        const voice = selectVoice(options.voice.preferredVoices);
        if (voice) utterance.voice = voice;

        window.speechSynthesis.speak(utterance);
      });
  }

  return { speak, stop };
}
