import { AggregateBansAgainst } from "../features/matches/aggregate-bans-against"
import { AggregateBansFor } from "../features/matches/aggregate-bans-for"
import { AggregateContestRate } from "../features/matches/aggregate-contest-rate"
import { AggregateHeroesPlayedByPosition } from "../features/matches/aggregate-heroes-played-by-position"
import { Lanes } from "../features/lanes/Lanes"
import { Matches } from "../features/matches/matches"
import { Players } from "../features/players/players"
import { PlayerStats } from "../features/player-stats/PlayerStats"
import { Tempo } from "../features/tempo/Tempo"
import { Wards } from "../features/wards/Wards"
import { useTeamScope } from "./routing"

export const TeamTab = () => {
  const { leagueId, teamId } = useTeamScope()

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[2.25fr_1fr_1fr_1fr] gap-6">
      <Matches leagueId={leagueId} teamId={teamId} />
      <div className="flex flex-col gap-6">
        <AggregateBansAgainst leagueId={leagueId} teamId={teamId} />
        <AggregateBansFor leagueId={leagueId} teamId={teamId} />
      </div>
      <AggregateHeroesPlayedByPosition leagueId={leagueId} teamId={teamId} />
      <AggregateContestRate leagueId={leagueId} teamId={teamId} />
    </div>
  )
}

export const PlayersTab = () => {
  const { leagueId, teamId } = useTeamScope()
  return <PlayerStats leagueId={leagueId} teamId={teamId} />
}

export const PubStatsTab = () => {
  const { leagueId, teamId } = useTeamScope()
  return <Players leagueId={leagueId} teamId={teamId} />
}

export const LanesTab = () => {
  const { leagueId, teamId } = useTeamScope()
  return <Lanes leagueId={leagueId} teamId={teamId} />
}

export const WardsTab = () => {
  const { leagueId, teamId } = useTeamScope()
  return <Wards leagueId={leagueId} teamId={teamId} />
}

export const TempoTab = () => {
  const { leagueId, teamId } = useTeamScope()
  return <Tempo leagueId={leagueId} teamId={teamId} />
}
