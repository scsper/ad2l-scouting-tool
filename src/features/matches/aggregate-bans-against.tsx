import { useGetMatchesQuery } from "./matches-api";
import { getHero } from "../../utils/get-hero";

export const AggregateBansAgainst = ({leagueId, teamId}: {leagueId: number; teamId: number}) => {
  const { data: matchesData, isLoading: isLoadingMatches, isError: isErrorMatches } = useGetMatchesQuery({ leagueId, teamId })

  if (isLoadingMatches || isErrorMatches) {
    return <div>Loading...</div>
  }

  return (
    <div className="px-4">
      <h2 className="text-xl font-bold">Aggregated Bans Against</h2>
      <ul>
        {Object.entries(matchesData?.aggregate.bansAgainst ?? {}).sort((a, b) => b[1] - a[1]).map(([heroId, count]) => (
          <li key={heroId}>{getHero(heroId)} ({count})</li>
        ))}
      </ul>
    </div>
  )

  return <div className="px-4">AggregateBansAgainst {leagueId} {teamId}</div>
}
