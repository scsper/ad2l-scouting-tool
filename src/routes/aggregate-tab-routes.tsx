import { DivisionPlayers } from "../features/division-players/DivisionPlayers"
import { LeagueAggregate } from "../features/league-aggregate/LeagueAggregate"
import { useAggregateScope } from "./routing"

export const HeroesTab = () => {
  const { leagueId, division, hasDivisions } = useAggregateScope()
  return (
    <LeagueAggregate
      leagueId={leagueId}
      division={division}
      hasDivisions={hasDivisions}
    />
  )
}

export const DivisionPlayersTab = () => {
  const { leagueId, division, hasDivisions } = useAggregateScope()
  return (
    <DivisionPlayers
      leagueId={leagueId}
      division={division}
      hasDivisions={hasDivisions}
    />
  )
}
