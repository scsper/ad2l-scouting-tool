-- Let a person exist without belonging to a team.
--
-- `player.team_id` is a leftover of the pre-roster_member schema, where a person
-- WAS a roster slot. create_roster_member.sql moved membership to its own table
-- but deliberately left these columns in place as the rollback copy, and
-- drop_player_roster_columns.sql (still unapplied) is what eventually removes
-- them.
--
-- The column being NOT NULL is not a harmless leftover, though: createRosterMember
-- upserts `player` with only (id, name, updated_at), so adding anyone who isn't
-- already in the table fails with 23502 and surfaces as "Failed to add roster
-- member". That has been true since the roster_member migration — it goes
-- unnoticed because the backfill pre-seeded the 81 people who existed then, and
-- an upsert of an existing id takes the UPDATE path, which never touches
-- team_id. It only bites on someone genuinely new.
--
-- Stand-ins are how you notice. A sub is usually somebody you've never scouted,
-- and the point of declaring one is to do it before they've played.
--
-- Filling the column in instead would be wrong rather than merely awkward: a
-- stand-in is by definition someone who may be registered to a different team,
-- so there is no single team_id that is true of them. Writing the team they're
-- subbing for reintroduces exactly the person-is-a-roster-slot conflation that
-- roster_member exists to undo.
--
-- Data is preserved either way: this drops the constraint, not the column, so
-- the pre-migration rosters stay readable until the contract migration runs.

ALTER TABLE player
  ALTER COLUMN team_id DROP NOT NULL;
