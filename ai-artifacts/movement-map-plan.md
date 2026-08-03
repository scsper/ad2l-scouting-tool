# Movement Map — plan

Per-second hero positions and game events for AD2L Season 47, rendered on a new map tab
as a multi-game heatmap (the product) and a single-game playback (so you don't have to
open Dota).

Feasibility was settled by a spike against a real S46 match (`8698061985`). Every number
below is measured, not estimated.

## Why this needs a new pipeline

The OpenDota match API has no per-second data at all, and never will:

- `players[].times` steps by **60 seconds**. Same for `gold_t`, `xp_t`, `radiant_gold_adv`.
- `lane_pos` is a positionless-in-time histogram (`{x: {y: count}}`).
- `kills_log` has `{time, key}` — **no coordinates**.
- `teamfights[].players[].deaths_pos` is another x/y histogram, scoped to a fight window.
- `objectives` has no coordinates (we already infer tower positions from names in
  `src/utils/dota-map.ts`).

Only hero movement genuinely requires sampling; wards, towers, kills and objectives are
event-shaped and three of the four are already stored. Positions are obtainable only by
parsing the replay ourselves.

## Spike results

`odota/parser` (Docker, Java + clarity) on `8698061985`, a 47-minute S46 game:

| step                       | measured                           |
| -------------------------- | ---------------------------------- |
| replay download            | 13s for 67 MB (~5 MB/s from Valve) |
| `bunzip2 \| POST → parser` | 22s                                |
| **end-to-end**             | **~35s per match**                 |

The `interval` event carries position:

```json
{"time":2776,"type":"interval","unit":"CDOTA_Unit_Hero_Abaddon","slot":9,
 "x":82.09595,"y":89.78223,"hero_id":102,"life_state":0,
 "gold":30497,"lh":360,"networth":29703,"level":26,"camps_stacked":2, ...}
```

- **Exactly 1 Hz, zero gaps.** 2,866 distinct timestamps; gap histogram is `{"1": 2865}`.
- **100% coverage** — all 10 slots at all 2,866 seconds = 28,660 samples, the theoretical max.
- Coordinates are in the **same 64..191 grid as ward coords**, so `wardToFraction` in
  `src/utils/ward-map.ts` works on them verbatim. No new coordinate math.
- `life_state`, `networth`, `lh`, `camps_stacked`, `hero_id` ride along free.

59 event types total, including several we have no other source for: smoke usage
(`DOTA_COMBATLOG_ITEM` with `inflictor: "item_smoke_of_deceit"`), `CHAT_MESSAGE_SCAN_USED`,
`CHAT_MESSAGE_GLYPH_USED`, exact `DOTA_COMBATLOG_DEATH` rows, buybacks, rune pickups.

### Gotchas found in the spike

1. **No event except wards carries x/y.** Kills, smokes, tower kills and scans are all
   positionless. Joining on `(slot, time)` against the 1 Hz stream recovers position for
   every one of them — verified: at the first smoke, the four Dire supports cluster at
   (145–154, 139–156), the gank visibly forming in the data.
2. **12.6% of hero-seconds are dead** (`life_state != 0`). Unfiltered, these pollute every
   aggregate with corpses and fountain-sitting.
3. **Coordinates range 61.5–195.3**, outside the 64..191 grid `wardToFraction` clamps to.
   Only fountains and map edges are affected. Store unclamped; let the renderer clamp.
4. **7,200 intervals have no x/y** — the draft phase, before hero entities exist. Filter on
   presence of `x`.

## Scope: AD2L Season 47

League `19554`. **61 matches, 8 teams.** Games per team: 23, 20, 18, 17, 16, 12, 10, 6.

Replay availability checked for all 61: **59 return HTTP 200**, 3.29 GB total, 57 MB average.
The 2 misses (`8820291089`, `8820316468`) are the same 2 matches OpenDota never parsed — no
`version`, no `replay_url`. Nothing lost that wasn't already lost.

**Total cost: ~35 minutes of wall clock, 130 MB of archive, 2.7 MB in Postgres.**

