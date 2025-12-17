import { useGetLeaguesQuery } from "./league-api";
import { useLazyGetTeamsByLeagueQuery } from "./teams-api";

type LeagueAndTeamHeaderProps = {
  leagueId: number | undefined;
  setLeagueId: (leagueId: number) => void;
  teamId: number | undefined;
  setTeamId: (teamId: number) => void;
  loadMatches: ({leagueId, teamId}: {leagueId: number; teamId: number}) => void;
}

export const LeagueAndTeamHeader = ({leagueId, setLeagueId, teamId, setTeamId, loadMatches}: LeagueAndTeamHeaderProps) => {
  const leaguesResult = useGetLeaguesQuery();
  const { data: leagues, isLoading: isLoadingLeagues, isError: isErrorLeagues } = leaguesResult;
  const [triggerTeams, { data: teams, isLoading: isLoadingTeams, isError: isErrorTeams }] = useLazyGetTeamsByLeagueQuery();

  if (isLoadingLeagues) {
    return <div>Loading...</div>;
  }
  if (isErrorLeagues) {
    return <div>Please try again: {JSON.stringify(leaguesResult.error, null, 2)}</div>;
  }
  if (!leagues) {
    return <div>No leagues found</div>;
  }

  return (
    <div>
      <select value={leagueId} onChange={(e) => {
        const selectedLeagueId = parseInt(e.target.value, 10);
        setLeagueId(selectedLeagueId);
        void triggerTeams({ leagueId: selectedLeagueId });
      }}>
        <option value="">-- Select a league --</option>
        {leagues.map(league => <option key={league.id} value={league.id}>{league.name}</option>)}
      </select>
      {isLoadingTeams && <div>Loading teams...</div>}
      {isErrorTeams && <div>Error: Please try again</div>}
      {teams && leagueId && <select value={teamId} onChange={(e) => {setTeamId(parseInt(e.target.value, 10))}}>
      <option value="">-- Select a team --</option>
        {Object.entries(teams[leagueId]).map(([teamId, teamName]) =>
          <option key={teamId} value={teamId}>{teamName}</option>
        )}
      </select>}
      <button
        className="bg-blue-500 text-white p-2 rounded-md"
        disabled={!leagueId || !teamId}
        onClick={() => {
          if (leagueId && teamId) {
            loadMatches({ leagueId, teamId });
          }
        }}
      >
        Search
      </button>
    </div>
  )
}
