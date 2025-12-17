import { useState } from "react";
import { useLazyGetMatchesQuery } from "./features/matches/matches-api"
import { getHero } from "./utils/get-hero"
import { useGetLeaguesQuery } from "./features/league/league";

export const App = () => {
  const { data: leagues, isLoading: isLoadingLeagues, isError: isErrorLeagues, error: leaguesError } = useGetLeaguesQuery();
  const [scoutedTeamId, setScoutedTeamId] = useState<number>(8956164);
  const [leagueId, setLeagueId] = useState<number>(18604);
  const [trigger, { data, isLoading, isError }] = useLazyGetMatchesQuery()

  if (isLoadingLeagues) {
    return <div>Loading...</div>;
  }
  if (isErrorLeagues) {
    return <div>Please try again: {JSON.stringify(leaguesError, null, 2)}</div>;
  }
  if (!leagues) {
    return <div>No leagues found</div>;
  }

  return (
    <div className="App">
      <select value={leagueId} onChange={(e) => {setLeagueId(parseInt(e.target.value, 10))}}>
        {leagues.map(league => <option key={league.id} value={league.id}>{league.name}</option>)}
      </select>
      <input type="text" placeholder="Enter the team id" value={scoutedTeamId} onChange={(e) => {setScoutedTeamId(parseInt(e.target.value, 10))}} />
      <button className="bg-blue-500 text-white p-2 rounded-md" onClick={() => void trigger({ leagueId, teamId: scoutedTeamId })}>Search</button>
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
