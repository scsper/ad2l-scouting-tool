import { useGetLeagueAggregateQuery } from "./league-aggregate-api";
import { getHero } from "../../utils/get-hero";

const TOP_N = 20;
const TOP_PER_POSITION = 15;

const POSITIONS = [
  { key: "POSITION_1", label: "Carry" },
  { key: "POSITION_2", label: "Mid" },
  { key: "POSITION_3", label: "Offlane" },
  { key: "POSITION_4", label: "Soft Support" },
  { key: "POSITION_5", label: "Hard Support" },
];

function winPctColor(pct: number) {
  if (pct >= 60) return "text-green-400";
  if (pct <= 40) return "text-red-400";
  return "text-slate-300";
}

function HeroList({
  entries,
  countLabel,
  winPctLabel,
  accentClass,
  badgeBg,
}: {
  entries: [string, number, number | null][];
  countLabel: string;
  winPctLabel: string;
  accentClass: string;
  badgeBg: string;
}) {
  return (
    <ul className="space-y-1.5">
      <li className="flex items-center justify-between px-3 py-1 text-xs text-slate-500 font-medium">
        <span>Hero</span>
        <div className="flex items-center gap-4">
          <span className="w-16 text-right">{winPctLabel}</span>
          <span className="w-8 text-right">{countLabel}</span>
        </div>
      </li>
      {entries.map(([heroId, count, pct]) => (
        <li
          key={heroId}
          className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-all"
        >
          <span className="font-medium text-slate-200 text-sm">{getHero(heroId)}</span>
          <div className="flex items-center gap-4">
            <span className={`text-xs w-16 text-right font-semibold ${pct !== null ? winPctColor(pct) : "text-slate-500"}`}>
              {pct !== null ? `${pct.toFixed(0)}%` : "—"}
            </span>
            <span className={`text-xs px-2.5 py-1 ${badgeBg} ${accentClass} rounded-full border font-semibold w-8 text-center`}>
              {count}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export const LeagueAggregate = ({ leagueId }: { leagueId: number }) => {
  const { data, isLoading, isError } = useGetLeagueAggregateQuery({ leagueId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 h-48 text-slate-400">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400"></div>
        <span>Loading league data...</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-48 text-red-400">
        Failed to load league data. Please try again.
      </div>
    );
  }

  const topPicks = Object.entries(data.heroDraftStats)
    .sort((a, b) => b[1].picks - a[1].picks)
    .slice(0, TOP_N)
    .map(([id, s]) => [id, s.picks, s.picks > 0 ? (s.wins / s.picks) * 100 : null] as [string, number, number | null]);

  const topBans = Object.entries(data.heroDraftStats)
    .sort((a, b) => b[1].bans - a[1].bans)
    .slice(0, TOP_N)
    .map(([id, s]) => [id, s.bans, null] as [string, number, null]);

  const topContested = Object.entries(data.heroDraftStats)
    .sort((a, b) => (b[1].picks + b[1].bans) - (a[1].picks + a[1].bans))
    .slice(0, TOP_N)
    .map(([id, s]) => [id, s.picks + s.bans, s.picks > 0 ? s.wins / s.picks * 100 : null] as [string, number, number | null]);

  const positionCards = POSITIONS.map(({ key, label }) => {
    const posMap = data.picksByPosition[key] ?? {};
    const entries = Object.entries(posMap)
      .sort((a, b) => b[1].picks - a[1].picks)
      .slice(0, TOP_PER_POSITION);
    return { key, label, entries };
  });

  return (
    <div className="space-y-6">
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
      {positionCards.map(({ key, label, entries }) => (
        <div key={key} className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-4 hover:border-slate-600 transition-all h-fit">
          <h2 className="text-base font-bold mb-3 pb-2 border-b border-slate-700 text-slate-200">
            {label}
          </h2>
          <ul className="space-y-1">
            {entries.length === 0 && (
              <li className="text-slate-500 text-xs text-center py-4">No data</li>
            )}
            {entries.map(([heroId, stats]) => {
              const winPct = stats.picks > 0 ? (stats.wins / stats.picks) * 100 : null;
              return (
                <li key={heroId} className="flex items-center justify-between py-1.5 px-2 rounded bg-slate-700/30 hover:bg-slate-700/50 transition-all">
                  <span className="text-xs text-slate-200 truncate mr-2">{getHero(heroId)}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {winPct !== null && (
                      <span className={`text-xs font-semibold ${winPctColor(winPct)}`}>{winPct.toFixed(0)}%</span>
                    )}
                    <span className="text-xs px-1.5 py-0.5 bg-slate-600/50 text-slate-300 rounded font-semibold">{stats.picks}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-6 hover:border-slate-600 transition-all h-fit">
        <h2 className="text-xl font-bold mb-4 pb-3 border-b border-slate-700 bg-linear-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
          Most Picked
        </h2>
        <HeroList
          entries={topPicks}
          countLabel="Picks"
          winPctLabel="Win%"
          accentClass="text-blue-300 border-blue-500/30"
          badgeBg="bg-blue-500/20"
        />
      </div>

      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-6 hover:border-slate-600 transition-all h-fit">
        <h2 className="text-xl font-bold mb-4 pb-3 border-b border-slate-700 bg-linear-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Most Banned
        </h2>
        <HeroList
          entries={topBans}
          countLabel="Bans"
          winPctLabel="Ban Win%"
          accentClass="text-purple-300 border-purple-500/30"
          badgeBg="bg-purple-500/20"
        />
      </div>

      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-6 hover:border-slate-600 transition-all h-fit">
        <h2 className="text-xl font-bold mb-4 pb-3 border-b border-slate-700 bg-linear-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
          Most Contested
        </h2>
        <HeroList
          entries={topContested}
          countLabel="Total"
          winPctLabel="Pick Win%"
          accentClass="text-orange-300 border-orange-500/30"
          badgeBg="bg-orange-500/20"
        />
      </div>
    </div>
    </div>
  );
};
