-- Add last_match_date_time column to existing table
-- This is an alternative migration if the table already exists

ALTER TABLE player_pub_match_stats
ADD COLUMN IF NOT EXISTS last_match_date_time TIMESTAMPTZ;
