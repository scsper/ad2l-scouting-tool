import { useGetMatchesQuery, type HeroStats } from "./matches-api";
import { getHero } from "../../utils/get-hero";

export const AggregateHeroesPlayedByPosition = ({leagueId, teamId}: {leagueId: number; teamId: number}) => {
  const { data: matchesData, isLoading: isLoadingMatches, isFetching: isFetchingMatches, isError: isErrorMatches } = useGetMatchesQuery({ leagueId, teamId })

  if (isLoadingMatches || isFetchingMatches) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-6">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-cyan-500"></div>
          <span className="text-slate-400">Loading...</span>
        </div>
      </div>
    );
  }

  if (isErrorMatches) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-red-500/30 shadow-lg p-6">
        <div className="text-red-400">Error: Please try again</div>
      </div>
    );
  }

  if (!matchesData) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-6">
        <div className="text-slate-400">No matches found</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-6 hover:border-slate-600 transition-all h-fit">
      <h2 className="text-xl font-bold mb-4 pb-3 border-b border-slate-700 bg-linear-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
        Heroes Played
      </h2>
      <div className="space-y-5">
        <HeroList position="Carry" heroes={matchesData.aggregate.heroesPlayedByPosition.POSITION_1} color="red" />
        <HeroList position="Mid" heroes={matchesData.aggregate.heroesPlayedByPosition.POSITION_2} color="yellow" />
        <HeroList position="Offlane" heroes={matchesData.aggregate.heroesPlayedByPosition.POSITION_3} color="cyan" />
        <HeroList position="Soft Support" heroes={matchesData.aggregate.heroesPlayedByPosition.POSITION_4} color="green" />
        <HeroList position="Hard Support" heroes={matchesData.aggregate.heroesPlayedByPosition.POSITION_5} color="blue" />
        {Object.keys(matchesData.aggregate.heroesPlayedByPosition.UNCATEGORIZED).length > 0 && (
          <HeroList position="Uncategorized" heroes={matchesData.aggregate.heroesPlayedByPosition.UNCATEGORIZED} color="gray" />
        )}
      </div>
    </div>
  )
}

const HeroList = ({heroes, position, color}: {heroes: Record<string, HeroStats>; position: string; color: string}) => {
  const colorClasses = {
    red: "from-red-500/20 to-red-600/20 border-red-500/30 text-red-300",
    yellow: "from-yellow-500/20 to-yellow-600/20 border-yellow-500/30 text-yellow-300",
    cyan: "from-cyan-500/20 to-cyan-600/20 border-cyan-500/30 text-cyan-300",
    green: "from-green-500/20 to-green-600/20 border-green-500/30 text-green-300",
    blue: "from-blue-500/20 to-blue-600/20 border-blue-500/30 text-blue-300",
    gray: "from-gray-500/20 to-gray-600/20 border-gray-500/30 text-gray-300",
  };

  const badgeClasses = {
    red: "bg-red-500/20 text-red-300 border-red-500/30",
    yellow: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    cyan: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    green: "bg-green-500/20 text-green-300 border-green-500/30",
    blue: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    gray: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  };

  const sortedHeroIds = Object.keys(heroes).sort((a, b) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-member-access
    return heroes[b]!.games - heroes[a]!.games;
  });

  return (
    <div>
      <h4 className={`text-sm font-bold mb-2 px-3 py-1.5 rounded-lg bg-linear-to-r ${colorClasses[color as keyof typeof colorClasses]} border inline-block`}>
        {position}
      </h4>
      <ul className="space-y-1.5 mt-2">
        {sortedHeroIds.map((heroId) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-assignment
          const stats = heroes[heroId]!;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const { wins, losses, games } = stats;
          return (
            <li key={heroId} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-slate-700/20 hover:bg-slate-700/40 transition-all">
              <span className="text-sm font-medium text-slate-200">{getHero(heroId)}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">
                  {wins}-{losses}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${badgeClasses[color as keyof typeof badgeClasses]}`}>
                  {games}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  )
}
