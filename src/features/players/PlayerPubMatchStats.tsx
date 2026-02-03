import {
  useGetPlayerPubMatchesQuery,
  useFetchPlayerPubMatchesMutation,
} from "./players-api"
import { getHero } from "../../utils/get-hero"
import { aggregatePlayerLeagueHeroes } from "./player-league-heroes-utils"
import type { PlayerPubMatchStatsRow } from "../../../types/db"
import type { TransformedMatchesApiResponse } from "../matches/matches-api"

type PlayerPubMatchStatsProps = {
  playerId: number
  playerRole: string
  matchesData?: TransformedMatchesApiResponse
}

// Map player roles to Stratz position IDs
function roleToPositions(role: string): string[] {
  switch (role) {
    case "Carry":
      return ["POSITION_1"]
    case "Mid":
      return ["POSITION_2"]
    case "Offlane":
      return ["POSITION_3"]
    case "Soft Support":
    case "Hard Support":
      return ["POSITION_4", "POSITION_5"]
    default:
      return [] // No filter if role is unknown
  }
}

type HeroStatsDisplayProps = {
  title: string
  stats: PlayerPubMatchStatsRow[]
  filterLeastPlayedHeroes: boolean
  emptyMessage: string
}

const HeroStatsDisplay = ({
  title,
  stats,
  emptyMessage,
  filterLeastPlayedHeroes,
}: HeroStatsDisplayProps) => {
  if (stats.length === 0) {
    return (
      <div className="bg-slate-900/30 rounded-lg p-6">
        <h4 className="text-sm font-medium text-slate-300 mb-3">{title}</h4>
        <div className="text-slate-500 text-sm">{emptyMessage}</div>
      </div>
    )
  }

  let myStats: PlayerPubMatchStatsRow[] = stats

  if (filterLeastPlayedHeroes) {
    myStats = [...myStats].filter(stat => stat.wins + stat.losses > 1)
  }

  // Filter out heroes with only 1 game, then sort by total games descending
  const sortedStats = [...myStats].sort((a, b) => {
    const totalA = a.wins + a.losses
    const totalB = b.wins + b.losses
    return totalB - totalA
  })

  const getRelativeTime = (timestampStr: string | null): string => {
    if (!timestampStr) return "Unknown"

    const now = Date.now()
    const timestamp = new Date(timestampStr).getTime()
    const diffInSeconds = Math.floor((now - timestamp) / 1000)

    if (diffInSeconds < 60) return "just now"

    const diffInMinutes = Math.floor(diffInSeconds / 60)
    if (diffInMinutes < 60) {
      return `${diffInMinutes} min${diffInMinutes === 1 ? "" : "s"} ago`
    }

    const diffInHours = Math.floor(diffInMinutes / 60)
    if (diffInHours < 24) {
      return `${diffInHours} hr${diffInHours === 1 ? "" : "s"} ago`
    }

    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays < 7) {
      return `${diffInDays} day${diffInDays === 1 ? "" : "s"} ago`
    }

    const diffInWeeks = Math.floor(diffInDays / 7)
    if (diffInWeeks < 4) {
      return `${diffInWeeks} week${diffInWeeks === 1 ? "" : "s"} ago`
    }

    const diffInMonths = Math.floor(diffInDays / 30)
    if (diffInMonths < 12) {
      return `${diffInMonths} month${diffInMonths === 1 ? "" : "s"} ago`
    }

    const diffInYears = Math.floor(diffInDays / 365)
    return `${diffInYears} year${diffInYears === 1 ? "" : "s"} ago`
  }

  return (
    <div className="bg-slate-900/30 rounded-lg p-6">
      <h4 className="text-base font-medium text-slate-300 mb-4">{title}</h4>
      <div className="space-y-3">
        {sortedStats.map(stat => {
          const totalGames = stat.wins + stat.losses
          const winRate =
            totalGames > 0 ? ((stat.wins / totalGames) * 100).toFixed(1) : "0.0"
          const winRateNum = totalGames > 0 ? (stat.wins / totalGames) * 100 : 0
          const lastPlayed = getRelativeTime(stat.last_match_date_time)
          const isHighWinRate = winRateNum >= 55 && totalGames > 7

          return (
            <div
              key={stat.id}
              className="flex items-center justify-between text-base"
            >
              <div className="flex flex-col">
                <span
                  className={
                    isHighWinRate
                      ? "text-green-300 font-bold"
                      : "text-slate-300"
                  }
                >
                  {getHero(stat.hero_id)}
                </span>
                <span className="text-slate-500 text-sm">{lastPlayed}</span>
              </div>
              <span
                className={
                  isHighWinRate ? "text-green-300 font-bold" : "text-slate-400"
                }
              >
                {stat.wins}-{stat.losses}{" "}
                <span
                  className={
                    isHighWinRate ? "text-green-400" : "text-slate-500"
                  }
                >
                  ({winRate}%)
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const PlayerPubMatchStats = ({
  playerId,
  playerRole,
  matchesData,
}: PlayerPubMatchStatsProps) => {
  const { data, isLoading, error, refetch } = useGetPlayerPubMatchesQuery({
    playerId,
  })
  const [fetchPlayerPubMatches, { isLoading: isFetching }] =
    useFetchPlayerPubMatchesMutation()

  const handleRefresh = async () => {
    try {
      const positions = roleToPositions(playerRole)
      await fetchPlayerPubMatches({
        playerId,
        positions: positions.length > 0 ? positions : undefined,
      }).unwrap()
      refetch()
    } catch (err) {
      console.error("Failed to fetch player pub matches:", err)
    }
  }

  // Get league match heroes if matchesData is provided
  const leagueHeroStats = matchesData
    ? aggregatePlayerLeagueHeroes(matchesData.matches, playerId)
    : []

  // Convert league hero stats to match the PlayerPubMatchStatsRow format for HeroStatsDisplay
  const leagueHeroStatsForDisplay: PlayerPubMatchStatsRow[] =
    leagueHeroStats.map((stat, index) => ({
      id: index,
      player_id: playerId,
      hero_id: stat.heroId,
      wins: stat.wins,
      losses: stat.losses,
      last_match_date_time: new Date(stat.lastPlayed).toISOString(),
      type: "TOP_10_HEROES_OVERALL" as const,
      created_at: "",
    }))

  return (
    <div className="bg-slate-800/30 border-t border-slate-700 p-6">
      {isLoading ? (
        <div className="text-center py-12">
          <div className="text-slate-400">Loading stats...</div>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <div className="text-red-400 mb-4">Error loading stats</div>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors"
          >
            Fetch Stats
          </button>
        </div>
      ) : !data?.data ? (
        <div className="text-center py-12">
          <div className="text-slate-400 mb-4">No stats available</div>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors"
          >
            Fetch Stats
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <HeroStatsDisplay
            title="League Match Heroes"
            stats={leagueHeroStatsForDisplay}
            emptyMessage="No league matches found"
            filterLeastPlayedHeroes={false}
          />
          <HeroStatsDisplay
            title="Recent Matches (Last 3 Months)"
            stats={data.data.recentMatches}
            emptyMessage="No recent matches found"
            filterLeastPlayedHeroes={true}
          />
          <HeroStatsDisplay
            title="Top 10 Heroes by Position"
            stats={data.data.topHeroesByPosition}
            emptyMessage="No position data available"
            filterLeastPlayedHeroes={true}
          />
          <HeroStatsDisplay
            title="Top 10 Heroes Overall"
            stats={data.data.topHeroesOverall}
            emptyMessage="No overall stats available"
            filterLeastPlayedHeroes={true}
          />
        </div>
      )}
    </div>
  )
}
