-- Add ward-placement columns to match_player for the Players tab.
--
-- Deliberately nullable with no default: NULL means "we have no ward data for
-- this row" (matches OpenDota never parsed, or hand-entered from post-game
-- screenshots, which don't show ward counts), while 0 means "this player placed
-- none". Ward averages skip NULL rows but include real zeroes, so a DEFAULT 0
-- here would silently drag supports' averages toward zero.
ALTER TABLE match_player
ADD COLUMN IF NOT EXISTS obs_placed INTEGER,
ADD COLUMN IF NOT EXISTS sen_placed INTEGER;
