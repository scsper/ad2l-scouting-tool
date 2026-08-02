import { DivisionPlayers } from "../features/division-players/DivisionPlayers"
import { LeagueStats } from "../features/league-stats/LeagueStats"
import { useStatsScope } from "./routing"

export const HeroesTab = () => {
  const { leagueId, division, hasDivisions } = useStatsScope()
  return (
    <LeagueStats
      leagueId={leagueId}
      division={division}
      hasDivisions={hasDivisions}
    />
  )
}

export const DivisionPlayersTab = () => {
  const { leagueId, division, hasDivisions } = useStatsScope()
  return (
    <DivisionPlayers
      leagueId={leagueId}
      division={division}
      hasDivisions={hasDivisions}
    />
  )
}
