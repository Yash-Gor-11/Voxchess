// src/lib/characters/speech/selectVoice.ts
//
// Ported from src/lib/voice/selectVoice.ts, verified against the current
// play.tsx/ReviewCoach.tsx call sites (both call `selectVoice(v.preferredVoices)`
// identically). One addition: getVoices() now guards against a missing
// `window` (Node has no `window.speechSynthesis` at all — referencing it
// unguarded would throw ReferenceError, not just return undefined). This
// is purely a portability/testability addition — real browser behavior is
// completely unchanged, since `typeof window !== "undefined"` is always
// true in an actual browser.

// Known female/male voice name patterns across Windows, macOS, iOS, Android, Chrome.
// Used for gender-aware fallback when no preferred name matches.
const KNOWN_FEMALE = [
  "zira", "heera", "samantha", "karen", "tessa", "moira", "victoria",
  "susan", "hazel", "serena", "martha", "allison", "ava", "fiona",
  "veena", "female", "woman", "girl",
];
const KNOWN_MALE = [
  "david", "mark", "alex", "daniel", "george", "arthur", "tom",
  "fred", "ravi", "male", "man", "guy",
];

export function inferGender(preferredVoices: string[]): "female" | "male" | null {
  const joined = preferredVoices.join(" ").toLowerCase();
  const femaleScore = KNOWN_FEMALE.filter((f) => joined.includes(f)).length;
  const maleScore = KNOWN_MALE.filter((m) => joined.includes(m)).length;
  if (femaleScore > maleScore) return "female";
  if (maleScore > femaleScore) return "male";
  return null;
}

let cachedVoices: SpeechSynthesisVoice[] = [];

function getVoices(): SpeechSynthesisVoice[] {
  if (cachedVoices.length) return cachedVoices;
  // Guard added for Node/test environments — real browsers always have
  // `window`, so this never changes actual runtime behavior there.
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  cachedVoices = window.speechSynthesis.getVoices();
  return cachedVoices;
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    cachedVoices = window.speechSynthesis.getVoices();
  });
}

export function selectVoice(preferredVoices: string[]): SpeechSynthesisVoice | null {
  const voices = getVoices();

  // Only match against English voices — prevents substring hits on foreign-language
  // voices that share a name (e.g. "Alex" matching Spanish Peru)
  const englishVoices = voices.filter((v) => v.lang.startsWith("en"));

  // Step 1 — preferred name matching (cross-platform list, tried in order)
  for (const pref of preferredVoices) {
    const match = englishVoices.find((v) =>
      v.name.toLowerCase().includes(pref.toLowerCase()),
    );
    if (match) {
      return match;
    }
  }

  // Step 2 — gender-aware fallback: infer desired gender from the preferred list
  // so a character that wants a female voice doesn't end up with a male one
  const gender = inferGender(preferredVoices);
  if (gender === "female") {
    const femaleVoice = englishVoices.find((v) =>
      KNOWN_FEMALE.some((f) => v.name.toLowerCase().includes(f)),
    );
    if (femaleVoice) {
      return femaleVoice;
    }
  } else if (gender === "male") {
    const maleVoice = englishVoices.find((v) =>
      KNOWN_MALE.some((m) => v.name.toLowerCase().includes(m)),
    );
    if (maleVoice) {
      return maleVoice;
    }
  }

  // Step 3 — last resort: first available English voice
  const fallback = englishVoices[0] ?? voices[0] ?? null;
  return fallback;
}
