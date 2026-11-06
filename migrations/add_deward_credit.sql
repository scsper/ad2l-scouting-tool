-- Reveal credit from replay CHAT_MESSAGE_*_WARD_KILLED.player2, distinct from
-- OpenDota's obs_kills/sen_kills (last hits). Keep the old columns for raw data
-- and compatibility with the currently deployed app.
-- NULL = no complete replay attribution; 0 = parsed, no credited dewards.
ALTER TABLE match_player
ADD COLUMN IF NOT EXISTS obs_dewards INTEGER,
ADD COLUMN IF NOT EXISTS sen_dewards INTEGER;
