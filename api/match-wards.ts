import { createClient } from "@supabase/supabase-js"
import { selectAll } from "../server/select-all.js"
import type { MatchPlayerRow, MatchRow, WardRecord } from "../types/db.js"

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export type WardMatchPlayer = Pick<
  MatchPlayerRow,
  "player_id" | "player_name" | "hero_id" | "position" | "team_id"
> & {
  wards: WardRecord[] | null
}

export type WardMatch = Pick<
  MatchRow,
  | "id"
  | "start_date_time"
  | "radiant_team_id"
  | "dire_team_id"
  | "winning_team_id"
> & {
  duration: number
  /** True when this team was Radiant, so the aggregate can be split by side. */
  isRadiant: boolean
  /**
   * False when no player on either side has ward data — an unparsed match, or
   * one hand-entered from screenshots that OpenDota never ingested. Callers must
   * exclude these from the denominator rather than treating them as zero wards.
   */
  hasWardData: boolean
  /** Wards placed by the requested team only. */
  players: WardMatchPlayer[]
}

export type MatchWardsApiResponse = {
  matches: WardMatch[]
}

async function getWardsByLeagueAndTeam(
  leagueId: string,
  teamId: string,
): Promise<MatchWardsApiResponse> {
  const leagueIdNum = parseInt(leagueId, 10)
  const teamIdNum = parseInt(teamId, 10)

  const matches = await selectAll<MatchRow>((from, to) =>
    supabase
      .from("match")
      .select(
        "id, start_date_time, end_date_time, radiant_team_id, dire_team_id, winning_team_id",
      )
      .eq("league_id", leagueIdNum)
      .or(
        `radiant_team_id.eq.${String(teamIdNum)},dire_team_id.eq.${String(teamIdNum)}`,
      )
      .order("start_date_time", { ascending: false })
      .range(from, to),
  )

  if (matches.length === 0) return { matches: [] }

  const matchIds = matches.map(m => m.id)

  // Only this team's players. `parseMatch` writes all ten rows together, so if
  // the replay was never parsed these five are NULL too — enough to derive
  // `hasWardData` without pulling the opponent's blobs across the wire.
  const players = await selectAll<WardMatchPlayer & { match_id: number }>(
    (from, to) =>
      supabase
        .from("match_player")
        .select(
          "match_id, player_id, player_name, hero_id, position, team_id, wards",
        )
        .in("match_id", matchIds)
        .eq("team_id", teamIdNum)
        .range(from, to),
  )

  const byMatch = new Map<number, (WardMatchPlayer & { match_id: number })[]>()
  for (const player of players) {
    const list = byMatch.get(player.match_id) ?? []
    list.push(player)
    byMatch.set(player.match_id, list)
  }

  const result: WardMatch[] = matches.map(match => {
    const all = byMatch.get(match.id) ?? []
    return {
      id: match.id,
      start_date_time: match.start_date_time,
      radiant_team_id: match.radiant_team_id,
      dire_team_id: match.dire_team_id,
      winning_team_id: match.winning_team_id,
      duration: Math.max(0, match.end_date_time - match.start_date_time),
      isRadiant: match.radiant_team_id === teamIdNum,
      hasWardData: all.some(p => p.wards !== null),
      players: all.map(
        ({ player_id, player_name, hero_id, position, team_id, wards }) => ({
          player_id,
          player_name,
          hero_id,
          position,
          team_id,
          wards,
        }),
      ),
    }
  })

  return { matches: result }
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
    const data = await getWardsByLeagueAndTeam(leagueId, teamId)
    res.status(200).json(data)
  } catch (error) {
    console.error("Error in handler:", error)
    res.status(500).json({ error: "Failed to fetch ward data" })
  }
}
