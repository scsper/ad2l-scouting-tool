-- Add 10-minute snapshot columns to match_player for lane analysis
ALTER TABLE match_player
ADD COLUMN IF NOT EXISTS gold_at_10 INTEGER,
ADD COLUMN IF NOT EXISTS xp_at_10 INTEGER,
ADD COLUMN IF NOT EXISTS lh_at_10 INTEGER,
ADD COLUMN IF NOT EXISTS denies_at_10 INTEGER;
