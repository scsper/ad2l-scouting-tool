-- Enemy observer and sentry wards each player destroyed (dewards), from
-- OpenDota's observer_kills/sentry_kills. Not derivable from `wards`: a ward's
-- `by` is also set on natural expiry, credited to the ward's own owner.
-- NULL means the count is unavailable; 0 means the player dewarded none.
-- Applied automatically on production deployment; backfill old games separately.
ALTER TABLE match_player
ADD COLUMN IF NOT EXISTS obs_kills INTEGER,
ADD COLUMN IF NOT EXISTS sen_kills INTEGER;
