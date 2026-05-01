import { createClient } from "@supabase/supabase-js"
import { tool } from "ai"
import { z } from "zod"
import { getHero } from "../../src/utils/get-hero.js"

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

function getSupabase() {
  return createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

type HeroStats = { games: number; wins: number }

type PlayerRow = { id: number; name: string; role: string }
type PubStatRow = { player_id: number; hero_id: number; wins: number; losses: number }
type LeagueRow = {
  player_id: number
  hero_id: number
  team_id: number
  match_id: number
}

export const getRosterHeroStats = tool({
  description:
    "Get the 10 most played heroes for each player on a team's roster at their designated position, both in league matches (AD2L) and in public games (pubs). Use this whenever discussing a player's hero pool, most played heroes, comfort picks, or tendencies.",
  inputSchema: z.object({
    teamId: z.number().describe("The team ID whose roster stats should be fetched."),
    leagueId: z
      .number()
      .optional()
      .describe(
        "AD2L league ID to filter league stats by. Omit to aggregate all recorded league matches.",
      ),
  }),
  execute: async ({ teamId, leagueId }) => {
    const supabase = getSupabase()

    // Look up the team name
    const teamResult = await supabase.from("team").select("id, name").eq("id", teamId).single()

    const teamData = teamResult.data as { id: number; name: string } | null
    if (!teamData) {
      return { error: `Team with ID ${String(teamId)} not found in the database.` }
    }

    // Get all players on the team
    const playersResult = await supabase
      .from("player")
      .select("id, name, role")
      .eq("team_id", teamId)
      .order("name", { ascending: true })

    const players = (playersResult.data ?? []) as PlayerRow[]
    if (players.length === 0) {
      return { error: `No players found for team ID ${String(teamId)}.` }
    }

    const playerIds = players.map(p => p.id)

    // Fetch pre-computed pub top-10 heroes (stored by player-pub-matches ingestion)
    const pubResult = await supabase
      .from("player_pub_match_stats")
      .select("player_id, hero_id, wins, losses")
      .in("player_id", playerIds)
      .eq("type", "TOP_10_HEROES_BY_POSITION")

    const pubStats = (pubResult.data ?? []) as PubStatRow[]

    // Resolve optional league filter to match IDs
    let matchIdFilter: number[] | null = null
    if (leagueId !== undefined) {
      const matchesResult = await supabase
        .from("match")
        .select("id")
        .eq("league_id", leagueId)
      const ids = ((matchesResult.data ?? []) as { id: number }[]).map(m => m.id)
      if (ids.length > 0) matchIdFilter = ids
    }

    console.log(teamId, playerIds)

    // Fetch league match_player rows
    let leagueQuery = supabase
      .from("match_player")
      .select("player_id, hero_id, team_id, match_id")
      .eq("team_id", teamId)
      .in("player_id", playerIds)

    if (matchIdFilter !== null) {
      leagueQuery = leagueQuery.in("match_id", matchIdFilter)
    }

    const leagueResult = await leagueQuery
    if (leagueResult.error) {
      console.error("[get-roster-hero-stats] match_player query error:", leagueResult.error)
      return { error: leagueResult.error.message }
    }
    const leagueRows = leagueResult.data as LeagueRow[]

    // Fetch winning_team_id for each match separately to avoid relying on a FK embedding
    const matchIds = [...new Set(leagueRows.map(r => r.match_id))]
    const winnerMap: Record<number, number | null> = {}
    if (matchIds.length > 0) {
      const matchResult = await supabase
        .from("match")
        .select("id, winning_team_id")
        .in("id", matchIds)
      if (matchResult.error) {
        console.error("[get-roster-hero-stats] match query error:", matchResult.error)
        return { error: matchResult.error.message }
      }
      for (const m of matchResult.data as { id: number; winning_team_id: number | null }[]) {
        winnerMap[m.id] = m.winning_team_id
      }
    }

    // Aggregate league heroes per player: playerId → heroId → { games, wins }
    const leagueMap = {} as Record<number, Record<number, HeroStats | undefined> | undefined>

    for (const row of leagueRows) {
      const won = winnerMap[row.match_id] === row.team_id

      const heroMap = (leagueMap[row.player_id] ??= {})
      const existing = heroMap[row.hero_id]
      if (existing) {
        existing.games++
        if (won) existing.wins++
      } else {
        heroMap[row.hero_id] = { games: 1, wins: won ? 1 : 0 }
      }
    }

    return {
      team: teamData.name,
      players: players.map(player => {
        const pubHeroes = pubStats
          .filter(s => s.player_id === player.id)
          .map(s => {
            const games = s.wins + s.losses
            return {
              heroName: getHero(s.hero_id),
              games,
              wins: s.wins,
              winRate: games > 0 ? `${String(Math.round((s.wins / games) * 100))}%` : "0%",
            }
          })
          .sort((a, b) => b.games - a.games)

        const leagueHeroes = Object.entries(leagueMap[player.id] ?? {})
          .filter((entry): entry is [string, HeroStats] => entry[1] !== undefined)
          .sort((a, b) => b[1].games - a[1].games)
          .slice(0, 10)
          .map(([heroId, stats]) => ({
            heroName: getHero(Number(heroId)),
            games: stats.games,
            wins: stats.wins,
            winRate:
              stats.games > 0
                ? `${String(Math.round((stats.wins / stats.games) * 100))}%`
                : "0%",
          }))

        return {
          name: player.name,
          role: player.role,
          leagueHeroes:
            leagueHeroes.length > 0 ? leagueHeroes : "No league data recorded for this player.",
          pubHeroes:
            pubHeroes.length > 0
              ? pubHeroes
              : "No pub data found — stats may need to be refreshed.",
        }
      }),
    }
  },
})
