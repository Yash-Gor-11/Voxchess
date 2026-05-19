import { supabase } from "@/integrations/supabase/client";

export async function saveAnnotations(gameId: string, tree: object) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("annotations")
    .upsert(
      {
        game_id: gameId,
        user_id: user.id,
        ply_index: -1,       // sentinel row for the full tree
        arrows: [],
        highlights: [],
        note: JSON.stringify(tree),
      },
      { onConflict: "game_id,ply_index" }
    );

  if (error) throw error;
}

export async function getAnnotations(gameId: string) {
  const { data, error } = await supabase
    .from("annotations")
    .select("note")
    .eq("game_id", gameId)
    .eq("ply_index", -1)
    .maybeSingle();           // maybeSingle so "not found" returns null instead of throwing

  if (error) throw error;
  if (!data?.note) return null;

  try {
    return { tree: JSON.parse(data.note) };
  } catch {
    return null;
  }
}