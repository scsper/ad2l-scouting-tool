-- NOT YET APPLIED. Run this in the Supabase SQL editor.
--
-- Per-second hero positions and replay events, for the Movement tab.
--
-- These come from parsing the .dem replay ourselves (odota/parser in Docker),
-- not from OpenDota's match API. The API has no per-second data and never will:
-- `players[].times` steps by 60s, `lane_pos` is a histogram with no time axis,
-- `kills_log` carries no coordinates, and `objectives` carries none either.
-- Movement is the one thing that cannot be backfilled from the existing source.

-- ---------------------------------------------------------------------------
-- match_positions
-- ---------------------------------------------------------------------------
--
-- One row per match, holding all ten players' whole game. A separate table
-- rather than columns on `match` on purpose: api/matches.ts already lists its
-- columns explicitly to keep the `wards` blob out of shared responses, and that
-- is a convention a future `select *` can quietly break. A separate table makes
-- the mistake unrepresentable instead of merely avoided.
--
-- ~46 KB per match gzipped, ~2.7 MB for all of AD2L S47. Postgres, not object
-- storage: the blobs are smaller than the database already is, and S3 would buy
-- a second credential, a second read path on Vercel, and a consistency hole
-- between blob and rows, for no capacity gained.
CREATE TABLE IF NOT EXISTS match_positions (
  match_id BIGINT PRIMARY KEY REFERENCES match(id) ON DELETE CASCADE,
  -- See shared/position-codec.ts. Versioned because the obvious future changes
  -- (finer quantisation, folding networth/lh into the stream) are re-parses
  -- rather than migrations, and a v2 blob is otherwise indistinguishable from a
  -- v1 one.
  encoding TEXT NOT NULL,
  -- Game time of sample 0, seconds relative to the horn. Reliably NEGATIVE:
  -- hero entities exist from roughly -90s, and pre-horn movement is where the
  -- ward and rune setup happens, so the slider must reach it.
  first_time INTEGER NOT NULL,
  -- Samples per slot. The parser emits at exactly 1 Hz with no gaps (verified:
  -- 2,866 timestamps, gap histogram {1: 2865}, all ten slots present at every
  -- one), so this doubles as the game's sampled length in seconds.
  sample_count INTEGER NOT NULL,
  -- slot index (0-9) -> hero_id. The join key back to match_player: heroes are
  -- unique within a Captains Mode game, and match_player has no player_slot
  -- column to join on directly.
  slot_hero_ids INTEGER[] NOT NULL,
  -- gzipped int16 deltas, slot-major. See shared/position-codec.ts.
  positions BYTEA NOT NULL,
  -- gzipped bitmap, 1 bit per sample, slot-major. 1 = dead.
  -- Load-bearing, not a nicety: 12.6% of hero-seconds in a real game are spent
  -- dead, and an unfiltered heatmap is a picture of where people died and where
  -- the fountain is.
  life_states BYTEA NOT NULL
);

-- Both blobs are gzipped in the application, so Postgres must not spend CPU
-- trying to compress them again. EXTERNAL keeps the TOAST out-of-line storage
-- (which is what stops a 46 KB value from bloating the main heap) while
-- skipping the pointless pglz pass.
ALTER TABLE match_positions ALTER COLUMN positions   SET STORAGE EXTERNAL;
ALTER TABLE match_positions ALTER COLUMN life_states SET STORAGE EXTERNAL;

-- ---------------------------------------------------------------------------
-- match_event
-- ---------------------------------------------------------------------------
--
-- The replay events worth drawing on a map. ~447 rows per match, ~26k for all
-- of S47 — small enough that PostgREST's silent 1000-row cap never bites on a
-- per-match read.
--
-- Deliberately NOT the whole event stream. The parser emits 59 types and
-- ~249,000 events per match; the full archive lives as gzipped NDJSON on disk
-- (2.2 MB/match) precisely so this table can stay narrow. Widening it later is
-- a re-derivation from local files, not a re-download from Valve.
--
-- Existing `match_objective` and `match_player.wards` are left alone. This table
-- serves the Movement tab only, and duplicating a few tower kills is cheaper
-- than making two features share a schema neither of them wanted.
CREATE TABLE IF NOT EXISTS match_event (
  match_id BIGINT NOT NULL REFERENCES match(id) ON DELETE CASCADE,
  -- Seconds relative to the horn; negative before it, same as everywhere else.
  time INTEGER NOT NULL,
  -- Our own vocabulary, not the parser's: 'hero_death', 'smoke', 'obs', 'sen',
  -- 'obs_left', 'sen_left', 'building_kill', 'rune_pickup', 'scan', 'glyph',
  -- 'buyback', 'roshan', 'tormentor', 'aegis', 'firstblood', 'courier_lost',
  -- 'obs_killed', 'sen_killed'. Normalised because the upstream names are three
  -- inconsistent families (CHAT_MESSAGE_*, DOTA_COMBATLOG_*, and bare 'obs'),
  -- and one of them — smoke — has no upstream name at all: it is a
  -- DOTA_COMBATLOG_ITEM row identified only by its inflictor.
  type TEXT NOT NULL,
  -- Acting player's slot (0-9), or NULL when the event has no actor we can
  -- pin down. Building kills have none; a creep can take a tower.
  slot SMALLINT,
  -- The slot acted upon, where there is one: the victim of a hero_death, the
  -- owner of a killed ward. NULL otherwise.
  target_slot SMALLINT,
  -- Free text detail: the building name for building_kill, the rune type, the
  -- killer's hero for a hero_death whose killer was not a hero.
  key TEXT,
  -- Grid-space coordinates, the same space as match_player.wards x/y.
  --
  -- Almost always JOINED from the position stream at `time`, not read off the
  -- event: of the 59 parser event types, only the ward ones carry coordinates.
  -- Kills, smokes, scans and glyphs are all positionless upstream, and pinning
  -- them to the actor's position at that second is the whole reason this table
  -- and match_positions are written by the same pass.
  --
  -- NULL when there is no actor to borrow a position from (building kills), or
  -- when the event falls outside the sampled window.
  x REAL,
  y REAL
);

-- No primary key, for the same reason match_objective has none: the upstream
-- stream contains genuine duplicates (two heroes dying on the same second is
-- ordinary), and a natural key would silently drop real events.
CREATE INDEX IF NOT EXISTS match_event_match_id_idx ON match_event (match_id);
CREATE INDEX IF NOT EXISTS match_event_type_idx ON match_event (match_id, type);
