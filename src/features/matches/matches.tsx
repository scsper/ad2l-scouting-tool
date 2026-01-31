import { useGetMatchesQuery } from "./matches-api";
import { useGetTeamsByLeagueQuery } from "../league-and-team-picker/teams-api";
import { getHero } from "../../utils/get-hero";

export const Matches = ({leagueId, teamId}: {leagueId: number; teamId: number}) => {
  const { data: matchesData, isLoading: isLoadingMatches, isFetching: isFetchingMatches, isError: isErrorMatches } = useGetMatchesQuery({ leagueId, teamId })
  const { data: teamsData, isLoading: isLoadingTeams, isError: isErrorTeams } = useGetTeamsByLeagueQuery({ leagueId })

  if (isLoadingMatches || isLoadingTeams || isFetchingMatches) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-6">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
          <span className="text-slate-400">Loading matches...</span>
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

  return (
    <div className="space-y-4">
      {matchesData && teamsData && (
          <div className="space-y-4">
            {matchesData.matches.map((match) => {
              const scoutedTeam = match.players.filter(player => player.team_id === teamId);
              const otherTeam = match.players.filter(player => player.team_id !== teamId);

              const scoutedTeamId = scoutedTeam[0]?.team_id;
              const otherTeamId = otherTeam[0]?.team_id;

              const scoutedTeamName = scoutedTeamId ? teamsData[leagueId][scoutedTeamId] : "Unknown Team";
              const otherTeamName = otherTeamId ? teamsData[leagueId][otherTeamId] : "Unknown Team";

              const otherTeamBans = match.draft.filter(pickBan => pickBan.team_id !== teamId && !pickBan.is_pick);
              const matchDate = new Date(match.start_date_time * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

              const scoutedTeamWon = match.winning_team_id === scoutedTeamId;
              const otherTeamWon = match.winning_team_id === otherTeamId;

              return (
                <div key={match.id} className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg overflow-hidden hover:border-slate-600 transition-all">
                  <div className="bg-slate-700/30 px-4 py-2 border-b border-slate-700 flex justify-between items-center">
                    <p className="text-sm text-slate-400 font-medium">{matchDate}</p>
                    <a
                      href={`https://www.dotabuff.com/matches/${match.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium flex items-center gap-1"
                    >
                      <span>Dotabuff</span>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                  <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <h3 className="text-base font-bold flex items-center gap-2 pb-2 border-b border-slate-700">
                        <span className="truncate" title={scoutedTeamName}>{scoutedTeamName}</span>
                        {scoutedTeamWon && <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded-full border border-green-500/30 flex-shrink-0">✓ W</span>}
                        {otherTeamWon && <span className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded-full border border-red-500/30 flex-shrink-0">✗ L</span>}
                      </h3>
                      <ul className="space-y-1">
                          {scoutedTeam.slice().sort((a,b) => {
                            const posA = a.position ?? "UNCATEGORIZED";
                            const posB = b.position ?? "UNCATEGORIZED";
                            return posA > posB ? 1 : -1;
                          }).map(player => (
                            <li key={player.player_id} className="text-sm text-slate-300 hover:text-slate-100 transition-colors">
                              <span className="font-medium">{getHero(player.hero_id)}</span>
                              <span className="text-slate-500 ml-2">({player.kills}/{player.deaths}/{player.assists})</span>
                            </li>
                          ))}
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-base font-bold flex items-center gap-2 pb-2 border-b border-slate-700">
                        <span className="truncate" title={otherTeamName}>{otherTeamName}</span>
                        {otherTeamWon && <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded-full border border-green-500/30 flex-shrink-0">✓ W</span>}
                        {scoutedTeamWon && <span className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded-full border border-red-500/30 flex-shrink-0">✗ L</span>}
                      </h3>
                      <ul className="space-y-1">
                        {otherTeam.slice().sort((a,b) => {
                            const posA = a.position ?? "UNCATEGORIZED";
                            const posB = b.position ?? "UNCATEGORIZED";
                            return posA > posB ? 1 : -1;
                          }).map(player => (
                            <li key={player.player_id} className="text-sm text-slate-300 hover:text-slate-100 transition-colors">
                              <span className="font-medium">{getHero(player.hero_id)}</span>
                              <span className="text-slate-500 ml-2">({player.kills}/{player.deaths}/{player.assists})</span>
                            </li>
                          ))}
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-base font-bold pb-2 border-b border-slate-700">Bans Against</h3>
                      <ul className="space-y-1">
                          {otherTeamBans.map(ban => (
                            <li key={ban.hero_id} className="text-sm text-slate-300 hover:text-slate-100 transition-colors">
                              {getHero(ban.hero_id)}
                            </li>
                          ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )
            })}
      </div>
      )}
    </div>
  )
}
