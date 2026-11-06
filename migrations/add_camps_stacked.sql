-- NULL means the count is unavailable; 0 means the player stacked no camps.
-- Applied automatically on production deployment; backfill old games separately.
ALTER TABLE match_player
ADD COLUMN IF NOT EXISTS camps_stacked INTEGER;
