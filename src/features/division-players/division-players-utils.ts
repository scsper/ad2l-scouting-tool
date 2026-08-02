import type { DivisionPlayerRow } from "../league-aggregate/league-aggregate-api"

/**
 * Games at a position before a row is ranked against the others.
 *
 * Fixed rather than a control. The right floor genuinely differs by league — at
 * three, PGL Wallachia keeps 16 of its 17 carries and S45 keeps 6 of 17 — but a
 * knob means every number you read has an invisible parameter attached, and
 * nobody remembers where they left it. Rows below the floor are not dropped;
 * they are listed unranked underneath, because a leaderboard that quietly
 * deletes fifteen of a division's twenty-two carries is claiming a field it
 * doesn't have.
 */
export const MIN_GAMES = 3

export const POSITIONS = [
  { key: "POSITION_1", label: "Pos 1" },
  { key: "POSITION_2", label: "Pos 2" },
  { key: "POSITION_3", label: "Pos 3" },
  { key: "POSITION_4", label: "Pos 4" },
  { key: "POSITION_5", label: "Pos 5" },
]

export const DEFAULT_POSITION = "POSITION_1"

export type SortDirection = "asc" | "desc"

/**
 * The board opens on games played, which asserts nothing.
 *
 * Every candidate for a more interesting default has a hole in it: GPM is close
 * to meaningless for a pos 5, and gold@10 is a lane-pair outcome rather than a
 * player's. Opening on either would tell you the board has an opinion about who
 * is good, and it doesn't — the columns are there so you can ask.
 */
export const DEFAULT_SORT = "games"
export const DEFAULT_DIRECTION: SortDirection = "desc"

export type Column = {
  key: string
  label: string
  title: string
  /** The sortable magnitude. `null` where the row has no data for it. */
  value: (row: DivisionPlayerRow) => number | null
  format: (row: DivisionPlayerRow) => string
}

/** Renders missing data as an em dash so it never reads as a zero. */
function formatOrDash(
  value: number | null,
  format: (value: number) => string,
): string {
  return value == null ? "—" : format(value)
}

const round = (value: number) => String(Math.round(value))

/**
 * Wards are shown per game, at the one decimal the Players tab uses.
 *
 * A support placing 11.4 observers a game is a number a scout has seen before,
 * on Dotabuff and on the per-team board; the same player as "0.24 per minute"
 * or a rescaled "2.4 per ten" is one they have to translate. The cost is that a
 * long game inflates the count — which is real, and is why the `@10` columns
 * are next to this one.
 */
const formatWardsPerGame = (perGame: number) => perGame.toFixed(1)

export const COLUMNS: Column[] = [
  {
    key: "games",
    label: "G",
    title: "Games at this position",
    value: row => row.games,
    format: row => String(row.games),
  },
  {
    key: "winPct",
    label: "W-L",
    title: "Record at this position",
    value: row => (row.games === 0 ? null : (row.wins / row.games) * 100),
    format: row =>
      `${String(row.wins)}-${String(row.games - row.wins)} (${String(
        Math.round((row.wins / Math.max(row.games, 1)) * 100),
      )}%)`,
  },
  {
    key: "goldAt10",
    label: "G@10",
    title: "Gold at 10 minutes",
    value: row => row.goldAt10,
    format: row => formatOrDash(row.goldAt10, round),
  },
  {
    key: "xpAt10",
    label: "XP@10",
    title: "Experience at 10 minutes",
    value: row => row.xpAt10,
    format: row => formatOrDash(row.xpAt10, round),
  },
  {
    key: "lhAt10",
    label: "LH@10",
    title: "Last hits at 10 minutes",
    value: row => row.lhAt10,
    format: row => formatOrDash(row.lhAt10, round),
  },
  {
    key: "gpm",
    label: "GPM",
    title: "Gold per minute",
    value: row => row.gpm,
    format: row => round(row.gpm),
  },
  {
    key: "xpm",
    label: "XPM",
    title: "Experience per minute",
    value: row => row.xpm,
    format: row => round(row.xpm),
  },
  {
    key: "kda",
    label: "KDA",
    title: "(kills + assists) / deaths, over all games at this position",
    value: row => row.kda,
    // Two decimals rather than the Players tab's one: on a board this small,
    // a shared 3.4 is a tie you have to break by squinting at another column.
    format: row => row.kda.toFixed(2),
  },
  {
    key: "heroDamagePerMin",
    label: "HD/m",
    title: "Hero damage per minute",
    value: row => row.heroDamagePerMin,
    format: row => formatOrDash(row.heroDamagePerMin, round),
  },
  {
    key: "obsPerGame",
    label: "OBS",
    title: "Observer wards placed per game",
    value: row => row.obsPerGame,
    format: row => formatOrDash(row.obsPerGame, formatWardsPerGame),
  },
  {
    key: "senPerGame",
    label: "SEN",
    title: "Sentry wards placed per game",
    value: row => row.senPerGame,
    format: row => formatOrDash(row.senPerGame, formatWardsPerGame),
  },
]

const COLUMNS_BY_KEY = new Map(COLUMNS.map(column => [column.key, column]))

/** A sort key we recognise, or the default — a URL can name anything. */
export function parseSort(value: string | null): string {
  return value !== null && COLUMNS_BY_KEY.has(value) ? value : DEFAULT_SORT
}

export function parseDirection(value: string | null): SortDirection {
  return value === "asc" ? "asc" : DEFAULT_DIRECTION
}

export function parsePosition(value: string | null): string {
  const position = `POSITION_${value ?? ""}`
  return POSITIONS.some(entry => entry.key === position)
    ? position
    : DEFAULT_POSITION
}

/** "POSITION_4" as it appears in a URL. */
export function positionParam(position: string): string {
  return position.replace("POSITION_", "")
}

/**
 * Rows at one position, sorted.
 *
 * Missing data sorts last in *both* directions rather than being treated as the
 * smallest value. A support with no ward data hasn't warded least; sorting them
 * to the top of an ascending OBS column would say they had.
 */
export function sortRows(
  rows: DivisionPlayerRow[],
  sort: string,
  direction: SortDirection,
): DivisionPlayerRow[] {
  const column = COLUMNS_BY_KEY.get(sort) ?? COLUMNS[0]

  return [...rows].sort((a, b) => {
    const left = column.value(a)
    const right = column.value(b)

    if (left == null || right == null) {
      if (left != null) return -1
      if (right != null) return 1
      return a.name.localeCompare(b.name)
    }

    if (left !== right) return direction === "desc" ? right - left : left - right
    // Name last so the order is stable across renders and re-sorts.
    return a.name.localeCompare(b.name)
  })
}

export type SampleSplit = {
  ranked: DivisionPlayerRow[]
  /** Below the floor: shown, but not given a rank they haven't earned. */
  lowSample: DivisionPlayerRow[]
}

export function splitBySample(rows: DivisionPlayerRow[]): SampleSplit {
  return {
    ranked: rows.filter(row => row.games >= MIN_GAMES),
    lowSample: rows.filter(row => row.games < MIN_GAMES),
  }
}

/**
 * The teams a row's games were played for.
 *
 * A stand-in who covered the same position for two teams gets both, because
 * naming only the one he played most would be silently wrong for the players
 * most worth looking up — a tenth of an AD2L season's field.
 */
export function formatTeams(
  teamIds: number[],
  getTeamName: (teamId: number) => string,
): string {
  if (teamIds.length === 0) return "—"
  const [first, ...rest] = teamIds.map(getTeamName)
  return rest.length === 0 ? first : `${first} +${String(rest.length)}`
}
