import { useEffect } from "react";
import { useGetLeaguesQuery } from "./league-api";
import { useLazyGetTeamsByLeagueQuery } from "./teams-api";

type LeagueAndTeamHeaderProps = {
  leagueId: number | undefined;
  setLeagueId: (leagueId: number) => void;
  teamId: number | undefined;
  setTeamId: (teamId: number) => void;
}

export const LeagueAndTeamHeader = ({leagueId, setLeagueId, teamId, setTeamId}: LeagueAndTeamHeaderProps) => {
  const leaguesResult = useGetLeaguesQuery();
  const { data: leagues, isLoading: isLoadingLeagues, isError: isErrorLeagues } = leaguesResult;
  const [triggerTeams, { data: teams, isLoading: isLoadingTeams, isError: isErrorTeams }] = useLazyGetTeamsByLeagueQuery();

  // Automatically load teams when leagueId is set (including on initial mount)
  useEffect(() => {
    if (leagueId) {
      void triggerTeams({ leagueId });
    }
  }, [leagueId, triggerTeams]);

  if (isLoadingLeagues) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
            <span className="text-slate-400">Loading leagues...</span>
          </div>
        </div>
      </div>
    );
  }
  if (isErrorLeagues) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm border-b border-red-500/30 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="text-red-400">
            Please try again: {JSON.stringify(leaguesResult.error, null, 2)}
          </div>
        </div>
      </div>
    );
  }
  if (!leagues) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="text-slate-400">No leagues found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 shadow-lg sticky top-0 z-10">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <h1 className="text-2xl font-bold bg-linear-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            AD2L Scouting Tool
          </h1>
          <div className="flex flex-col sm:flex-row gap-3 flex-1">
            <div className="flex-1">
              <select 
                value={leagueId} 
                onChange={(e) => {
                  const selectedLeagueId = parseInt(e.target.value, 10);
                  setLeagueId(selectedLeagueId);
                  void triggerTeams({ leagueId: selectedLeagueId });
                }}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:bg-slate-600"
              >
                <option value="">-- Select a league --</option>
                {leagues.map(league => <option key={league.id} value={league.id}>{league.name}</option>)}
              </select>
            </div>
            {isLoadingTeams && <div className="text-slate-400 py-2">Loading teams...</div>}
            {isErrorTeams && <div className="text-red-400 py-2">Error: Please try again</div>}
            {teams && leagueId && (
              <div className="flex-1">
                <select 
                  value={teamId} 
                  onChange={(e) => {setTeamId(parseInt(e.target.value, 10))}}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:bg-slate-600"
                >
                  <option value="">-- Select a team --</option>
                  {Object.entries(teams[leagueId]).map(([teamId, teamName]) =>
                    <option key={teamId} value={teamId}>{teamName}</option>
                  )}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