## Architecture: three layers

Deliberately not two. "Capture everything" and "put everything in Postgres" are different
decisions with different price tags.

### 1. Archive — files, everything, write-once

Full parser NDJSON, gzipped. **52 MB → 2.2 MB per match** (24× ratio); ~130 MB for S47.
Never read by the web app — only by local re-derivation scripts, which run on the laptop
anyway.

Keep the **entire** stream including `actions` (numeric hotkey enums, half the events by
count, near-worthless). Filtering costs 0.12 GB across the league and is the one decision
that can't be undone.

**Location: outside the repo**, e.g. `~/dota-replay-archive/`, configurable via
`REPLAY_ARCHIVE_DIR`. Not `.context/` — that's a Conductor workspace directory and this data
should outlive any workspace. Supabase Storage is a reasonable durability upgrade later
(same project, same credentials, no new vendor). **Not S3** — see below.

The archive's real job is to outlive Valve. A 165-day-old S46 replay still returns 200, but
that's an observation, not a guarantee. Once replays age out that data is gone permanently.

### 2. `match_positions` — Postgres, ~2.7 MB total

```sql
create table match_positions (
  match_id      bigint primary key references match(id),
  encoding      text   not null,   -- 'delta-i16-0.1grid-gz-v1'
  first_time    int    not null,   -- first second with x/y, e.g. -89
  sample_count  int    not null,   -- e.g. 2866
  slot_hero_ids int[]  not null,   -- slot -> hero_id
  positions     bytea  not null,   -- gzipped int16 deltas, ~46 KB
  life_states   bytea  not null    -- gzipped bitmap, ~0.4 KB
);
alter table match_positions alter column positions   set storage external;
alter table match_positions alter column life_states set storage external;
```

Encoding, measured on real data:

| encoding          | raw    | gzip      |
| ----------------- | ------ | --------- |
| uint16 absolute   | 112 KB | 67 KB     |
| **int16 delta**   | 112 KB | **46 KB** |
| life_state bitmap | 3.5 KB | 0.4 KB    |

- Quantize `q = round((v - 60) * 10)` — 0.1 grid units ≈ 13 game units, well under a hero's
  collision size. Fits uint16 (range 15..1353 observed).
- **Slot-major layout** (all of slot 0, then slot 1, …). Deltas within a slot are tiny;
  gzip loves them. Time-major would destroy this.
- Deltas fit int16 comfortably: hero speed caps around 4.3 grid/s, and even a full-map
  teleport jump is ~1350.
- `life_states` is one bit per sample, same slot-major ordering.
- **`STORAGE EXTERNAL` matters** — we gzip in-app, so PG should TOAST out-of-line without
  wasting CPU re-compressing incompressible bytes.
- The versioned `encoding` string means a future v2 (finer precision, or `networth` in the
  stream) needs no migration that has to guess what old rows meant.

**Separate table, not a column on `match`.** `api/matches.ts` already lists columns
explicitly to keep the `wards` blob out of shared responses; a separate table makes that
mistake unrepresentable rather than merely avoided.

**Verify rectangularity per match** when encoding. The spike had identical coverage across
all 10 slots, which makes a `[10][N]` layout valid — but that must be asserted, not assumed.
Pad and record if a match comes out ragged.

### 3. `match_event` — Postgres, ~26k rows league-wide

Only the events the map actually renders. Measured on the spike match: **447 events**,
× 59 matches = **26,373 rows** for all of S47. Small enough that PostgREST's 1000-row cap
never comes into play for a per-match read.

| count     | event                                                                           |
| --------- | ------------------------------------------------------------------------------- |
| 89        | hero death (`DOTA_COMBATLOG_DEATH` filtered to `targethero && !targetillusion`) |
| 67 / 61   | `sen` / `sen_left`                                                              |
| 57        | `CHAT_MESSAGE_RUNE_PICKUP`                                                      |
| 38 / 37   | `obs` / `obs_left`                                                              |
| 23 / 12   | sentry / observer ward killed                                                   |
| 22        | `DOTA_COMBATLOG_TEAM_BUILDING_KILL`                                             |
| 11        | smoke used                                                                      |
| 8 / 5     | scan / glyph                                                                    |
| 7         | buyback                                                                         |
| 5         | courier lost                                                                    |
| 2 / 1 / 1 | tormentor / roshan / aegis                                                      |

