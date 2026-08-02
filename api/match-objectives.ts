import { createClient } from "@supabase/supabase-js"
import { selectAll } from "../server/select-all.js"
import type { MatchObjectiveRow, MatchRow } from "../types/db.js"

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export type ObjectiveEvent = Omit<MatchObjectiveRow, "match_id">

export type ObjectiveMatch = Pick<
  MatchRow,
  | "id"
  | "start_date_time"
  | "radiant_team_id"
  | "dire_team_id"
  | "winning_team_id"
> & {
  duration: number
  /** True when the scouted team was Radiant, so towers can be made team-relative. */
  isRadiant: boolean
  /** OpenDota patch index; gates whether a Roshan pit can be deduced. */
  patch: number | null
  /**
   * False when the replay was never objective-parsed. Callers must keep these
   * out of fall-rate denominators — an unparsed game is not a game in which
   * every building survived.
   */
  hasObjectiveData: boolean
  objectives: ObjectiveEvent[]
}

/**
 * One row of the `league_building_timing` view: a tower slot across the whole
 * league, so a team's pace can be read against a baseline rather than in a
 * vacuum.
 */
export type LeagueBuildingTiming = {
  tier: number
  lane: string
  side: string
  /** Games in which this tower fell. */
  fell: number
  /** Objective-parsed games in the league — the honest denominator for `fell`. */
  parsed_matches: number
  median_time: number | null
  p25_time: number | null
  p75_time: number | null
}

export type MatchObjectivesApiResponse = {
  matches: ObjectiveMatch[]
  leagueBaseline: LeagueBuildingTiming[]
}

async function getObjectivesByLeagueAndTeam(
  leagueId: string,
  teamId: string,
): Promise<MatchObjectivesApiResponse> {
  const leagueIdNum = parseInt(leagueId, 10)
  const teamIdNum = parseInt(teamId, 10)

  const matches = await selectAll<
    MatchRow & { patch: number | null; objectives_parsed: boolean }
  >((from, to) =>
    supabase
      .from("match")
      .select(
        "id, start_date_time, end_date_time, radiant_team_id, dire_team_id, winning_team_id, patch, objectives_parsed",
      )
      .eq("league_id", leagueIdNum)
      .or(
        `radiant_team_id.eq.${String(teamIdNum)},dire_team_id.eq.${String(teamIdNum)}`,
      )
      .order("start_date_time", { ascending: false })
      .range(from, to),
  )

  const leagueBaseline = await selectAll<LeagueBuildingTiming>((from, to) =>
    supabase
      .from("league_building_timing")
      .select(
        "tier, lane, side, fell, parsed_matches, median_time, p25_time, p75_time",
      )
      .eq("league_id", leagueIdNum)
      .range(from, to),
  )

  if (matches.length === 0) return { matches: [], leagueBaseline }

  const matchIds = matches.map(m => m.id)

  // Paged deliberately: a team with 60 games carries ~2200 objective rows, well
  // past the 1000-row ceiling PostgREST applies without reporting it.
  const events = await selectAll<MatchObjectiveRow>((from, to) =>
    supabase
      .from("match_objective")
      .select("match_id, time, type, key, unit, team, player_slot, slot")
      .in("match_id", matchIds)
      .order("time", { ascending: true })
      .range(from, to),
  )

  const byMatch = new Map<number, ObjectiveEvent[]>()
  for (const { match_id, ...event } of events) {
    const list = byMatch.get(match_id) ?? []
    list.push(event)
    byMatch.set(match_id, list)
  }

  const result: ObjectiveMatch[] = matches.map(match => ({
    id: match.id,
    start_date_time: match.start_date_time,
    radiant_team_id: match.radiant_team_id,
    dire_team_id: match.dire_team_id,
    winning_team_id: match.winning_team_id,
    duration: Math.max(0, match.end_date_time - match.start_date_time),
    isRadiant: match.radiant_team_id === teamIdNum,
    patch: match.patch,
    hasObjectiveData: match.objectives_parsed,
    objectives: byMatch.get(match.id) ?? [],
  }))

  return { matches: result, leagueBaseline }
}

export default async function handler(
  req: { query: { leagueId: string; teamId: string } },
  res: { status: (code: number) => { json: (data: unknown) => void } },
) {
  const { leagueId, teamId } = req.query

  if (!leagueId || !teamId) {
    res.status(400).json({ error: "leagueId and teamId are required" })
    return
  }

  try {
    const data = await getObjectivesByLeagueAndTeam(leagueId, teamId)
    res.status(200).json(data)
  } catch (error) {
    console.error("Error in handler:", error)
    res.status(500).json({ error: "Failed to fetch objective data" })
  }
}
