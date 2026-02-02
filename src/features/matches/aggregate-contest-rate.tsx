import { useGetMatchesQuery } from "./matches-api";
import { getHero } from "../../utils/get-hero";

export const AggregateContestRate = ({leagueId, teamId}: {leagueId: number; teamId: number}) => {
  const { data: matchesData, isLoading: isLoadingMatches, isFetching: isFetchingMatches, isError: isErrorMatches } = useGetMatchesQuery({ leagueId, teamId })

  if (isLoadingMatches || isFetchingMatches) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-6">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-500"></div>
          <span className="text-slate-400">Loading...</span>
        </div>
      </div>
    );
  }

  if (isErrorMatches) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-red-500/30 shadow-lg p-6">
        <div className="text-red-400">Error: Please try again</div>
      </div>
    );
  }

  if (!matchesData) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-6">
        <div className="text-slate-400">No matches found</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-6 hover:border-slate-600 transition-all h-fit">
      <h2 className="text-xl font-bold mb-4 pb-3 border-b border-slate-700 bg-linear-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
        Contest Rate
      </h2>
      <ul className="space-y-2">
        {Object.entries(matchesData.aggregate.contestRate).sort((a, b) => b[1].count - a[1].count).map(([heroId, stats]) => (
          <li key={heroId} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-all">
            <span className="font-medium text-slate-200">{getHero(heroId)}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{stats.picks}P / {stats.bans}B</span>
              <span className="text-xs px-2.5 py-1 bg-orange-500/20 text-orange-300 rounded-full border border-orange-500/30 font-semibold">
                {stats.count}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
