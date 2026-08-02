-- Scope team rosters to leagues.
--
-- `player` conflated a person (steam id, name) with a roster slot (team, role,
-- rank). That made a roster "every player row with this team_id" — with no time
-- or league dimension, so one roster applied retroactively to every season.
-- Sharkhorse (9403219) is in both S46 and S47 with a different lineup in each:
-- Alca played 7 games in S46 only, Maroso 1 game in S47 only, and Blackacre
-- started 7 of S46's games while rendering under "Stand-ins" because he was
-- never registered.
--
-- This is the ADDITIVE half of an expand/contract migration. It leaves
-- player.team_id / role / rank in place; drop_player_roster_columns.sql removes
-- them once the app has been verified against roster_member.
--
-- Rollback artifact: migrations/player-snapshot-pre-roster-member.json

CREATE TABLE roster_member (
  league_id BIGINT NOT NULL REFERENCES league(id) ON DELETE CASCADE,
  team_id BIGINT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  player_id BIGINT NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  -- Both ranks are free text and nullable: you often add a player before you've
  -- looked them up, and `original_rank` (the rank they signed up at, which gates
  -- stand-in validity) is not something the old single `rank` column recorded.
  rank TEXT,
  original_rank TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (league_id, team_id, player_id)
);

CREATE INDEX idx_roster_member_league_team ON roster_member(league_id, team_id);
CREATE INDEX idx_roster_member_player_id ON roster_member(player_id);

-- Backfill: fan each existing player row out across every league its team plays
-- in. This reproduces the old "one roster, all leagues" behaviour exactly, so
-- nothing regresses on day one — and it seeds rows that are now *correctable*
-- per league, which they were not before. It does mean knowingly-wrong rows
-- (Alca lands in S47, Maroso in S46) until the cleanup pass; that trade was made
-- deliberately over starting from a blank slate and losing 81 hand-entered rows.
--
-- Expect 117 rows from 81 players.
--
-- `original_rank` stays NULL: the existing values were entered as "what this
-- player is", not "what they registered at". Copying them would fabricate 81
-- assertions about signup rank that were never made.
INSERT INTO roster_member (league_id, team_id, player_id, role, rank, original_rank)
SELECT lt.league_id, p.team_id, p.id, p.role, p.rank, NULL
FROM player p
JOIN league_teams lt ON lt.team_id = p.team_id
ON CONFLICT (league_id, team_id, player_id) DO NOTHING;
