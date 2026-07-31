-- Orphaned by the removal of the Draft Counters and Hero Counters tabs.
-- Nothing in the codebase reads or writes these tables anymore.
--
-- NOT YET APPLIED. Run this in the Supabase SQL editor when you're ready to
-- reclaim the space. Note that hero_matchups and hero_stats were populated by
-- a long batch of Stratz API calls, so repopulating them is not free.
--
--   hero_counters          <- api/hero-counters.ts (Stratz heroVsHeroMatchup)
--   hero_counter_analysis  <- scripts/compute-hero-counters.ts
--   hero_matchups          <- scripts/backfill-hero-matchups.ts
--   hero_stats             <- scripts/hero-stats.ts

DROP TABLE IF EXISTS hero_counters;
DROP TABLE IF EXISTS hero_counter_analysis;
DROP TABLE IF EXISTS hero_matchups;
DROP TABLE IF EXISTS hero_stats;
