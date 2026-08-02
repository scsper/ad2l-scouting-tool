-- NOT YET APPLIED. Run this in the Supabase SQL editor.
--
-- Adds match objectives (tower/barracks/ancient kills, Roshan, Tormentor, first
-- blood, courier kills) sourced from OpenDota's parsed `objectives[]` array.
--
-- The whole array is stored, not just the towers the UI draws. Backfilling means
-- re-fetching all ~355 matches from OpenDota at a 1.2s delay, so the expensive
-- mistake is discovering later that a field was dropped. Roshan and Tormentor
-- timings cost nothing to keep now and would cost a second sweep to add.
--
-- `match.objectives_parsed` is the relational equivalent of the NULL-vs-'[]'
-- contract on match_player.wards, and is load-bearing for the same reason:
--   FALSE -> this match was never objective-parsed (pre-feature rows, or a
--            hand-entered match OpenDota never ingested)
--   TRUE  -> parsed; the absence of a row genuinely means that building survived
-- Fall-rate denominators must count TRUE matches, never `count(match_objective)`,
-- or a team's unparsed games silently read as games where nothing was destroyed.

ALTER TABLE match ADD COLUMN IF NOT EXISTS patch INTEGER;
ALTER TABLE match
  ADD COLUMN IF NOT EXISTS objectives_parsed BOOLEAN NOT NULL DEFAULT FALSE;

-- OpenDota's patch index (see dotaconstants build/patch.json): 57=7.38, 58=7.39,
-- 59=7.40, 60=7.41. Stored as the integer rather than derived from start_time
-- because 7.38 and 7.39 share a minimap image and are indistinguishable by date
-- bucket, and the Roshan pit rule is gated on the exact patch.

CREATE TABLE IF NOT EXISTS match_objective (
  match_id BIGINT NOT NULL REFERENCES match(id) ON DELETE CASCADE,
  -- Seconds relative to the horn. CAN be negative: first blood regularly lands
  -- pre-horn, exactly as ward placements do.
  time INTEGER NOT NULL,
  -- OpenDota's objective type, verbatim: 'building_kill',
  -- 'CHAT_MESSAGE_ROSHAN_KILL', 'CHAT_MESSAGE_MINIBOSS_KILL' (Tormentor),
  -- 'CHAT_MESSAGE_AEGIS', 'CHAT_MESSAGE_FIRSTBLOOD', 'CHAT_MESSAGE_COURIER_LOST'.
  type TEXT NOT NULL,
  -- Heterogeneous by design, because the upstream array is. Only building_kill
  -- carries `key` (e.g. 'npc_dota_goodguys_tower1_bot'); Roshan carries only
  -- `team`; aegis carries only `player_slot`. Every column below is nullable
  -- because which ones are populated depends entirely on `type`.
  key TEXT,
  unit TEXT,
  -- Dota team id: 2 = Radiant, 3 = Dire. On Roshan/Tormentor/courier rows this
  -- is the KILLING team, not the owning one.
  team SMALLINT,
  player_slot SMALLINT,
  slot SMALLINT
);

-- No primary key: OpenDota emits genuinely duplicate rows (two Roshan kills can
-- share a second in a chaotic fight, and AEGIS repeats the ROSHAN_KILL second).
-- A surrogate key would add a column nothing reads, and a natural key would
-- silently drop real events.
CREATE INDEX IF NOT EXISTS match_objective_match_id_idx
  ON match_objective (match_id);
CREATE INDEX IF NOT EXISTS match_objective_type_key_idx
  ON match_objective (type, key);

-- League-wide building timings, aggregated server-side.
--
-- A view rather than a browser-side reduction over the raw rows: the league has
-- ~13k objective rows, and PostgREST caps any response at 1000 rows without
-- saying so. Shipping the raw table to the client would silently aggregate 8% of
-- the league and present it as all of it.
--
-- Reports median AND fall rate together, and they must stay together. Building
-- fall times are right-censored — a game that ends before T3 top falls is not a
-- slow T3 top, it is no observation at all — so a median over only the games
-- where a building fell is biased fast. `fell` over `parsed_matches` is the
-- number that makes the median interpretable.
CREATE OR REPLACE VIEW league_building_timing AS
WITH parsed AS (
  SELECT id, league_id FROM match WHERE objectives_parsed
),
league_totals AS (
  SELECT league_id, count(*) AS parsed_matches FROM parsed GROUP BY league_id
),
kills AS (
  SELECT
    p.league_id,
    -- 'npc_dota_goodguys_tower1_bot' -> tier 1, lane 'bot', side 'radiant'
    substring(o.key FROM 'tower([0-9])')::INT AS tier,
    substring(o.key FROM 'tower[0-9]_(top|mid|bot)') AS lane,
    CASE WHEN o.key LIKE 'npc_dota_goodguys%' THEN 'radiant' ELSE 'dire' END AS side,
    o.time
  FROM match_objective o
  JOIN parsed p ON p.id = o.match_id
  WHERE o.type = 'building_kill' AND o.key ~ 'tower[0-9]_(top|mid|bot)'
)
SELECT
  k.league_id,
  k.tier,
  k.lane,
  k.side,
  count(*) AS fell,
  t.parsed_matches,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY k.time) AS median_time,
  percentile_cont(0.25) WITHIN GROUP (ORDER BY k.time) AS p25_time,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY k.time) AS p75_time
FROM kills k
JOIN league_totals t ON t.league_id = k.league_id
GROUP BY k.league_id, k.tier, k.lane, k.side, t.parsed_matches;
