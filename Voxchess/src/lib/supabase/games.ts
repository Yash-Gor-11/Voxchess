import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type GameType = "platform" | "imported" | "study_chapter";

export interface GameMetadata {
  // PGN header fields (populated on import)
  White?: string;
  Black?: string;
  Event?: string;
  Date?: string;
  // FEN position fields (populated on position save)
  name?: string;
  note?: string;
  ChapterName?: string;
  // Play settings
  eloIndex?: number;
  personalityId?: string;
  playerColor?: string;
}

export interface Game {
  id: string;
  white_id: string;
  black_id: string | null;
  pgn: string;
  result: string | null;
  mode: string;
  type: GameType;
  metadata: GameMetadata | null;
  study_id: string | null;
  fen: string | null;
  start_fen: string | null;
  source_type: string | null;
  source_game_id: string | null;
  source_node_id: string | null;
  chapter_index: number | null;
  created_at: string;
  updated_at: string;
}


export interface Study {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  // Hydrated client-side after fetching chapters
  chapterCount?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function currentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

// ─────────────────────────────────────────────────────────────────────────────
// Games — existing (unchanged behaviour, updated return type)
// ─────────────────────────────────────────────────────────────────────────────

export async function saveGame(
  pgn: string,
  result: string = "ongoing",
  startFen: string | null = null,
  sourceType: string | null = null,
  sourceGameId: string | null = null,
  sourceNodeId: string | null = null,
  playSettings?: { eloIndex: number; personalityId: string; playerColor: string },
): Promise<Game> {
  const user = await currentUser();
  const { data, error } = await supabase
    .from("games")
    .insert({
      white_id: user.id,
      pgn,
      result,
      mode: "solo",
      type: "platform",
      start_fen: startFen,
      source_type: sourceType,
      source_game_id: sourceGameId,
      source_node_id: sourceNodeId,
      metadata: playSettings ? (playSettings as unknown as Json) : null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Game;
}

export async function updateGame(
  id: string,
  pgn: string,
  result: string,
  playSettings?: { eloIndex: number; personalityId: string; playerColor: string },
): Promise<Game> {
  const user = await currentUser();
  const { data, error } = await supabase
    .from("games")
    .update({
      pgn,
      result,
      ...(playSettings ? { metadata: playSettings as unknown as Json } : {}),
    })
    .eq("id", id)
    .eq("white_id", user.id)
    .select()
    .single();
  if (error) throw error;
  return data as Game;
}

/** Returns ALL games the user owns — used internally. */
export async function getGames(): Promise<Game[]> {
  const user = await currentUser();

  const { data, error } = await supabase
    .from("games")
    .select("*")
    .or(`white_id.eq.${user.id},black_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Game[];
}

/** Returns only platform games (played on VoxChess). */
export async function getPlatformGames(): Promise<Game[]> {
  const user = await currentUser();

  const { data, error } = await supabase
    .from("games")
    .select("*")
    .or(`white_id.eq.${user.id},black_id.eq.${user.id}`)
    .in("type", ["platform"])
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Game[];

}

/** Returns imported games and saved FEN positions (type = 'imported'). */
export async function getImportedGames(): Promise<Game[]> {
  const user = await currentUser();

  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("white_id", user.id)
    .eq("type", "imported")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Game[];
}

export async function deleteGame(id: string): Promise<void> {
  const user = await currentUser();

  const { error } = await supabase
    .from("games")
    .delete()
    .eq("id", id)
    .or(`white_id.eq.${user.id},black_id.eq.${user.id}`);

  if (error) throw error;
}

export async function getGame(id: string): Promise<Game> {
  const user = await currentUser();

  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("id", id)
    .or(`white_id.eq.${user.id},black_id.eq.${user.id}`)
    .single();

  if (error) throw error;
  return data as Game;
}

// ─────────────────────────────────────────────────────────────────────────────
// Studies
// ─────────────────────────────────────────────────────────────────────────────

export async function getStudies(): Promise<Study[]> {
  const user = await currentUser();

  const { data, error } = await supabase
    .from("studies")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const studies = (data ?? []) as Study[];

  // Hydrate chapter counts in a single query
  if (studies.length > 0) {
    const ids = studies.map((s) => s.id);
    const { data: chapters } = await supabase
      .from("games")
      .select("study_id")
      .in("study_id", ids)
      .eq("type", "study_chapter");

    const counts: Record<string, number> = {};
    for (const c of chapters ?? []) {
      if (!c.study_id) continue;
      counts[c.study_id] = (counts[c.study_id] ?? 0) + 1;
    }
    for (const s of studies) {
      s.chapterCount = counts[s.id] ?? 0;
    }
  }

  return studies;
}

export async function getStudy(id: string): Promise<Study> {
  const user = await currentUser();

  const { data, error } = await supabase
    .from("studies")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error) throw error;
  return data as Study;
}

export async function createStudy(name: string): Promise<Study> {
  const user = await currentUser();

  const { data, error } = await supabase
    .from("studies")
    .insert({ user_id: user.id, name })
    .select()
    .single();

  if (error) throw error;
  return data as Study;
}

export async function renameStudy(id: string, name: string): Promise<void> {
  const user = await currentUser();

  const { error } = await supabase
    .from("studies")
    .update({ name })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw error;
}

export async function deleteStudy(id: string): Promise<void> {
  const user = await currentUser();

  // Chapters are deleted via ON DELETE CASCADE on study_id FK
  const { error } = await supabase
    .from("studies")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw error;
}

/** Returns all chapters for a study, ordered by chapter_index. */
export async function getStudyChapters(studyId: string): Promise<Game[]> {
  const user = await currentUser();

  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("study_id", studyId)
    .eq("white_id", user.id)
    .eq("type", "study_chapter")
    .order("chapter_index", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Game[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Import helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Save a PGN imported from outside VoxChess (paste / file / URL). */
export async function saveImportedGame(
  pgn: string,
  metadata: GameMetadata,
  result: string = "ongoing",
): Promise<Game> {
  const user = await currentUser();

  const { data, error } = await supabase
    .from("games")
    .insert({
      white_id: user.id,
      pgn,
      result,
      mode: "solo",
      type: "imported",
      metadata: metadata as unknown as Json,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Game;
}

/** Save a bare FEN position with no moves (type = 'imported'). */
export async function saveFenPosition(fen: string, name: string): Promise<Game> {
  const user = await currentUser();
  const { data, error } = await supabase
    .from("games")
    .insert({
      white_id: user.id,
      pgn: "",
      result: "ongoing",
      mode: "solo",
      type: "imported",
      fen,
      start_fen: fen,   // ← add this
      metadata: { name } as unknown as Json,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Game;
}

/** Save a single chapter inside a study. */
export async function saveStudyChapter(
  studyId: string,
  pgn: string,
  metadata: GameMetadata,
  result: string = "ongoing",
  chapterIndex: number = 0,
): Promise<Game> {
  const user = await currentUser();

  const { data, error } = await supabase
    .from("games")
    .insert({
      white_id: user.id,
      pgn,
      result,
      mode: "solo",
      type: "study_chapter",
      study_id: studyId,
      chapter_index: chapterIndex,
      metadata: metadata as unknown as Json,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Game;
}