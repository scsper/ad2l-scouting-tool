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
        <h3 className="text-lg font-bold">Carry</h3>
        <HeroList heroes={matchesData.aggregate.heroesPlayedByPosition.POSITION_1} />
        <h3 className="text-lg font-bold">Mid</h3>
        <HeroList heroes={matchesData.aggregate.heroesPlayedByPosition.POSITION_2} />
        <h3 className="text-lg font-bold">Offlane</h3>
        <HeroList heroes={matchesData.aggregate.heroesPlayedByPosition.POSITION_3} />
        <h3 className="text-lg font-bold">Soft Support</h3>
        <HeroList heroes={matchesData.aggregate.heroesPlayedByPosition.POSITION_4} />
        <h3 className="text-lg font-bold">Hard Support</h3>
        <HeroList heroes={matchesData.aggregate.heroesPlayedByPosition.POSITION_5} />
        <h3 className="text-lg font-bold">Uncategorized</h3>
        <HeroList heroes={matchesData.aggregate.heroesPlayedByPosition.UNCATEGORIZED} />
      </div>
    </div>
  )
}

const HeroList = ({heroes}: {heroes: Record<string, number>}) => {
  return (
    <ul>
      {Object.entries(heroes).sort((a, b) => b[1] - a[1]).map(([heroId, count]) => (
        <li key={heroId}>{getHero(heroId)} ({count})</li>
      ))}
    </ul>
  )
}
