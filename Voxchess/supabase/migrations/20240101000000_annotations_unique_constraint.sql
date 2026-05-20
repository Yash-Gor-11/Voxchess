ALTER TABLE annotations
  DROP CONSTRAINT IF EXISTS annotations_game_id_ply_index_key;

ALTER TABLE annotations
  ADD CONSTRAINT annotations_game_id_user_id_ply_index_key
  UNIQUE (game_id, user_id, ply_index);