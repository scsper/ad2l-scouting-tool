import { getHero } from "../../utils/get-hero"
import { aggregatePlayerLeagueHeroes } from "./player-league-heroes-utils"
import type { TransformedMatchesApiResponse } from "../matches/matches-api"

type PlayerLeagueHeroesProps = {
  playerId: number
  matchesData: TransformedMatchesApiResponse | undefined
}

export const PlayerLeagueHeroes = ({
  playerId,
  matchesData,
}: PlayerLeagueHeroesProps) => {
  if (!matchesData) {
    return (
      <div className="bg-slate-800/30 border-t border-slate-700 p-6">
        <div className="text-center py-12">
          <div className="text-slate-400">Loading league matches...</div>
        </div>
      </div>
    )
  }

  const heroStats = aggregatePlayerLeagueHeroes(matchesData.matches, playerId)
  console.log(heroStats, playerId)

  if (heroStats.length === 0) {
    return (
      <div className="bg-slate-800/30 border-t border-slate-700 p-6">
        <h3 className="text-lg font-medium text-slate-300 mb-4">
          League Match Heroes
        </h3>
        <div className="text-center py-12">
          <div className="text-slate-400">No league matches found</div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/30 border-t border-slate-700 p-6">
      <h3 className="text-lg font-medium text-slate-300 mb-4">
        League Match Heroes
      </h3>
      <div className="space-y-3">
        {heroStats.map(stat => {
          const winRate = ((stat.wins / stat.games) * 100).toFixed(1)
          const winRateNum = (stat.wins / stat.games) * 100
          const isHighWinRate = winRateNum >= 55 && stat.games > 3
          const avgKDA =
            stat.totalDeaths > 0
              ? (
                  (stat.totalKills + stat.totalAssists) /
                  stat.totalDeaths
                ).toFixed(2)
              : "Perfect"

          return (
            <div
              key={stat.heroId}
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
                  {getHero(stat.heroId)}
                </span>
                <span className="text-slate-500 text-sm">
                  {stat.games} game{stat.games !== 1 ? "s" : ""} · Avg KDA:{" "}
                  {avgKDA}
                </span>
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
