-- Let a stand-in be declared on a roster before they've played.
--
-- Stand-ins were derived: buildPlayerStats called someone a stand-in if they
-- appeared for the team and weren't in roster_member. That can only ever be
-- backward-looking, and the useful time to know about a sub is the day before
-- the game, when there are no match_player rows to derive anything from.
--
-- Being a stand-in is per league+team, not per person: someone can be a
-- registered member of one team and a stand-in for another in the same league,
-- which the (league_id, team_id, player_id) primary key already permitted.
--
-- Deriving stand-ins from match data continues alongside this. The two answer
-- different questions — "who subbed" and "who is going to" — and the Stand-ins
-- section shows both, declared first.
--
-- DEFAULT false makes this a pure additive change: every existing row is
-- correct on arrival, and no backfill is needed.
--
-- APPLIED.

ALTER TABLE roster_member
  ADD COLUMN is_stand_in BOOLEAN NOT NULL DEFAULT false;
