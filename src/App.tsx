import { useState } from "react";
import { LeagueAndTeamHeader } from "./features/league-and-team-picker/league-and-team-header"
import { Matches } from "./features/matches/matches";
import { AggregateBansAgainst } from "./features/matches/aggregate-bans-against";
import { AggregateHeroesPlayedByPosition } from "./features/matches/aggregate-heroes-played-by-position";

export const App = () => {
  const [teamId, setTeamId] = useState<number>();
  const [leagueId, setLeagueId] = useState<number>();

  return (
    <div className="App min-h-screen">
      <LeagueAndTeamHeader
        leagueId={leagueId}
        setLeagueId={setLeagueId}
        teamId={teamId}
        setTeamId={setTeamId}
      />
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr_1fr] gap-6">
          {leagueId && teamId && <Matches leagueId={leagueId} teamId={teamId} />}
          {leagueId && teamId && <AggregateBansAgainst leagueId={leagueId} teamId={teamId} />}
          {leagueId && teamId && <AggregateHeroesPlayedByPosition leagueId={leagueId} teamId={teamId} />}
        </div>
      </div>
    </div>
  )
}
