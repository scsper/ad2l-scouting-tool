import { useState } from "react";
import { LeagueAndTeamHeader } from "./features/league-and-team-picker/league-and-team-header"
import { Matches } from "./features/matches/matches";
import { AggregateBansAgainst } from "./features/matches/aggregate-bans-against";
import { AggregateHeroesPlayedByPosition } from "./features/matches/aggregate-heroes-played-by-position";

export const App = () => {
  const [teamId, setTeamId] = useState<number>();
  const [leagueId, setLeagueId] = useState<number>();

  return (
    <div className="App">
      <LeagueAndTeamHeader
        leagueId={leagueId}
        setLeagueId={setLeagueId}
        teamId={teamId}
        setTeamId={setTeamId}
      />
      <div className="flex flex-row">
        {leagueId && teamId && <Matches leagueId={leagueId} teamId={teamId} />}
        {leagueId && teamId && <AggregateBansAgainst leagueId={leagueId} teamId={teamId} />}
        {leagueId && teamId && <AggregateHeroesPlayedByPosition leagueId={leagueId} teamId={teamId} />}
      </div>

    </div>
  )
}
