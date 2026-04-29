/**
 * Hero counter analysis pipeline.
 *
 * Reads from:
 *   - hero_stats (overall win rates)
 *   - hero_matchups (head-to-head win rates from backfill-hero-matchups.ts)
 *
 * Writes to:
 *   - hero_counter_analysis (create this table in Supabase first — see SQL below)
 *
 * Required Supabase table:
 *
 *   CREATE TABLE hero_counter_analysis (
 *     hero_a              INT     NOT NULL,
 *     hero_b              INT     NOT NULL,
 *     -- All ranks
 *     overall_wr_a                        FLOAT   NOT NULL,
 *     overall_wr_b                        FLOAT   NOT NULL,
 *     observed_wr_a_vs_b                  FLOAT   NOT NULL,
 *     expected_wr_a_vs_b                  FLOAT   NOT NULL,
 *     shrunk_wr_a_vs_b                    FLOAT   NOT NULL,
 *     matchup_games                       INT     NOT NULL,
 *     counter_score                       FLOAT   NOT NULL,
 *     z_score                             FLOAT   NOT NULL,
 *     p_value                             FLOAT   NOT NULL,
 *     significant                         BOOLEAN NOT NULL,
 *     label                               TEXT    NOT NULL,
 *     -- Legend+ bracket
 *     overall_wr_a_legend_plus            FLOAT,
 *     overall_wr_b_legend_plus            FLOAT,
 *     expected_wr_a_vs_b_legend_plus      FLOAT,
 *     shrunk_wr_a_vs_b_legend_plus        FLOAT,
 *     counter_score_legend_plus           FLOAT,
 *     z_score_legend_plus                 FLOAT,
 *     p_value_legend_plus                 FLOAT,
 *     significant_legend_plus             BOOLEAN,
 *     label_legend_plus                   TEXT,
 *     -- Legend surrounding bracket
 *     overall_wr_a_legend_surrounding     FLOAT,
 *     overall_wr_b_legend_surrounding     FLOAT,
 *     expected_wr_a_vs_b_legend_surrounding FLOAT,
 *     shrunk_wr_a_vs_b_legend_surrounding FLOAT,
 *     counter_score_legend_surrounding    FLOAT,
 *     z_score_legend_surrounding          FLOAT,
 *     p_value_legend_surrounding          FLOAT,
 *     significant_legend_surrounding      BOOLEAN,
 *     label_legend_surrounding            TEXT,
 *     updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     PRIMARY KEY (hero_a, hero_b)
 *   );
 *
 *   -- If upgrading an existing table, add the new columns:
 *   ALTER TABLE hero_counter_analysis
 *     ADD COLUMN IF NOT EXISTS overall_wr_a_legend_plus            FLOAT,
 *     ADD COLUMN IF NOT EXISTS overall_wr_b_legend_plus            FLOAT,
 *     ADD COLUMN IF NOT EXISTS expected_wr_a_vs_b_legend_plus      FLOAT,
 *     ADD COLUMN IF NOT EXISTS shrunk_wr_a_vs_b_legend_plus        FLOAT,
 *     ADD COLUMN IF NOT EXISTS counter_score_legend_plus           FLOAT,
 *     ADD COLUMN IF NOT EXISTS z_score_legend_plus                 FLOAT,
 *     ADD COLUMN IF NOT EXISTS p_value_legend_plus                 FLOAT,
 *     ADD COLUMN IF NOT EXISTS significant_legend_plus             BOOLEAN,
 *     ADD COLUMN IF NOT EXISTS label_legend_plus                   TEXT,
 *     ADD COLUMN IF NOT EXISTS overall_wr_a_legend_surrounding     FLOAT,
 *     ADD COLUMN IF NOT EXISTS overall_wr_b_legend_surrounding     FLOAT,
 *     ADD COLUMN IF NOT EXISTS expected_wr_a_vs_b_legend_surrounding FLOAT,
 *     ADD COLUMN IF NOT EXISTS shrunk_wr_a_vs_b_legend_surrounding FLOAT,
 *     ADD COLUMN IF NOT EXISTS counter_score_legend_surrounding    FLOAT,
 *     ADD COLUMN IF NOT EXISTS z_score_legend_surrounding          FLOAT,
 *     ADD COLUMN IF NOT EXISTS p_value_legend_surrounding          FLOAT,
 *     ADD COLUMN IF NOT EXISTS significant_legend_surrounding      BOOLEAN,
 *     ADD COLUMN IF NOT EXISTS label_legend_surrounding            TEXT;
 *
 * Usage:
 *   tsx scripts/compute-hero-counters.ts
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Types ────────────────────────────────────────────────────────────────────

type HeroWinRate = {
  hero_id: number
  hero_name: string
  overall_wr: number
  total_games: number
  overall_wr_legend_plus: number | null
  overall_wr_legend_surrounding: number | null
}

type RawMatchup = {
  hero_id: number
  versus_hero_id: number
  games_played: number
  wins: number
}

type BracketAnalysis = {
  overall_wr_a: number
  overall_wr_b: number
  expected_wr_a_vs_b: number
  shrunk_wr_a_vs_b: number
  counter_score: number
  z_score: number
  p_value: number
  significant: boolean
  label: string
}

export type CounterAnalysisRow = {
  hero_a: number
  hero_b: number
  // All ranks
  overall_wr_a: number
  overall_wr_b: number
  observed_wr_a_vs_b: number
  expected_wr_a_vs_b: number
  shrunk_wr_a_vs_b: number
  matchup_games: number
  counter_score: number
  z_score: number
  p_value: number
  significant: boolean
  label: string
  // Legend+ bracket (null if either hero has no legend+ games)
  overall_wr_a_legend_plus: number | null
  overall_wr_b_legend_plus: number | null
  expected_wr_a_vs_b_legend_plus: number | null
  shrunk_wr_a_vs_b_legend_plus: number | null
  counter_score_legend_plus: number | null
  z_score_legend_plus: number | null
  p_value_legend_plus: number | null
  significant_legend_plus: boolean | null
  label_legend_plus: string | null
  // Legend surrounding bracket (null if either hero has no legend surrounding games)
  overall_wr_a_legend_surrounding: number | null
  overall_wr_b_legend_surrounding: number | null
  expected_wr_a_vs_b_legend_surrounding: number | null
  shrunk_wr_a_vs_b_legend_surrounding: number | null
  counter_score_legend_surrounding: number | null
  z_score_legend_surrounding: number | null
  p_value_legend_surrounding: number | null
  significant_legend_surrounding: boolean | null
  label_legend_surrounding: string | null
  updated_at: string
}

// ─── Statistical functions ────────────────────────────────────────────────────

// Bayesian shrinkage prior weight — higher = more shrinkage toward prior for low-sample matchups
const ALPHA = 200

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

function logit(p: number): number {
  const c = clamp(p, 0.001, 0.999)
  return Math.log(c / (1 - c))
}

function expectedWinRate(wrA: number, wrB: number): number {
  return clamp(wrA - wrB + 0.5, 0.05, 0.95)
}

function bayesianShrink(observedWr: number, priorWr: number, n: number): number {
  return (n * observedWr + ALPHA * priorWr) / (n + ALPHA)
}

function counterScore(shrunkWr: number, expectedWr: number): number {
  return logit(shrunkWr) - logit(expectedWr)
}

// Abramowitz & Stegun approximation, max error ~1.5e-7
function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const poly =
    t *
    (0.254829592 +
      t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  return sign * (1 - poly * Math.exp(-ax * ax))
}

function normalCDF(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2))
}

function significanceTest(
  observedWr: number,
  expectedWr: number,
  n: number,
): { zScore: number; pValue: number; significant: boolean } {
  if (n === 0) return { zScore: 0, pValue: 1, significant: false }
  const se = Math.sqrt((observedWr * (1 - observedWr)) / n)
  if (se === 0) return { zScore: 0, pValue: 1, significant: false }
  const z = (observedWr - expectedWr) / se
  const p = 2 * (1 - normalCDF(Math.abs(z)))
  return { zScore: z, pValue: p, significant: p < 0.01 }
}

function classify(score: number): string {
  if (score > 0.3) return "Hard Counter"
  if (score > 0.15) return "Soft Counter"
  if (score >= -0.15) return "Neutral"
  if (score >= -0.3) return "Soft Countered"
  return "Hard Countered"
}

function computeBracketAnalysis(
  wrA: number,
  wrB: number,
  observedWr: number,
  n: number,
): BracketAnalysis {
  const expected = expectedWinRate(wrA, wrB)
  const shrunk = bayesianShrink(observedWr, wrA, n)
  const score = counterScore(shrunk, expected)
  const { zScore, pValue, significant } = significanceTest(observedWr, expected, n)
  return {
    overall_wr_a: wrA,
    overall_wr_b: wrB,
    expected_wr_a_vs_b: expected,
    shrunk_wr_a_vs_b: shrunk,
    counter_score: score,
    z_score: zScore,
    p_value: pValue,
    significant,
    label: classify(score),
  }
}

// ─── Data loaders ─────────────────────────────────────────────────────────────

async function loadHeroWinRates(): Promise<Map<number, HeroWinRate>> {
  const { data, error } = await supabase
    .from("hero_stats")
    .select(
      "hero_id, hero_name, all_pick, all_win, legend_plus_pick, legend_plus_win, legend_surrounding_pick, legend_surrounding_win",
    )

  if (error) throw new Error(`Failed to load hero_stats: ${error.message}`)
  if (!data?.length) throw new Error("hero_stats is empty — run hero-stats.ts first")

  const map = new Map<number, HeroWinRate>()
  for (const row of data) {
    if (!row.all_pick || row.all_pick === 0) continue
    map.set(row.hero_id, {
      hero_id: row.hero_id,
      hero_name: row.hero_name,
      overall_wr: row.all_win / row.all_pick,
      total_games: row.all_pick,
      overall_wr_legend_plus:
        row.legend_plus_pick > 0 ? row.legend_plus_win / row.legend_plus_pick : null,
      overall_wr_legend_surrounding:
        row.legend_surrounding_pick > 0
          ? row.legend_surrounding_win / row.legend_surrounding_pick
          : null,
    })
  }
  return map
}

async function loadMatchups(): Promise<RawMatchup[]> {
  const PAGE_SIZE = 1_000
  const rows: RawMatchup[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from("hero_matchups")
      .select("hero_id, versus_hero_id, games_played, wins")
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(`Failed to load hero_matchups: ${error.message}`)
    if (!data?.length) break

    rows.push(...(data as RawMatchup[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  if (rows.length === 0) {
    throw new Error("hero_matchups is empty — run backfill-hero-matchups.ts first")
  }

  return rows
}

async function upsertBatch(rows: CounterAnalysisRow[]): Promise<void> {
  const { error } = await supabase
    .from("hero_counter_analysis")
    .upsert(rows, { onConflict: "hero_a,hero_b" })
  if (error) throw new Error(`Upsert failed: ${error.message}`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Loading hero win rates from hero_stats...")
  const heroWinRates = await loadHeroWinRates()
  console.log(`  ${heroWinRates.size} heroes loaded`)

  console.log("Loading head-to-head matchups from hero_matchups...")
  const matchups = await loadMatchups()
  console.log(`  ${matchups.length} matchup rows loaded`)

  const updatedAt = new Date().toISOString()
  const results: CounterAnalysisRow[] = []
  let skipped = 0

  for (const m of matchups) {
    const heroA = heroWinRates.get(m.hero_id)
    const heroB = heroWinRates.get(m.versus_hero_id)

    if (!heroA || !heroB || m.games_played === 0) {
      skipped++
      continue
    }

    const observedWr = m.wins / m.games_played
    const all = computeBracketAnalysis(heroA.overall_wr, heroB.overall_wr, observedWr, m.games_played)

    const legendPlus =
      heroA.overall_wr_legend_plus != null && heroB.overall_wr_legend_plus != null
        ? computeBracketAnalysis(
            heroA.overall_wr_legend_plus,
            heroB.overall_wr_legend_plus,
            observedWr,
            m.games_played,
          )
        : null

    const legendSurrounding =
      heroA.overall_wr_legend_surrounding != null && heroB.overall_wr_legend_surrounding != null
        ? computeBracketAnalysis(
            heroA.overall_wr_legend_surrounding,
            heroB.overall_wr_legend_surrounding,
            observedWr,
            m.games_played,
          )
        : null

    results.push({
      hero_a: m.hero_id,
      hero_b: m.versus_hero_id,
      observed_wr_a_vs_b: observedWr,
      matchup_games: m.games_played,
      // All ranks
      overall_wr_a: all.overall_wr_a,
      overall_wr_b: all.overall_wr_b,
      expected_wr_a_vs_b: all.expected_wr_a_vs_b,
      shrunk_wr_a_vs_b: all.shrunk_wr_a_vs_b,
      counter_score: all.counter_score,
      z_score: all.z_score,
      p_value: all.p_value,
      significant: all.significant,
      label: all.label,
      // Legend+
      overall_wr_a_legend_plus: legendPlus?.overall_wr_a ?? null,
      overall_wr_b_legend_plus: legendPlus?.overall_wr_b ?? null,
      expected_wr_a_vs_b_legend_plus: legendPlus?.expected_wr_a_vs_b ?? null,
      shrunk_wr_a_vs_b_legend_plus: legendPlus?.shrunk_wr_a_vs_b ?? null,
      counter_score_legend_plus: legendPlus?.counter_score ?? null,
      z_score_legend_plus: legendPlus?.z_score ?? null,
      p_value_legend_plus: legendPlus?.p_value ?? null,
      significant_legend_plus: legendPlus?.significant ?? null,
      label_legend_plus: legendPlus?.label ?? null,
      // Legend surrounding
      overall_wr_a_legend_surrounding: legendSurrounding?.overall_wr_a ?? null,
      overall_wr_b_legend_surrounding: legendSurrounding?.overall_wr_b ?? null,
      expected_wr_a_vs_b_legend_surrounding: legendSurrounding?.expected_wr_a_vs_b ?? null,
      shrunk_wr_a_vs_b_legend_surrounding: legendSurrounding?.shrunk_wr_a_vs_b ?? null,
      counter_score_legend_surrounding: legendSurrounding?.counter_score ?? null,
      z_score_legend_surrounding: legendSurrounding?.z_score ?? null,
      p_value_legend_surrounding: legendSurrounding?.p_value ?? null,
      significant_legend_surrounding: legendSurrounding?.significant ?? null,
      label_legend_surrounding: legendSurrounding?.label ?? null,
      updated_at: updatedAt,
    })
  }

  console.log(`Computed ${results.length} matchup analyses (skipped ${skipped} with missing data)`)

  const BATCH_SIZE = 1_000
  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = results.slice(i, i + BATCH_SIZE)
    await upsertBatch(batch)
    console.log(`  Upserted ${Math.min(i + BATCH_SIZE, results.length)}/${results.length}`)
  }

  console.log("Done.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
