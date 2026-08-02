-- NOT YET APPLIED
--
-- The CONTRACT half of the roster_member migration (see create_roster_member.sql).
-- Do not run this until the app has been verified reading from roster_member —
-- these three columns are the only remaining copy of the pre-migration rosters
-- inside the database. (migrations/player-snapshot-pre-roster-member.json is the
-- copy outside it.)
--
-- Verification before running:
--   1. S46 + Sharkhorse shows Blackacre as roster, not a stand-in.
--   2. S47 + Sharkhorse does not list Alca (or lists him as "no games this league").
--   3. Adding and removing a roster member works in the Pub Stats tab.

ALTER TABLE player DROP COLUMN team_id;
ALTER TABLE player DROP COLUMN role;
ALTER TABLE player DROP COLUMN rank;
