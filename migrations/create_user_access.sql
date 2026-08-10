-- Who may see what.
--
-- Until now every signed-in user saw everything: sign-up is restricted in the
-- Clerk dashboard, so a valid session was also an authorization decision (see
-- the comment in server/require-auth.ts, which reserved this spot). Handing an
-- account to a captain from another division breaks that equivalence, so the
-- decision has to be written down.
--
-- Closed by default. A user with no row here sees nothing. The alternative --
-- "everyone sees everything unless restricted" -- cannot answer the question
-- these tables exist to answer, because six of the seven leagues in this
-- database have no divisions at all (every league_teams.division is NULL as of
-- this migration). A division filter over a league with no divisions filters
-- nothing, so an open default would hand a Warrior-scoped user all of Seasons
-- 45-47 and the Scrims league the moment they changed the league dropdown.
-- Closed by default answers that case with "nothing", which is the answer we
-- want, and it makes every check a positive one: the failure mode of a check
-- someone forgot to write is a blank screen, not a leak.

-- Identity, and the one grant that is not a slice.
--
-- `is_admin` is deliberately a different KIND of fact from a row in
-- user_league_access, not a wildcard encoded into one. Two reasons. A wildcard
-- would have to be a NULL league_id, and Postgres treats NULLs as distinct in a
-- unique index, so nothing would stop two identical "sees everything" rows.
-- More practically: without it, every league you add -- including the one-off
-- pro leagues added to read a draft -- needs a grant row for yourself before it
-- appears, and a missing grant under a closed default looks exactly like a bug.
CREATE TABLE IF NOT EXISTS app_user (
  clerk_user_id TEXT PRIMARY KEY,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per (user, league, division) they may read.
--
-- Several rows per user is the point, not an accident: a captain who plays
-- Warrior this season and Conqueror next needs two, and a coach working with
-- two teams needs two now. `division` is NOT NULL -- there is no "whole league"
-- grant, because a league-wide slice is what `is_admin` is for, and because a
-- NULL here would collide with the OTHER meaning of NULL in this schema:
-- league_teams.division IS NULL means "no division recorded", and those teams
-- are never visible to a scoped user.
--
-- No foreign key to `league` or CHECK against the division vocabulary, matching
-- league_teams.division and roster_member.role: AD2L can rename a bracket
-- between seasons and that should cost an edit to shared/divisions.ts, not a
-- migration. scripts/grant-access.ts validates the name on the way in.
CREATE TABLE IF NOT EXISTS user_league_access (
  clerk_user_id TEXT NOT NULL REFERENCES app_user(clerk_user_id) ON DELETE CASCADE,
  league_id INTEGER NOT NULL,
  division TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (clerk_user_id, league_id, division)
);

-- Every request resolves a scope by user id, and nothing else queries this.
CREATE INDEX IF NOT EXISTS user_league_access_user_idx
  ON user_league_access (clerk_user_id);

-- RUN THIS BEFORE DEPLOYING THE CODE THAT READS IT.
--
-- Closed by default applies to you too: deploy first and your own next sign-in
-- is an empty app with no way to fix itself from the UI. Replace the id with
-- yours from the Clerk dashboard, or run `npm run grant -- --email <you>
-- --admin`, which looks it up for you.
--
-- INSERT INTO app_user (clerk_user_id, is_admin, email)
-- VALUES ('user_xxxxxxxxxxxxxxxxxxxxxxxx', TRUE, 'scsper@gmail.com')
-- ON CONFLICT (clerk_user_id) DO UPDATE SET is_admin = TRUE;
