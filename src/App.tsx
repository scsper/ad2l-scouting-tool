import { useState } from "react";
import { useLazyGetMatchesQuery } from "./features/matches/matches-api"
import { getHero } from "./utils/get-hero"
import { useGetLeaguesQuery } from "./features/league/league";
import { useLazyGetTeamsByLeagueQuery } from "./features/team/teams-api";

export const App = () => {
  const leaguesResult = useGetLeaguesQuery();
  const { data: leagues, isLoading: isLoadingLeagues, isError: isErrorLeagues } = leaguesResult;
  const [scoutedTeamId, setScoutedTeamId] = useState<number>();
  const [leagueId, setLeagueId] = useState<number>();

  const [triggerTeams, { data: teams, isLoading: isLoadingTeams, isError: isErrorTeams }] = useLazyGetTeamsByLeagueQuery();
  const [trigger, { data, isLoading, isError }] = useLazyGetMatchesQuery()

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
    <div className="App">
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
      {teams && leagueId && <select value={scoutedTeamId} onChange={(e) => {setScoutedTeamId(parseInt(e.target.value, 10))}}>
      <option value="">-- Select a team --</option>
        {Object.entries(teams[leagueId]).map(([teamId, teamName]) =>
          <option key={teamId} value={teamId}>{teamName}</option>
        )}
      </select>}
      <button
        className="bg-blue-500 text-white p-2 rounded-md"
        disabled={!leagueId || !scoutedTeamId}
        onClick={() => {
          if (leagueId && scoutedTeamId) {
            void trigger({ leagueId, teamId: scoutedTeamId });
          }
        }}
      >
        Search
      </button>
      {!data && !isLoading && !isError && <div>Enter a league id and team id to search</div>}
      {isLoading && <div>Loading...</div>}
      {isError && <div>Error: Please try again</div>}
      {data?.matches.map((match) => {
        const scoutedTeam = match.players.filter(player => player.team_id === scoutedTeamId);
        const otherTeam = match.players.filter(player => player.team_id !== scoutedTeamId);

        const otherTeamBans = match.draft.filter(pickBan => pickBan.team_id !== scoutedTeamId && !pickBan.is_pick);

        return (
          <div key={match.match_id}>
            {/* <h2 className="text-xl font-bold">{scoutedTeam.id} vs {otherTeam.id}</h2> */}
            <div className="flex flex-row">
              <div className="flex flex-col pl-4">
                <h3 className="text-lg font-bold">{scoutedTeam[0].team_id}</h3>
                <ul>
                  <li>
                    {scoutedTeam.slice().sort((a,b) => {
                      const posA = a.position ?? "UNCATEGORIZED";
                      const posB = b.position ?? "UNCATEGORIZED";
                      return posA > posB ? 1 : -1;
                    }).map(player => <li key={player.player_id}>{getHero(player.hero_id)}</li>)}
                  </li>
                </ul>
              </div>

              <div className="flex flex-col pl-4">
                <h3 className="text-lg font-bold">{otherTeam[0].team_id}</h3>
                <ul>
                  <li>
                  {otherTeam.slice().sort((a,b) => {
                      const posA = a.position ?? "UNCATEGORIZED";
                      const posB = b.position ?? "UNCATEGORIZED";
                      return posA > posB ? 1 : -1;
                    }).map(player => <li key={player.player_id}>{getHero(player.hero_id)}</li>)}
                  </li>
                </ul>
              </div>

              <div className="flex flex-col pl-4">
                <h3 className="text-lg font-bold">Bans Against</h3>
                <ul>
                    {otherTeamBans.map(ban => <li key={ban.hero_id}>{getHero(ban.hero_id)}</li>)}
                </ul>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
