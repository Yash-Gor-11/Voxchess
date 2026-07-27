// src/lib/voice/navVoiceHandler.ts
//
// Nav-voice destination parser -- separate, simpler feature from move-input
// voice (see the v3 handoff's Phase 1 audit: page-navigation voice is
// explicitly untouched/unrelated to the chess move engine). This file is
// the ONE place the supported destination set is defined; the tutorial
// page's Navigation Mode section must document exactly this list and
// nothing else.
//
// Rewritten to match the current authoritative destination list: Dashboard,
// Play, My Games, Imported Games, Studies, Profile, Settings. Everything
// previously supported that ISN'T in that list was removed as obsolete,
// per explicit instruction -- this includes PvP/Multiplayer/Friend (PvP
// is no longer planned), Home/Landing, About, Tutorial/Help, and the two
// special ACTIONS this parser used to also handle: "new game" and
// "sign out"/"log out". Removing the latter two is a real functional
// change, not just documentation cleanup -- useNavVoice.ts's handling for
// both was removed to match (see that file).
export interface NavCommand {
  ok: boolean;
  to?: string;
  message?: string;
}

// Word-boundary regexes, per explicit request -- avoids e.g. "displayed"
// accidenatally matching a hypothetical "play" substring rule (not a real
// risk with the current word list, but a real habit worth having).
const ROUTES: Array<[RegExp, string]> = [
  [/\bdashboard\b/, "/dashboard"],
  [/\bplay\b/, "/play"],
  [/\bmy\s*games?\b/, "/games/my-games"],
  [/\bimported\s*games?\b/, "/games/imported"],
  [/\bstudies?\b/, "/games/studies"],
  [/\bprofile\b/, "/profile"],
  [/\bsettings?\b/, "/settings"],
];

export function parseNavPhrase(transcript: string): NavCommand {
  const t = transcript.toLowerCase().trim();
  if (!t) return { ok: false, message: "No speech detected" };
  for (const [re, to] of ROUTES) {
    if (re.test(t)) return { ok: true, to };
  }
  return { ok: false, message: `Unknown command: "${transcript}"` };
}
