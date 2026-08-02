import { useMemo } from "react"
import { useGetTeamsByLeagueQuery } from "../league-and-team-picker/teams-api"
import { useGetMatchObjectivesQuery } from "../objectives/objectives-api"
import { formatGameTime } from "../../utils/ward-aggregation"
import {
  MIN_GAMES,
  buildTempoRows,
  formatDelta,
  formatFallRate,
  type TempoRow,
  type TempoSplit,
} from "./tempo-utils"

const panel =
  "bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg"

/**
 * Colour the gap, not the time.
 *
 * Faster is not better without knowing whose tower it is: taking the enemy's T1
 * quickly is a good sign, losing your own quickly is not. So the same delta is
 * green in one table and red in the other.
 */
function deltaClass(row: TempoRow): string {
  if (row.deltaSeconds === null) return "text-slate-500"
  const faster = row.deltaSeconds < 0
  const good = row.split === "enemy" ? faster : !faster
  if (Math.abs(row.deltaSeconds) < 30) return "text-slate-400"
  return good ? "text-emerald-400" : "text-rose-400"
}

const TempoTable = ({
  rows,
  title,
  caption,
}: {
  rows: TempoRow[]
  title: string
  caption: string
}) => (
  <div className={`${panel} p-4`}>
    <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
    <p className="text-xs text-slate-500 mt-0.5 mb-3">{caption}</p>
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-slate-400 border-b border-slate-700">
          <th className="text-left font-medium py-1.5">Lane</th>
          <th className="text-right font-medium py-1.5">Median</th>
          <th className="text-right font-medium py-1.5">Fell</th>
          <th className="text-right font-medium py-1.5">League</th>
          <th className="text-right font-medium py-1.5">Diff</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr
            key={`${row.label}-${row.split}`}
            className="border-b border-slate-800 last:border-0"
          >
            <td className="py-1.5 text-slate-200">{row.label}</td>
            <td className="py-1.5 text-right font-mono text-slate-100">
              {row.medianTime === null ? "—" : formatGameTime(row.medianTime)}
            </td>
            {/* The fall rate sits next to the median rather than in a footnote:
                the median is only meaningful alongside how often it was
                observed, and a reader who has to look elsewhere for the
                denominator will read the median as unconditional. */}
            <td
              className={`py-1.5 text-right font-mono ${
                row.fell < row.games ? "text-amber-400" : "text-slate-400"
              }`}
            >
              {formatFallRate(row.fell, row.games)}
            </td>
            <td className="py-1.5 text-right font-mono text-slate-500">
              {row.leagueMedian === null
                ? "—"
                : formatGameTime(row.leagueMedian)}
            </td>
            <td className={`py-1.5 text-right font-mono ${deltaClass(row)}`}>
              {formatDelta(row.deltaSeconds)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

export const Tempo = ({
  leagueId,
  teamId,
}: {
  leagueId: number
  teamId: number
}) => {
  const { data, isLoading, isError } = useGetMatchObjectivesQuery({
    leagueId,
    teamId,
  })
  const { data: teamsData } = useGetTeamsByLeagueQuery({ leagueId })

  const rows = useMemo(
    () => buildTempoRows(data?.matches ?? [], data?.leagueBaseline ?? []),
    [data],
  )

  if (isLoading) {
    return (
      <div className={`${panel} p-6`}>
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
          <span className="text-slate-400">Loading tower timings...</span>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-red-500/30 shadow-lg p-6">
        <div className="text-red-400">
          Error loading tower timings. Please try again.
        </div>
      </div>
    )
  }

  const allMatches = data?.matches ?? []
  const parsedGames = allMatches.filter(m => m.hasObjectiveData).length
  const teamName = teamsData?.[leagueId]?.[teamId]?.name ?? "This team"

  if (parsedGames === 0) {
    return (
      <div className={`${panel} p-12 text-center`}>
        <div className="text-slate-400 text-lg font-medium">
          No objective data for this team
        </div>
        <div className="text-slate-500 text-sm mt-2">
          Tower timings come from OpenDota&apos;s parsed replays. Run the
          objectives backfill, or parse this team&apos;s matches.
        </div>
      </div>
    )
  }

  const split = (s: TempoSplit) => rows.filter(r => r.split === s)

  return (
    <div className="space-y-4">
      <div className={`${panel} p-4`}>
        <h2 className="text-lg font-semibold text-slate-100">
          Tower Tempo · {teamName}
        </h2>
        <div className="text-sm text-slate-400 mt-0.5">
          {parsedGames} game{parsedGames === 1 ? "" : "s"} with objective data
          {allMatches.length > parsedGames && (
            <span className="text-amber-400">
              {" "}
              · {allMatches.length - parsedGames} without
            </span>
          )}
        </div>
        {/* Stated up front rather than discovered from a thin column: below the
            floor the league comparison is noise, and a table that looks
            authoritative on two games is worse than one that says so. */}
        {parsedGames < MIN_GAMES && (
          <div className="text-amber-400 text-sm mt-2">
            Fewer than {MIN_GAMES} games — these medians move on a single result
            and the league comparison is not meaningful yet.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TempoTable
          rows={split("theirs")}
          title="Their towers"
          caption="When this team loses its own buildings. Later than the league median means they hold the map longer."
        />
        <TempoTable
          rows={split("enemy")}
          title="Towers they take"
          caption="When this team destroys the opposition's buildings. Earlier than the league median means they close faster."
        />
      </div>

      <div className="text-xs text-slate-500">
        Medians cover only the games in which a tower actually fell, so the
        &ldquo;Fell&rdquo; column is the denominator that makes them readable —
        a T3 that falls in 3 of 11 games has a median describing those 3. League
        figures compare against the same map side this team played on.
      </div>
    </div>
  )
}
