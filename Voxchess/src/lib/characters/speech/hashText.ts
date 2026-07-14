// src/lib/characters/speech/hashText.ts
//
// Ported verbatim from src/lib/voice/hashText.ts (both original call sites
// — play.tsx and ReviewCoach.tsx — used the identical implementation, so
// there was nothing to reconcile here, unlike CharacterSpeech.ts itself).
// djb2 hash — produces a consistent 8-char hex string for any input text.
// Used to map response lines to audio filenames without special characters.
// The Python generation script uses an identical implementation so hashes
// match — do not change this algorithm without regenerating audio files.

export function hashText(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
