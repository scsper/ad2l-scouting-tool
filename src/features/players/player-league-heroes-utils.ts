import type { MatchApiResponse } from "../../../types/api"

export type PlayerLeagueHeroStats = {
  heroId: number
  games: number
  wins: number
  losses: number
  totalKills: number
  totalDeaths: number
  totalAssists: number
  lastPlayed: number // timestamp from match.start_date_time
}

export function aggregatePlayerLeagueHeroes(
  matches: MatchApiResponse[],
  playerId: number
): PlayerLeagueHeroStats[] {
  const heroStats: Record<number, PlayerLeagueHeroStats> = {}

  for (const match of matches) {
    // Find this player in the match
    const playerInMatch = match.players.find(p => p.player_id === playerId)
    if (!playerInMatch) continue

    const { hero_id, kills, deaths, assists, team_id } = playerInMatch
    const teamWon = match.winning_team_id === team_id
    const matchTimestamp = new Date(match.start_date_time).getTime()

    // Initialize hero stats if not exists
    if (!heroStats[hero_id]) {
      heroStats[hero_id] = {
        heroId: hero_id,
        games: 0,
        wins: 0,
        losses: 0,
        totalKills: 0,
        totalDeaths: 0,
        totalAssists: 0,
        lastPlayed: matchTimestamp,
      }
    }

    // Accumulate stats
    heroStats[hero_id].games++
    if (teamWon) {
      heroStats[hero_id].wins++
    } else {
      heroStats[hero_id].losses++
    }
    heroStats[hero_id].totalKills += kills
    heroStats[hero_id].totalDeaths += deaths
    heroStats[hero_id].totalAssists += assists

    // Track most recent match
    if (matchTimestamp > heroStats[hero_id].lastPlayed) {
      heroStats[hero_id].lastPlayed = matchTimestamp
    }
  }

  // Convert to array and sort by games played (descending)
  return Object.values(heroStats).sort((a, b) => b.games - a.games)
}
