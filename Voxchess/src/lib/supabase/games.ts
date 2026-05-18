import { supabase } from '@/integrations/supabase/client';

export async function saveGame(pgn: string, result: string = 'ongoing') {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('games')
    .insert({
      white_id: user.id,
      pgn,
      result,
      mode: 'solo',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getGames() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('games')
    .select('*')
    .or(`white_id.eq.${user.id},black_id.eq.${user.id}`)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function deleteGame(id: string) {
  const { error } = await supabase.from('games').delete().eq('id', id);
  if (error) throw error;
}

export async function getGame(id: string) {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}