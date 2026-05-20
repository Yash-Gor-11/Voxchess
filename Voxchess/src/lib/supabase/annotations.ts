import { supabase } from "@/integrations/supabase/client";
import type { SerializedNode } from "@/lib/chess/analysisEngine";

// ⚠️  DATABASE MIGRATION REQUIRED (run once in Supabase SQL editor):
//
//   -- Drop the old unique constraint (game_id, ply_index) if it exists,
//   -- then create one that includes user_id so each user has their own row.
//   ALTER TABLE annotations
//     DROP CONSTRAINT IF EXISTS annotations_game_id_ply_index_key;
//
//   ALTER TABLE annotations
//     ADD CONSTRAINT annotations_game_id_user_id_ply_index_key
//     UNIQUE (game_id, user_id, ply_index);
//
// Without this migration the onConflict below will fall back to a plain
// insert and you will get duplicate rows / errors on subsequent saves.

export async function saveAnnotations(gameId: string, tree: object) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Not authenticated");

  const { error } = await supabase.from("annotations").upsert(
    {
      game_id: gameId,
      user_id: user.id,
      ply_index: -1, // sentinel row for the full tree
      arrows: [],
      highlights: [],
      note: JSON.stringify(tree),
    },
    // FIX (High): conflict key must include user_id so two different users
    // analysing the same game each get their own row instead of overwriting
    // each other. Requires the migration comment above.
    { onConflict: "game_id,user_id,ply_index" },
  );

  if (error) throw error;
}

export async function getAnnotations(gameId: string) {
  // FIX (High): always filter by the current user so we never return
  // another user's annotations for the same game.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("annotations")
    .select("note")
    .eq("game_id", gameId)
    .eq("user_id", user.id)
    .eq("ply_index", -1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.note) return null;

  try {
    return { tree: JSON.parse(data.note) as SerializedNode };
  } catch {
    return null;
  }
}