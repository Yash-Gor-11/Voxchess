// Web Speech API wrapper. Falls back gracefully on unsupported browsers.
// The Web Speech API has no official TypeScript type definitions, so `any`
// is unavoidable when interfacing with SpeechRecognition and its events.
// Each usage is suppressed individually rather than disabling the rule globally.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SR = typeof window extends { SpeechRecognition: infer T } ? T : any;

export const isSpeechSupported = (): boolean =>
  typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

export interface RecognitionCallbacks {
  onResult: (transcript: string, isFinal: boolean) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: string) => void;
}

export interface RecognitionHandle {
  stop: () => void;
}

export function startRecognition(cb: RecognitionCallbacks): RecognitionHandle | null {
  if (!isSpeechSupported()) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  rec.onstart = () => cb.onStart?.();
  rec.onend = () => cb.onEnd?.();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rec.onerror = (e: any) => cb.onError?.(e?.error ?? "unknown");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rec.onresult = (e: any) => {
    let interim = "";
    let final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) final += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (final) cb.onResult(final.trim(), true);
    else if (interim) cb.onResult(interim.trim(), false);
  };

  try {
    rec.start();
  } catch {
    return null;
  }
  return {
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    },
  };
}
