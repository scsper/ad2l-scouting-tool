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
   * Four columns at `xl`, and below it the match list takes the full width with
   * every aggregate underneath it.
   *
   * A match card carries its own four-column layout — two rosters and two ban
   * lists — which only fits when it has the wide `2.25fr` column `xl` gives it.
   * Put that card in half of a two-column grid and it does not reflow, it
   * clips: the opponent's name truncates and both ban lists run off the card's
   * right edge.
   *
   * So the aggregates get the two-column treatment below `xl` and the match
   * list spans them. That does bury the summaries under the raw games on a
   * phone, which ordering was previously being used to avoid — the match list
   * collapsing to three with a "show all" is what keeps them reachable.
   */
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[2.25fr_1fr_1fr_1fr] gap-4 sm:gap-6">
      {/* Wrapped so the span can be set on the grid item without `Matches`
          needing to know it is in a grid. */}
      <div className="md:col-span-2 xl:col-span-1">
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
