export interface NavCommand {
  ok: boolean;
  to?: string;
  action?: "signout" | "newgame";
  message?: string;
}

const ROUTES: Array<[RegExp, string]> = [
  [/dashboard/, "/dashboard"],
  [/(saved|history)/, "/games"],
  [/play|game/, "/play"],
  [/setting/, "/settings"],
  [/profile/, "/profile"],
  [/tutorial|help/, "/tutorial"],
  [/about/, "/about"],
  [/home|landing/, "/"],
  [/pvp|multiplayer|friend/, "/play/pvp"],
];

export function parseNavPhrase(transcript: string): NavCommand {
  const t = transcript.toLowerCase().trim();
  if (!t) return { ok: false, message: "No speech detected" };
  if (/sign\s*out|log\s*out/.test(t)) return { ok: true, action: "signout" };
  if (/new\s*game/.test(t)) return { ok: true, action: "newgame" };
  for (const [re, to] of ROUTES) {
    if (re.test(t)) return { ok: true, to };
  }
  return { ok: false, message: `Unknown command: "${transcript}"` };
}
