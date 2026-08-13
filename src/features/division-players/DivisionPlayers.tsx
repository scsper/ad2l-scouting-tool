import { useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { useGetLeagueStatsQuery } from "../league-stats/league-stats-api"
import type { DivisionPlayerRow } from "../league-stats/league-stats-api"
import { useGetTeamsByLeagueQuery } from "../league-and-team-picker/teams-api"
import {
  COLUMNS,
  DEFAULT_DIRECTION,
  DEFAULT_POSITION,
  DEFAULT_SORT,
  MIN_GAMES,
  POSITIONS,
  formatTeams,
  parseDirection,
  parsePosition,
  parseSort,
  positionParam,
  sortRows,
  splitBySample,
  type SortDirection,
} from "./division-players-utils"

/**
 * Shared by the header and every row so the eleven numeric columns line up and
 * can be scanned down the page.
 *
 * Fourteen columns want about 800px. The phone gets rank, name and three
 * numbers over two rows; the rest are hidden and restated on expand.
 */
// The last phone column is the widest because it carries "12-10 (55%)", which
// wraps to two lines — and so doubles the height of every row on the board — at
// anything under 4rem.
const GRID =
  "grid grid-cols-[1.25rem_minmax(0,1fr)_2.5rem_1.75rem_4rem] md:grid-cols-[2rem_minmax(7rem,1.4fr)_minmax(5.5rem,1fr)_2.25rem_minmax(5.5rem,0.9fr)_repeat(9,minmax(3.25rem,0.8fr))] gap-x-2 items-center"

/** Where each surviving cell lands on the phone. See `PlayerStats` for why these are explicit. */
const AT = {
  gutter: "max-md:col-start-1 max-md:row-start-1 max-md:row-span-2",
  primary: "max-md:col-start-2 max-md:row-start-1",
  sub: "max-md:col-start-2 max-md:row-start-2 max-md:col-span-4",
  phoneHidden: "max-md:hidden",
}

/** The three numeric columns, in the order they sit on a phone row. */
const PHONE_SLOTS = [
  "max-md:col-start-3 max-md:row-start-1",
  "max-md:col-start-4 max-md:row-start-1",
  "max-md:col-start-5 max-md:row-start-1",
]

/**
 * Which three of the eleven numeric columns a phone shows.
 *
 * The sorted column has to be one of them. A ranked list whose ordering column
 * is off-screen is a list in an order the screen does not justify — the reader
 * sees rows that look mis-sorted and has no way to tell that they aren't.
 *
 * `G` and `W-L` are the other two, permanently: the sorted number is only worth
 * reading next to how many games produced it, and whether the player wins.
 * When the board is sorted by one of those two, the freed slot goes to GPM
 * rather than collapsing to two columns, so the row keeps its shape.
 */
export function phoneColumnKeys(sort: string): string[] {
  const alwaysShown = ["games", "winPct"]
  return [alwaysShown.includes(sort) ? "gpm" : sort, ...alwaysShown]
}

/** The phone placement for a column, or `hidden` if it isn't one of the three. */
function phonePlacement(key: string, sort: string): string {
  const index = phoneColumnKeys(sort).indexOf(key)
  return index === -1 ? AT.phoneHidden : PHONE_SLOTS[index]
}

const NUMERIC = "text-right tabular-nums"

const PlayerRow = ({
  row,
  rank,
  sort,
  isExpanded,
  onToggle,
  getTeamName,
}: {
  row: DivisionPlayerRow
  /** `null` below the minimum-games floor, where a rank would be a fiction. */
  rank: number | null
  sort: string
  isExpanded: boolean
  onToggle: () => void
  getTeamName: (teamId: number) => string
}) => {
  // Dimmed rather than hidden. A row down here is a real player with a real
  // record; what it lacks is enough of one to be ranked against the others.
  const isRanked = rank !== null
  const teams = formatTeams(row.teamIds, getTeamName)
  const shown = phoneColumnKeys(sort)

  return (
    <li
      className={`rounded-lg border transition-all ${
        isRanked
          ? "bg-slate-800/50 border-slate-700 hover:border-slate-600"
          : "bg-slate-800/30 border-slate-800"
      }`}
    >
      {/*
        A button only because the phone needs somewhere to put the eight columns
        it cannot show. At `md` and up every column is already on the row, so the
        block this toggles is empty there and the cursor stays an arrow.
      */}
      <button
        onClick={onToggle}
        className={`${GRID} w-full text-left px-3 py-2 max-md:cursor-pointer`}
      >
        <span className={`${NUMERIC} text-xs text-slate-500 ${AT.gutter}`}>
          {rank ?? ""}
        </span>
        <span
          className={`font-medium truncate ${AT.primary} ${isRanked ? "text-slate-100" : "text-slate-400"}`}
          title={row.name}
        >
          {row.name}
        </span>
        <span
          className={`text-xs text-slate-400 truncate ${AT.sub}`}
          title={teams}
        >
          {teams}
        </span>
        {COLUMNS.map(column => (
          <span
            key={column.key}
            className={`${NUMERIC} text-sm max-md:text-xs max-md:whitespace-nowrap ${phonePlacement(column.key, sort)} ${isRanked ? "text-slate-200" : "text-slate-400"}`}
          >
            {column.format(row)}
          </span>
        ))}
      </button>

      {isExpanded && (
        <div className="md:hidden flex flex-wrap gap-x-3 gap-y-0.5 px-3 pb-2 text-xs text-slate-400 border-t border-slate-700/60 pt-2">
          {COLUMNS.filter(column => !shown.includes(column.key)).map(column => (
            <span key={column.key}>
              <span className="text-slate-500">{column.label}</span>{" "}
              {column.format(row)}
            </span>
          ))}
        </div>
      )}
    </li>
  )
}

export const DivisionPlayers = ({
  leagueId,
  division,
  hasDivisions,
}: {
  leagueId: number
  division: string | undefined
  hasDivisions: boolean
}) => {
  // Same gate as the hero board: a ranking that averages two skill tiers
  // describes neither of them, so it refuses to query rather than answering
  // with a number nobody can use.
  const needsDivision = hasDivisions && !division
  const { data, isLoading, isError } = useGetLeagueStatsQuery(
    { leagueId, division },
    { skip: needsDivision },
  )
  const { data: teamsData } = useGetTeamsByLeagueQuery({ leagueId })

  const [searchParams, setSearchParams] = useSearchParams()

  // Phone-only in effect: the block it reveals is `md:hidden`, because at `md`
  // and up there is nothing left to reveal. Kept out of the URL unlike the
  // board's own state — which rows you opened is not something anyone pastes
  // into a scrims thread.
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const toggleRow = (playerId: number) => {
    setExpandedRows(previous => {
      const next = new Set(previous)
      if (next.has(playerId)) {
        next.delete(playerId)
      } else {
        next.add(playerId)
      }
      return next
    })
  }
  const position = parsePosition(searchParams.get("pos"))
  const sort = parseSort(searchParams.get("sort"))
  const direction = parseDirection(searchParams.get("dir"))

  /**
   * The board lives in the query string so "pos 4s by xp@10" can be pasted to
   * someone rather than described to them. A param at its default is deleted
   * rather than written, which keeps the common URL readable, and every write
   * replaces: sorting changes what you are looking at, not where you are, and
   * back should return you to the screen you came from rather than stepping you
   * through four column clicks.
   */
  const updateBoard = (changes: Record<string, string | null>) => {
    setSearchParams(
      previous => {
        const next = new URLSearchParams(previous)
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) {
            next.delete(key)
          } else {
            next.set(key, value)
          }
        }
        return next
      },
      { replace: true },
    )
  }

  const selectPosition = (nextPosition: string) => {
    updateBoard({
      pos:
        nextPosition === DEFAULT_POSITION ? null : positionParam(nextPosition),
    })
  }

  // First click on a column sorts it descending, which is "best first" for
  // every column here. Clicking the one already active flips it.
  const selectSort = (key: string) => {
    const nextDirection: SortDirection =
      key === sort && direction === "desc" ? "asc" : "desc"
    updateBoard({
      sort: key === DEFAULT_SORT ? null : key,
      dir: nextDirection === DEFAULT_DIRECTION ? null : nextDirection,
    })
  }

  // Memoized so re-sorting one column doesn't re-filter and re-sort the other
  // four boards. Above the early returns to keep hook order stable.
  const { ranked, lowSample } = useMemo(() => {
    const atPosition = (data?.playerStats ?? []).filter(
      row => row.position === position,
    )
    const split = splitBySample(atPosition)
    return {
      ranked: sortRows(split.ranked, sort, direction),
      lowSample: sortRows(split.lowSample, sort, direction),
    }
  }, [data?.playerStats, position, sort, direction])

  if (needsDivision) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        Select a division to see its players.
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 h-48 text-slate-400">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400"></div>
        <span>Loading player data...</span>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-48 text-red-400">
        Failed to load player data. Please try again.
      </div>
    )
  }

  const getTeamName = (teamId: number) =>
    teamsData?.[leagueId]?.[teamId]?.name ?? "Unknown Team"

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-3 sm:p-6">
      {/*
        The phone's sort control, because the header it would otherwise use is
        mostly off-screen: eight of the eleven column buttons are hidden there,
        and a board you can only sort three ways is a different board. Every
        column is selectable here, and whichever one is chosen becomes the first
        number on every row — see `phoneColumnKeys`.
      */}
      <div className="md:hidden flex items-center gap-2 mb-3">
        <label
          htmlFor="division-players-sort"
          className="text-xs font-medium text-slate-500 uppercase tracking-wide"
        >
          Sort
        </label>
        <select
          id="division-players-sort"
          value={sort}
          onChange={e => {
            selectSort(e.target.value)
          }}
          className="flex-1 min-w-0 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-slate-100"
        >
          {COLUMNS.map(column => (
            <option key={column.key} value={column.key}>
              {column.title}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            selectSort(sort)
          }}
          aria-label={
            direction === "desc" ? "Sort ascending" : "Sort descending"
          }
          className="px-3 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-200"
        >
          {direction === "desc" ? "↓" : "↑"}
        </button>
      </div>

      <div className="flex flex-wrap gap-1 mb-4">
        {POSITIONS.map(entry => (
          <button
            key={entry.key}
            onClick={() => {
              selectPosition(entry.key)
            }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              entry.key === position
                ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                : "bg-slate-700/30 text-slate-400 border-slate-700 hover:bg-slate-700/50 hover:text-slate-300"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div
        className={`${GRID} px-3 pb-2 mb-2 border-b border-slate-700 text-xs font-medium text-slate-500 uppercase tracking-wide`}
      >
        <span className={AT.gutter} />
        <span className={AT.primary}>Player</span>
        <span className={AT.phoneHidden}>Team</span>
        {COLUMNS.map(column => (
          <button
            key={column.key}
            onClick={() => {
              selectSort(column.key)
            }}
            title={column.title}
            className={`${NUMERIC} uppercase tracking-wide cursor-pointer transition-colors ${phonePlacement(column.key, sort)} ${
              column.key === sort
                ? "text-blue-400"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {column.label}
            {column.key === sort && (direction === "desc" ? " ↓" : " ↑")}
          </button>
        ))}
      </div>

      {ranked.length === 0 && lowSample.length === 0 && (
        <p className="text-slate-500 text-sm py-6 text-center">
          No games at this position.
        </p>
      )}

      <ul className="space-y-1.5">
        {ranked.map((row, index) => (
          <PlayerRow
            key={row.playerId}
            row={row}
            rank={index + 1}
            sort={sort}
            isExpanded={expandedRows.has(row.playerId)}
            onToggle={() => {
              toggleRow(row.playerId)
            }}
            getTeamName={getTeamName}
          />
        ))}
      </ul>

      {lowSample.length > 0 && (
        <>
          <h3 className="mt-6 mb-2 px-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
            Fewer than {MIN_GAMES} games
          </h3>
          <ul className="space-y-1.5">
            {lowSample.map(row => (
              <PlayerRow
                key={row.playerId}
                row={row}
                rank={null}
                sort={sort}
                isExpanded={expandedRows.has(row.playerId)}
                onToggle={() => {
                  toggleRow(row.playerId)
                }}
                getTeamName={getTeamName}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