**The death filter is not optional:** the raw stream has 4,654 `DOTA_COMBATLOG_DEATH` rows,
of which **89** are heroes. The rest are creeps, wards and Clockwerk cogs.

Schema is generic (`match_id, time, type, slot, key, value, x, y`) because we don't yet know
which events matter — the archive holds everything, so widening later is a re-derivation,
not a re-parse. x/y are joined from the position stream at that second.

Existing `match_objective` and `match_player.wards` stay untouched. This table serves the
new tab only.

### Why not S3

The blobs are 2.7 MB in a database that currently holds ~5 MB, against a 500 MB free tier.
S3 is right at a threshold we are two orders of magnitude below. Concretely it would cost:

1. **A second credential.** The `opendota-pub-fallback` memory exists because an expired
   token produced a 403 that read as a missing header. Every credentialed dependency is a
   future incident that looks like something else.
2. **A new read path on Vercel.** Every read currently goes through one PostgREST client
   with `server/select-all.ts` handling paging. Signed URLs or byte-proxying is new code and
   a new failure mode for zero capacity gained.
3. **No transactional consistency.** A parse that dies halfway leaves an orphaned object or
   blob-less rows, and nothing tells you which.
4. **No joins** between blob and derived tables.

The only artifact big enough to justify object storage is the raw NDJSON archive (130 MB),
and that belongs on disk, not in either system.

## Pipeline

`scripts/parse-replays.ts`, run as `npm run parse-replays`. Local only — it cannot run on
Vercel (Java, a 57 MB download, and minutes of CPU against a serverless timeout).

Per match:

1. `GET https://api.opendota.com/api/matches/{id}` → `replay_url`. Skip if no `version` or
   no `replay_url`.
2. Download `.dem.bz2`.
3. `bunzip2 -c | curl -X POST -T - http://localhost:5600` → NDJSON.
4. Gzip the full NDJSON to `$REPLAY_ARCHIVE_DIR/{match_id}.ndjson.gz`.
5. Extract intervals with `x` present → encode → upsert `match_positions`.
6. Extract render-worthy events, join x/y from the interval stream → upsert `match_event`.

Requirements and hygiene:

- **Docker must be running** with `odota/parser` on port 5600. The script should check and
  fail with a clear message rather than a connection error. (`docker run -d --rm --name
odparser -p 5600:5600 odota/parser:latest`)
- **Resumable**: skip any match whose archive file already exists, unless `--force`.
- **Rate limiting**: keep the `OPEN_DOTA_DELAY_MS = 1200` convention from the existing
  backfill scripts for the OpenDota calls. Valve's CDN needs no throttle.
- Steps 5–6 should be re-runnable from the archive alone, without re-downloading — that's
  the entire point of keeping it.

## UI: new tab

A new tab, not an extension of Wards. `Wards.tsx` is 740 lines with six query-string params
and a debounced point-slider; the two views want incompatible controls:

