import { supabase } from "@/integrations/supabase/client";

export async function saveAnnotations(gameId: string, tree: object) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("annotations")
    .upsert({
      game_id: gameId,
      ply_index: 0,
      arrows: [],
      highlights: [],
      note: null,
    })
    .eq("game_id", gameId);

  // Store the full tree in a separate key in preferences or as JSON note
  // For now store serialized tree as the note field
  const { error: err } = await supabase
    .from("annotations")
    .upsert({
      game_id: gameId,
      ply_index: -1, // special row for full tree
      arrows: [],
      highlights: [],
      note: JSON.stringify(tree),
    });

  if (err) throw err;
}

export async function getAnnotations(gameId: string) {
  const { data, error } = await supabase
    .from("annotations")
    .select("*")
    .eq("game_id", gameId)
    .eq("ply_index", -1)
    .single();

  if (error || !data) return null;
  return { tree: data.note ? JSON.parse(data.note) : null };
}