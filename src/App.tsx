import { useState } from "react";
import { useLazyGetMatchesQuery } from "./features/matches/matches-api"

export const App = () => {
  const [scoutedTeamId, setScoutedTeamId] = useState<string>("1938666");
  const [leagueId, setLeagueId] = useState<string>("18126");
  const [trigger, { data, isLoading, isError }] = useLazyGetMatchesQuery()

  return (
    <div className="App">
      <input type="text" placeholder="Enter the league id" value={leagueId} onChange={(e) => {setLeagueId(e.target.value)}} />
      <input type="text" placeholder="Enter the team id" value={scoutedTeamId} onChange={(e) => {setScoutedTeamId(e.target.value)}} />
      <button className="bg-blue-500 text-white p-2 rounded-md" onClick={() => void trigger({ leagueId, teamId: scoutedTeamId })}>Search</button>
      {!data && !isLoading && !isError && <div>Enter a league id and team id to search</div>}
      {isLoading && <div>Loading...</div>}
      {isError && <div>Error: Please try again</div>}
      {data?.league.matches.map((match) => {
        const { winningTeamName, duration, radiant, dire } = match;
        const scoutedTeam = radiant.id === scoutedTeamId ? radiant : dire;
        const otherTeam = radiant.id === scoutedTeamId ? dire : radiant;

        return (
          <div key={match.id}>
            <h2 className="text-xl font-bold">{scoutedTeam.name} vs {otherTeam.name}</h2>
            <div className="flex flex-row">
              <div className="flex flex-col pl-4">
                <h3 className="text-lg font-bold">{scoutedTeam.name}</h3>
                <ul>
                  <li>
                    {scoutedTeam.players.slice().sort((a,b) => a.position > b.position ? 1 : -1).map(player => <li key={player.id}>{player.heroName}</li>)}
                  </li>
                </ul>
              </div>

              <div className="flex flex-col pl-4">
                <h3 className="text-lg font-bold">{otherTeam.name}</h3>
                <ul>
                  <li>
                    {otherTeam.players.slice().sort((a,b) => a.position > b.position ? 1 : -1).map(player => <li key={player.id}>{player.heroName}</li>)}
                  </li>
                </ul>
              </div>

              <div className="flex flex-col pl-4">
                <h3 className="text-lg font-bold">Bans Against</h3>
                <ul>
                    {otherTeam.bans.map(ban => <li key={ban.heroName}>{ban.heroName}</li>)}
                </ul>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
