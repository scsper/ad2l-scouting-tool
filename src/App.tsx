import { useState } from "react";
import { LeagueAndTeamHeader } from "./features/league-and-team-picker/league-and-team-header"
import { Matches } from "./features/matches/matches";

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
      {leagueId && teamId && <Matches leagueId={leagueId} teamId={teamId} />}
    </div>
  )
}
