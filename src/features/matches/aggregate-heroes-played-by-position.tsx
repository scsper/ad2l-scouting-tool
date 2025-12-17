import { useGetMatchesQuery } from "./matches-api";
import { getHero } from "../../utils/get-hero";

export const AggregateHeroesPlayedByPosition = ({leagueId, teamId}: {leagueId: number; teamId: number}) => {
  const { data: matchesData, isLoading: isLoadingMatches, isError: isErrorMatches } = useGetMatchesQuery({ leagueId, teamId })

  if (isLoadingMatches) {
    return <div>Loading...</div>
  }

  if (isErrorMatches) {
    return <div>Error: Please try again</div>
  }

  if (!matchesData) {
    return <div>No matches found</div>
  }

  return (
    <div className="px-4">
      <h2 className="text-xl font-bold">Aggregated Heroes Played By Position</h2>
      <div>
        <HeroList position="Carry" heroes={matchesData.aggregate.heroesPlayedByPosition.POSITION_1} />
        <HeroList position="Mid" heroes={matchesData.aggregate.heroesPlayedByPosition.POSITION_2} />
        <HeroList position="Offlane" heroes={matchesData.aggregate.heroesPlayedByPosition.POSITION_3} />
        <HeroList position="Soft Support" heroes={matchesData.aggregate.heroesPlayedByPosition.POSITION_4} />
        <HeroList position="Hard Support" heroes={matchesData.aggregate.heroesPlayedByPosition.POSITION_5} />
        <HeroList position="Uncategorized" heroes={matchesData.aggregate.heroesPlayedByPosition.UNCATEGORIZED} />
      </div>
    </div>
  )
}

const HeroList = ({heroes, position}: {heroes: Record<string, number>; position: string}) => {
  return (
    <div>
      <h4 className="text-lg font-bold">{position}</h4>
      <ul>
        {Object.entries(heroes).sort((a, b) => b[1] - a[1]).map(([heroId, count]) => (
          <li key={heroId}>{getHero(heroId)} ({count})</li>
        ))}
      </ul>
    </div>
  )
}
