import { createClient } from "@supabase/supabase-js"
import { tool } from "ai"
import { z } from "zod"
import { findHeroId, getHero } from "../../src/utils/get-hero.js"

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

function getSupabase() {
  return createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Columns we actually need from hero_counter_analysis
const SELECT_COLS = [
  "hero_a",
  "hero_b",
  "overall_wr_a",
  "overall_wr_b",
  "observed_wr_a_vs_b",
  "expected_wr_a_vs_b",
  "shrunk_wr_a_vs_b",
  "counter_score",
  "label",
  "significant",
  "matchup_games",
  "updated_at",
].join(", ")

type CounterAnalysisRow = {
  hero_a: number
  hero_b: number
  overall_wr_a: number
  overall_wr_b: number
  observed_wr_a_vs_b: number
  expected_wr_a_vs_b: number
  shrunk_wr_a_vs_b: number
  counter_score: number
  label: string
  significant: boolean
  matchup_games: number
  updated_at: string
}

// Fetch all rows where hero_a = heroId (hero's perspective as the attacker/first pick)
async function getCounterRows(heroId: number): Promise<CounterAnalysisRow[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("hero_counter_analysis")
    .select(SELECT_COLS)
    .eq("hero_a", heroId)

  if (error) throw new Error(`DB error: ${error.message}`)
  return data as unknown as CounterAnalysisRow[]
}

// Fetch the single row for a specific ordered pair (heroId vs vsHeroId)
async function getMatchupRow(
  heroId: number,
  vsHeroId: number,
): Promise<{ row: CounterAnalysisRow; flipped: boolean } | null> {
  const supabase = getSupabase()

  // Try canonical direction first
  const { data: direct } = await supabase
    .from("hero_counter_analysis")
    .select(SELECT_COLS)
    .eq("hero_a", heroId)
    .eq("hero_b", vsHeroId)
    .maybeSingle()

  if (direct) return { row: direct as unknown as CounterAnalysisRow, flipped: false }

  // Try reversed direction
  const { data: reversed } = await supabase
    .from("hero_counter_analysis")
    .select(SELECT_COLS)
    .eq("hero_a", vsHeroId)
    .eq("hero_b", heroId)
    .maybeSingle()

  if (reversed) return { row: reversed as unknown as CounterAnalysisRow, flipped: true }

  return null
}

function pct(wr: number) {
  return Math.round(wr * 10000) / 100
}

// counter_score is on the logit scale; label is already pre-classified in the DB.
// Returns a structured description expressed from heroA's POV.
function describeMatchup(
  heroA: string,
  heroB: string,
  row: CounterAnalysisRow,
  flipped: boolean,
): {
  verdict: string
  label: string
  counterScore: number
  significant: boolean
  matchupGames: number
  overallWrA: number
  overallWrB: number
  observedWrAVsB: number
  expectedWrAVsB: number
  shrunkWrAVsB: number
} {
  // When flipped, hero_a in the row is vsHero; negate score, swap label, and swap win rates
  const scoreFromA = flipped ? -row.counter_score : row.counter_score
  const labelFromA = flipped ? flipLabel(row.label) : row.label

  const overallWrA = flipped ? row.overall_wr_b : row.overall_wr_a
  const overallWrB = flipped ? row.overall_wr_a : row.overall_wr_b
  // observed/expected/shrunk are from hero_a's perspective in the row;
  // when flipped we invert them (complement) to express from heroA's perspective
  const observedWrAVsB = flipped ? 1 - row.observed_wr_a_vs_b : row.observed_wr_a_vs_b
  const expectedWrAVsB = flipped ? 1 - row.expected_wr_a_vs_b : row.expected_wr_a_vs_b
  const shrunkWrAVsB = flipped ? 1 - row.shrunk_wr_a_vs_b : row.shrunk_wr_a_vs_b

  let verdict: string
  if (labelFromA === "Hard Counter" || labelFromA === "Soft Counter") {
    verdict = `${heroA} counters ${heroB}`
  } else if (labelFromA === "Hard Countered" || labelFromA === "Soft Countered") {
    verdict = `${heroB} counters ${heroA}`
  } else {
    verdict = `${heroA} vs ${heroB} is a neutral matchup`
  }

  return {
    verdict,
    label: labelFromA,
    counterScore: Math.round(scoreFromA * 1000) / 1000,
    significant: row.significant,
    matchupGames: row.matchup_games,
    overallWrA: pct(overallWrA),
    overallWrB: pct(overallWrB),
    observedWrAVsB: pct(observedWrAVsB),
    expectedWrAVsB: pct(expectedWrAVsB),
    shrunkWrAVsB: pct(shrunkWrAVsB),
  }
}

function flipLabel(label: string): string {
  if (label === "Hard Counter") return "Hard Countered"
  if (label === "Soft Counter") return "Soft Countered"
  if (label === "Hard Countered") return "Hard Counter"
  if (label === "Soft Countered") return "Soft Counter"
  return label // "Neutral"
}

export const getHeroCounters = tool({
  description:
    "Look up statistically-derived hero counter matchup data. Given one hero, returns the heroes that counter it and the heroes it counters, across all ranks and the Legend bracket. Given two heroes, returns the specific head-to-head matchup strength with significance info. Useful for draft planning and identifying threats or opportunities.",
  inputSchema: z.object({
    heroName: z
      .string()
      .describe("The primary hero to check counter data for (e.g. 'Axe', 'Anti-Mage')."),
    vsHeroName: z
      .string()
      .optional()
      .describe(
        "Optional second hero. If provided, returns only the direct matchup between the two heroes.",
      ),
    limit: z
      .number()
      .optional()
      .describe("How many counters to return in each direction (default 10)."),
  }),
  execute: async ({ heroName, vsHeroName, limit = 10 }) => {
    const heroId = findHeroId(heroName)
    if (heroId === null) {
      return {
        error: `Hero "${heroName}" not found. Check the spelling — use the full Dota 2 hero name.`,
      }
    }

    const resolvedHeroName = getHero(heroId)

    // ── Direct matchup between two heroes ──────────────────────────────────────
    if (vsHeroName !== undefined) {
      const vsHeroId = findHeroId(vsHeroName)
      if (vsHeroId === null) {
        return {
          error: `Hero "${vsHeroName}" not found. Check the spelling — use the full Dota 2 hero name.`,
        }
      }

      const resolvedVsName = getHero(vsHeroId)
      const result = await getMatchupRow(heroId, vsHeroId)

      if (!result) {
        return {
          heroes: `${resolvedHeroName} vs ${resolvedVsName}`,
          result: "No matchup data found for this pair.",
        }
      }

      const matchup = describeMatchup(resolvedHeroName, resolvedVsName, result.row, result.flipped)

      return {
        matchup: `${resolvedHeroName} vs ${resolvedVsName}`,
        ...matchup,
        dataUpdatedAt: result.row.updated_at,
      }
    }

    // ── Full counter breakdown for a single hero ────────────────────────────────
    const rows = await getCounterRows(heroId)
    if (rows.length === 0) {
      return { error: `No counter data available for ${resolvedHeroName}.` }
    }

    const dataUpdatedAt = rows.reduce(
      (max, r) => (r.updated_at > max ? r.updated_at : max),
      rows[0].updated_at,
    )

    // counter_score > 0 → hero_a (resolvedHeroName) counters hero_b
    const heroCounters = rows
      .filter(r => r.counter_score > 0)
      .sort((a, b) => b.counter_score - a.counter_score)
      .slice(0, limit)
      .map(r => ({
        heroName: getHero(r.hero_b),
        label: r.label,
        counterScore: Math.round(r.counter_score * 1000) / 1000,
        significant: r.significant,
        matchupGames: r.matchup_games,
        overallWrA: pct(r.overall_wr_a),
        overallWrB: pct(r.overall_wr_b),
        observedWrAVsB: pct(r.observed_wr_a_vs_b),
        expectedWrAVsB: pct(r.expected_wr_a_vs_b),
        shrunkWrAVsB: pct(r.shrunk_wr_a_vs_b),
      }))

    // counter_score < 0 → hero_b counters hero_a (resolvedHeroName is countered)
    // Invert win rates to express from hero_b's (the counter's) perspective
    const heroIsCounteredBy = rows
      .filter(r => r.counter_score < 0)
      .sort((a, b) => a.counter_score - b.counter_score)
      .slice(0, limit)
      .map(r => ({
        heroName: getHero(r.hero_b),
        label: flipLabel(r.label),
        counterScore: Math.round(-r.counter_score * 1000) / 1000,
        significant: r.significant,
        matchupGames: r.matchup_games,
        overallWrA: pct(r.overall_wr_b),
        overallWrB: pct(r.overall_wr_a),
        observedWrAVsB: pct(1 - r.observed_wr_a_vs_b),
        expectedWrAVsB: pct(1 - r.expected_wr_a_vs_b),
        shrunkWrAVsB: pct(1 - r.shrunk_wr_a_vs_b),
      }))

    return {
      hero: resolvedHeroName,
      countersBy: {
        description: `Heroes that ${resolvedHeroName} counters (has an advantage against)`,
        heroes: heroCounters,
      },
      countersTo: {
        description: `Heroes that counter ${resolvedHeroName} (pick these against it)`,
        heroes: heroIsCounteredBy,
      },
      dataUpdatedAt,
    }
  },
})
