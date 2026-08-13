import { AggregateBansAgainst } from "../features/matches/aggregate-bans-against"
import { AggregateBansFor } from "../features/matches/aggregate-bans-for"
import { AggregateContestRate } from "../features/matches/aggregate-contest-rate"
import { AggregateHeroesPlayedByPosition } from "../features/matches/aggregate-heroes-played-by-position"
import { Lanes } from "../features/lanes/Lanes"
import { Matches } from "../features/matches/matches"
import { Movement } from "../features/movement/Movement"
import { Players } from "../features/players/players"
import { PlayerStats } from "../features/player-stats/PlayerStats"
import { Tempo } from "../features/tempo/Tempo"
import { Wards } from "../features/wards/Wards"
import { useTeamScope } from "./routing"

export const TeamTab = () => {
  const { leagueId, teamId } = useTeamScope()

  /*
   * Four columns, then two, then one — and in one column the match list goes
   * last.
   *
   * Side by side, the layout is doing the summarising for you: the bans and the
   * heroes-by-position sit next to the games they were drawn from, and your eye
   * joins them. Stacking destroys that, and with the match list first it also
   * buries every aggregate on the tab under a few thousand pixels of raw games.
   * Ordering is the only replacement available in one column.
   *
   * `order` rather than moving the JSX, so `xl` renders in exactly the sequence
   * it always did.
   */
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[2.25fr_1fr_1fr_1fr] gap-4 sm:gap-6">
      {/* Wrapped so the order can be set on the grid item without `Matches`
          needing to know it is in a grid. */}
      <div className="max-md:order-last">
        <Matches leagueId={leagueId} teamId={teamId} />
      </div>
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

export const MovementTab = () => {
  const { leagueId, teamId } = useTeamScope()
  return <Movement leagueId={leagueId} teamId={teamId} />
}

export const TempoTab = () => {
  const { leagueId, teamId } = useTeamScope()
  return <Tempo leagueId={leagueId} teamId={teamId} />
}
