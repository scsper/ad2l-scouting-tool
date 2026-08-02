-- Drop the flag that tried to answer "does this league have divisions?".
--
-- It was written once (hardcoded false by scripts/add-teams-to-league.ts) and
-- never read by any query, type consumer, or UI — and it was wrong on all three
-- AD2L rows: S47 false despite having divisions, S45 and S46 true despite no
-- team carrying one. Nothing forced it to agree with the rows it described.
--
-- A league now has divisions iff any of its league_teams rows has a non-null
-- division, derived from data the team query already fetches, so the two can no
-- longer disagree. See shared/divisions.ts (`divisionsIn`).
--
-- This is the CONTRACT half of add_division_to_league_teams.sql. Run it only
-- after the app has been verified against the new column — nothing on this
-- branch reads has_divisions, so there is no hurry.
ALTER TABLE league
DROP COLUMN IF EXISTS has_divisions;
