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
  match: { winning_team_id: number | null } | { winning_team_id: number | null }[] | null
}

export const getRosterHeroStats = tool({
  description:
    "Get the 10 most played heroes for each player in Sharkhorse's roster, both in league matches (AD2L) and in public games (pubs). Use this whenever discussing a player's hero pool, most played heroes, comfort picks, or tendencies.",
  inputSchema: z.object({
    leagueId: z
      .number()
      .optional()
      .describe(
        "AD2L league ID to filter league stats by. Omit to aggregate all recorded league matches.",
      ),
  }),
  execute: async ({ leagueId }) => {
    const supabase = getSupabase()

    // Find Sharkhorse's team
    const teamResult = await supabase
      .from("team")
      .select("id, name")
      .ilike("name", "%sharkhorse%")
      .single()

    const teamData = teamResult.data as { id: number; name: string } | null
    if (!teamData) {
      return { error: "Sharkhorse team not found in the database." }
    }

    const teamId = teamData.id

    // Get all players on Sharkhorse
    const playersResult = await supabase
      .from("player")
      .select("id, name, role")
      .eq("team_id", teamId)
      .order("name", { ascending: true })

    const players = (playersResult.data ?? []) as PlayerRow[]
    if (players.length === 0) {
      return { error: "No players found for Sharkhorse." }
    }

    const playerIds = players.map(p => p.id)

    // Fetch pre-computed pub top-10 heroes (stored by player-pub-matches ingestion)
    const pubResult = await supabase
      .from("player_pub_match_stats")
      .select("player_id, hero_id, wins, losses")
      .in("player_id", playerIds)
      .eq("type", "TOP_10_HEROES_OVERALL")

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

    // Fetch league match_player rows, joining match for win resolution
    let leagueQuery = supabase
      .from("match_player")
      .select("player_id, hero_id, team_id, match:match_id(winning_team_id)")
      .eq("team_id", teamId)
      .in("player_id", playerIds)

    if (matchIdFilter !== null) {
      leagueQuery = leagueQuery.in("match_id", matchIdFilter)
    }

    const leagueResult = await leagueQuery
    const leagueRows = (leagueResult.data ?? []) as LeagueRow[]

    // Aggregate league heroes per player: playerId → heroId → { games, wins }
    const leagueMap = {} as Record<number, Record<number, HeroStats | undefined> | undefined>

    for (const row of leagueRows) {
      const matchData = Array.isArray(row.match) ? row.match[0] : row.match
      const won = matchData?.winning_team_id === row.team_id

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
