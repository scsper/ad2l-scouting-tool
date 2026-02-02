import { useState } from "react";
import { useGetMatchesQuery } from "./matches-api";
import { useGetTeamsByLeagueQuery } from "../league-and-team-picker/teams-api";
import { getHero } from "../../utils/get-hero";

export const AggregateContestRate = ({leagueId, teamId}: {leagueId: number; teamId: number}) => {
  const { data: matchesData, isLoading: isLoadingMatches, isFetching: isFetchingMatches, isError: isErrorMatches } = useGetMatchesQuery({ leagueId, teamId })
  const { data: teamsData, isLoading: isLoadingTeams, isError: isErrorTeams } = useGetTeamsByLeagueQuery({ leagueId })
  const [expandedHeroes, setExpandedHeroes] = useState<Set<string>>(new Set());

  const toggleHero = (heroId: string) => {
    setExpandedHeroes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(heroId)) {
        newSet.delete(heroId);
      } else {
        newSet.add(heroId);
      }
      return newSet;
    });
  };

  if (isLoadingMatches || isFetchingMatches || isLoadingTeams) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-6">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-500"></div>
          <span className="text-slate-400">Loading...</span>
        </div>
      </div>
    );
  }

  if (isErrorMatches || isErrorTeams) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-red-500/30 shadow-lg p-6">
        <div className="text-red-400">Error: Please try again</div>
      </div>
    );
  }

  if (!matchesData || !teamsData) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-6">
        <div className="text-slate-400">No matches found</div>
      </div>
    );
  }

  const teamName = teamsData[leagueId][teamId] ?? "Unknown Team";

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-6 hover:border-slate-600 transition-all h-fit">
      <h2 className="text-xl font-bold mb-4 pb-3 border-b border-slate-700 bg-linear-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
        Contest Rate
      </h2>
      <ul className="space-y-2">
        {Object.entries(matchesData.aggregate.contestRate).sort((a, b) => b[1].count - a[1].count).map(([heroId, stats]) => {
          const isExpanded = expandedHeroes.has(heroId);
          return (
            <li key={heroId} className="rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-all overflow-hidden">
              <button
                onClick={() => {
                  toggleHero(heroId);
                }}
                className="w-full flex items-center justify-between py-2 px-3 cursor-pointer text-left"
              >
                <div className="flex items-center gap-2">
                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="font-medium text-slate-200">{getHero(heroId)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{stats.picks}P / {stats.bans}B</span>
                  <span className="text-xs px-2.5 py-1 bg-orange-500/20 text-orange-300 rounded-full border border-orange-500/30 font-semibold">
                    {stats.count}
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 pt-1 space-y-2 border-t border-slate-600/50 mt-1">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-800/50 rounded p-2">
                      <div className="text-slate-400 mb-1 font-medium truncate" title={teamName}>{teamName}</div>
                      <div className="text-slate-300">
                        <p className="text-green-400">{stats.breakdown.scoutedTeamPicks} picks</p>
                        {stats.breakdown.scoutedTeamBans > 0 && (
                          <p className="text-red-400">{stats.breakdown.scoutedTeamBans} bans</p>
                        )}
                      </div>
                    </div>
                    <div className="bg-slate-800/50 rounded p-2">
                      <div className="text-slate-400 mb-1 font-medium">Opponents</div>
                      <div className="text-slate-300">
                        <p className="text-green-400">{stats.breakdown.opponentPicks} picks</p>
                        {stats.breakdown.opponentBans > 0 && (
                          <p className="text-red-400">{stats.breakdown.opponentBans} bans</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  )
}