|         | heatmap                 | playback    |
| ------- | ----------------------- | ----------- |
| matches | ~20 (a player's season) | exactly 1   |
| players | one                     | all 10      |
| time    | a **range**             | a **point** |
| team    | one                     | both        |

**Extract the shared parts, not the shared page.** Pull the map frame out of `Wards.tsx`
into a `<DotaMap>` component: image selection via `getMinimapForMatch`, the 640px SVG
viewBox, `wardToFraction`, and `TowerLayer`. Wards keeps working exactly as today. Ward
positions become a _prop_ on `<DotaMap>` so the new tab can render them underneath movement
— where they ward vs. where they walk.

### Heatmap mode (primary)

Pick a team → a player → a time range. Density of that player's position across all their
S47 games, filtered to `life_state == 0`.

**No derived tables, no precompute, no invented definitions.** A player's season is ~20
matches × 46 KB = **~920 KB of blobs**. Ship them raw, decode in the browser, bin in JS.
Re-binning ~570k samples when the range slider moves is single-digit milliseconds.

Slot→player join comes free: the blob header has `slot_hero_ids`, heroes are unique within a
Captains Mode game, and `match_player` already carries `hero_id`, `team_id` and `position`.

### Aggregate by player, never by position

Measured across S47, aggregating by `player_id` (per the `player-name-renames` memory):

```
team 10142791  games 23   1:2ply[22/1]  2:1ply[23]  3:2ply[19/4]  4:4ply[20/1/1/1]  5:8ply[7/6/2/2/2/2/1/1]
team 8746795   games 17   1:2ply[15/2]  2:1ply[17]  3:1ply[17]  4:1ply[17]  5:2ply[14/3]
team 10014373  games  7   1:5ply[2/2/1/1/1]  2:2ply[5/1]  3:2ply[4/1]  4:4ply[3/2/1/1]  5:3ply[3/1/1]

(team, position) slots with >1 distinct player: 32 of 40
```

**32 of 40 position slots were played by more than one human.** One team's pos-5 was eight
different people across 23 games; a position-keyed heatmap there would look dense and
confident and depict nobody.

Therefore:

- **`player_id` is the aggregation key. Position is a selector and a label.**
- Default the picker to each position's **primary player** (most games).
- **Always show the game count** next to the map. "Pos 4 — 20 games" and "Pos 5 — 2 games"
  must not look alike.
- "All players at this position" is available but explicitly labelled as a blend.

This is the `scouting-evidence-hierarchy` principle — player record beats archetype
aggregates — and the S47 data says archetype is the wrong key for 80% of slots.

### Playback mode (secondary)

One match, ten dots at time _t_, event markers at their joined positions. Justified purely
by not having to open the Dota client; it makes no claim to beat the game's own replay
viewer. Reuses the point-slider pattern and `ObjectiveTicks` from Wards.

It also serves as the sanity check on the heatmap — if the aggregate looks wrong, scrub the
game and see why.

## Deferred

Rotation timing, gank habits, smoke paths and farm-zone metrics. Every one of these requires
inventing a definition (_what counts as a rotation?_ — leaving lane, crossing the river, and
proximity-for-N-seconds all give different answers, and all have parameters pulled from
nowhere). A bad definition produces a number that looks authoritative and means nothing.

The plan is to look at the map first, then define them. The archive makes each attempt a JS
loop over local files rather than a re-parse.

## Open calls (recommendations, not yet confirmed)

- **Events shown in playback**: start with hero deaths, smokes, wards, tower falls, roshan.
  Everything else is in `match_event` and can be toggled on later.
- **Playback animates or scrubs only**: scrub only to start. A play button is easy to add
  and easy to over-invest in.
- **Archive durability**: laptop-only to start; Supabase Storage if it ever feels precarious.

## Spike artifacts

`.context/spike/` (116 MB, gitignored): `8698061985.dem.bz2` and `out.ndjson`. Safe to
delete; reproducible in ~35 seconds.

## As built

Implemented as planned, with these deltas — all measured against the spike match rather than
estimated.

**Events: 412 per match, not 447.** The two `CHAT_MESSAGE_*_WARD_KILLED` families were
dropped as redundant: `obs_left` / `sen_left` already record the same removals _with_
coordinates and the killing hero, while the chat versions carry an ambiguous player1/player2
pair and no position.

**Slot attribution turned out to be inconsistent upstream, and that changed the design.**
Checking the real events rather than trusting the field names found three different
conventions in one stream:

| event                        | convention                                         |
| ---------------------------- | -------------------------------------------------- |
| `CHAT_MESSAGE_HERO_KILL`     | player1 = **victim**, player2 = killer             |
| `CHAT_MESSAGE_FIRSTBLOOD`    | player1 = **killer**, player2 = victim             |
| `CHAT_MESSAGE_ROSHAN_KILL`   | player1 = **team**, player2 = slot                 |
| `CHAT_MESSAGE_MINIBOSS_KILL` | value = team, player1 = **slot**                   |
| `CHAT_MESSAGE_SCAN_USED`     | no actor at all; player1/2 are -1, team in `value` |

So hero deaths are taken from `DOTA_COMBATLOG_DEATH`, where both sides are unambiguous hero
npc names, and `scan` / `glyph` are stored with `slot = null` rather than guessed onto a
player whose slot number happened to match a team id.

**Coordinate round-trip is better than specified**: 2.3 game units of error, not the ~13 the
0.1-grid quantisation allows for.

**A range/game-window bug was caught by a test, not by the map.** Clamping an out-of-window
sample index to 0 made a range starting after a short game ends bin that game from its first
second — so "Late (25+)" would have silently folded every 20-minute stomp in, in full. The
intersection is now done in time and only then converted to indexes.

**`match_event` is written by the same pass as `match_positions`** because the position join
is what gives most events their coordinates; they cannot be derived independently.

### Side was missed, and it was a bug

The first version of the heatmap pooled Radiant and Dire games. It should not
have — `ward-aggregation` already documented why sides cannot be combined, and
that reasoning was not carried across to movement. Measured on S47 once the data
existed:

| comparison                                                 | cosine    | % of floor |
| ---------------------------------------------------------- | --------- | ---------- |
| same player, same side, alternating-halves (**the floor**) | **0.704** | 100%       |
| same player, Dire mirrored onto Radiant                    | 0.535     | 76%        |
| same player, both sides pooled (**what shipped**)          | 0.318     | 45%        |

Centroids sat 22–40% of the map apart. Mirroring was tested rather than inherited
from the wards decision, and still rejected: it recovers a lot, but blends two
genuinely different pictures and draws a player on ground they never occupied.

Side is now mandatory with no pooled option, defaulting to the team's
majority side. Playback is exempt — it pools nothing.

The general lesson, which applies to the deferred metrics too: **anything that
aggregates across games has to state which side it is aggregating**, and the
cheapest check is to compute the same statistic per side and compare.

### Sample size after the split, and what "enough games" means

Splitting halves every sample. Median games per (player, side) view is **4**.
Split-half agreement as a function of sample size, measured:

| games in view | agreement |
| ------------- | --------- |
| 2 (1v1)       | 0.324     |
| 4 (2v2)       | 0.501     |
| 6 (3v3)       | 0.605     |
| 8 (4v4)       | 0.669     |
| 10 (5v5)      | 0.716     |
| 12 (6v6)      | 0.748     |

A one-game heatmap scores the same as the pooling bug. That is why the binary
"fewer than 5 games" warning — which would have fired on 52% of views — was
replaced by a graded label calibrated to this curve. The curve has not plateaued
by 12 games, so AD2L does not supply enough games for a stable picture of one
player on one side; the label says so rather than implying otherwise.

### Position blend: measured, deferred

Blending different players who share a team, position and side agrees at **0.573
— 81% of the floor**, with double the sample (median 8 games vs 4). That is far
better than the side-pooling error and makes the blend a defensible fallback for
thin players. Deferred rather than built, and explicitly not the default: a
position played by eight people is still a picture of nobody when the question is
what one human does.

### Not yet verified

Nothing outstanding. `migrations/add_movement.sql` has been applied, and the write path
(`toPgHex` → `bytea` → `fromPgHex` → gunzip) was verified byte-identical against a fresh
extract from the archive. 59 of 61 S47 matches are parsed; the two missing are the
hand-entered games OpenDota never ingested, which have no replay to fetch.

One thing the first pass got wrong operationally: Valve now serves some replays
zstd-compressed under a `.dem.bz2` name, and the hardcoded `bunzip2` failed with
`curl: (23) Failure writing output`, an error that points nowhere near compression. The
pipeline now sniffs the first four bytes.
