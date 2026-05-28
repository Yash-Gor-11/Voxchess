let cachedVoices: SpeechSynthesisVoice[] = [];

function getVoices(): SpeechSynthesisVoice[] {
  if (cachedVoices.length) return cachedVoices;
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
  for (const pref of preferredVoices) {
    const match = voices.find((v) =>
      v.name.toLowerCase().includes(pref.toLowerCase())
    );
    if (match) return match;
  }
  return voices.find((v) => v.lang.startsWith("en")) ?? voices[0] ?? null;
}