import type { MatchApiResponse } from "../../../types/api"
import type { RosterEntry } from "../../../types/db"
import { roleToPosition } from "../../../shared/roles"

const POSITIONS: string[] = [
  "POSITION_1",
  "POSITION_2",
  "POSITION_3",
  "POSITION_4",
  "POSITION_5",
]

/** Sort key for players whose matches never resolved to a position. */
const UNKNOWN_POSITION_SORT_KEY = POSITIONS.length

/** Sentinel written by the ingest scripts when a Steam profile is private. */
const ANONYMOUS_PLAYER_ID = 0

export type PlayerGame = {
  matchId: number
  startDateTime: number
  won: boolean
  heroId: number
  opponentTeamId: number | null
  position: string | null
  gpm: number
  xpm: number
  kills: number
  deaths: number
  assists: number
  heroDamage: number
  kda: number
}

export type PlayerAverages = {
  gpm: number
  xpm: number
  kills: number
  deaths: number
  assists: number
  heroDamage: number
  kda: number
}

export type PlayerStatsEntry = {
  playerId: number
  name: string
  positionLabel: string
  positionSortKey: number
  wins: number
  losses: number
  averages: PlayerAverages
  games: PlayerGame[]
}

export type PlayerStatsSplit = {
  /**
   * Players on the team's roster for this league, including any who haven't
   * played a game in it — an empty `games` array is the signal.
   */
  roster: PlayerStatsEntry[]
  /** Players who appeared for the team but aren't on its roster. */
  standIns: PlayerStatsEntry[]
}

/**
 * Per-game KDA. A deathless game counts as one death, so 10/0/10 reads 20.0
 * rather than dividing by zero.
 */
export function getGameKda(
  kills: number,
  deaths: number,
  assists: number,
): number {
  return (kills + assists) / Math.max(deaths, 1)
}

/**
 * Most-common position across a player's games. Ties render as a combined
 * label ("Pos 4/5") and sort at the lowest of the tied positions — unless the
 * roster declares one of the tied positions, which slots them there instead.
 * The label still shows both, so a genuinely flexible player stays visible as
 * one; only their place in the list becomes deterministic.
 */
function getPositionLabel(
  games: PlayerGame[],
  declaredPosition: string | null,
): {
  label: string
  sortKey: number
} {
  const counts = new Map<string, number>()
  for (const game of games) {
    if (game.position && POSITIONS.includes(game.position)) {
      counts.set(game.position, (counts.get(game.position) ?? 0) + 1)
    }
  }

  if (counts.size === 0) {
    return { label: "—", sortKey: UNKNOWN_POSITION_SORT_KEY }
  }

  // Non-empty: `counts` only ever holds keys drawn from POSITIONS.
  const highest = Math.max(...counts.values())
  const tied = POSITIONS.filter(position => counts.get(position) === highest)
  const declared =
    declaredPosition && tied.includes(declaredPosition)
      ? declaredPosition
      : tied[0]

  return {
    label: `Pos ${tied.map(position => position.replace("POSITION_", "")).join("/")}`,
    sortKey: POSITIONS.indexOf(declared),
  }
}

/** The team the scouted team played in a given match. */
function getOpponentTeamId(
  match: MatchApiResponse,
  teamId: number,
): number | null {
  if (match.radiant_team_id === teamId) return match.dire_team_id
  if (match.dire_team_id === teamId) return match.radiant_team_id
  return null
}

function getAverages(games: PlayerGame[]): PlayerAverages {
  const totals = games.reduce(
    (acc, game) => ({
      gpm: acc.gpm + game.gpm,
      xpm: acc.xpm + game.xpm,
      kills: acc.kills + game.kills,
      deaths: acc.deaths + game.deaths,
      assists: acc.assists + game.assists,
      heroDamage: acc.heroDamage + game.heroDamage,
    }),
    { gpm: 0, xpm: 0, kills: 0, deaths: 0, assists: 0, heroDamage: 0 },
  )

  const gameCount = Math.max(games.length, 1)

  return {
    gpm: totals.gpm / gameCount,
    xpm: totals.xpm / gameCount,
    kills: totals.kills / gameCount,
    deaths: totals.deaths / gameCount,
    assists: totals.assists / gameCount,
    heroDamage: totals.heroDamage / gameCount,
    // Ratio of totals, matching how Dotabuff/OpenDota/Stratz report aggregate KDA.
    kda: (totals.kills + totals.assists) / Math.max(totals.deaths, 1),
  }
}

/** Roster order: pos 1 through 5, then the starter ahead of the backup. */
function compareRoster(a: PlayerStatsEntry, b: PlayerStatsEntry): number {
  return (
    a.positionSortKey - b.positionSortKey ||
    b.games.length - a.games.length ||
    a.name.localeCompare(b.name)
  )
}

/**
 * Stand-in order: most games first. Position is noisy here — a stand-in often
 * played a single game out of role — so "who actually shows up" leads.
 */
function compareStandIn(a: PlayerStatsEntry, b: PlayerStatsEntry): number {
  return (
    b.games.length - a.games.length ||
    a.positionSortKey - b.positionSortKey ||
    a.name.localeCompare(b.name)
  )
}

/** Position a roster member declares, for someone with no games to infer from. */
function getDeclaredPositionLabel(role: string): {
  label: string
  sortKey: number
} {
  const position = roleToPosition(role)
  if (!position) return { label: "—", sortKey: UNKNOWN_POSITION_SORT_KEY }

  return {
    label: `Pos ${position.replace("POSITION_", "")}`,
    sortKey: POSITIONS.indexOf(position),
  }
}

/**
 * Builds one entry per player who appeared for the scouted team, aggregating by
 * `player_id` because `player_name` changes between matches, then splits them
 * into the league's registered roster and everyone else.
 *
 * `rosterMembers` is scoped to one league, so a player registered for S47 is not
 * treated as roster when you're looking at S46 — which is what made a 7-game S46
 * starter render under "Stand-ins".
 */
export function buildPlayerStats(
  matches: MatchApiResponse[],
  teamId: number,
  rosterMembers: RosterEntry[],
): PlayerStatsSplit {
  const registered = new Map(
    rosterMembers.map(member => [member.player_id, member]),
  )
  const gamesByPlayer = new Map<number, PlayerGame[]>()
  const latestNames = new Map<number, { name: string; at: number }>()

  for (const match of matches) {
    const opponentTeamId = getOpponentTeamId(match, teamId)
    const won = match.winning_team_id === teamId

    for (const player of match.players) {
      if (player.team_id !== teamId) continue
      // Private Steam profiles are ingested as player_id 0 (see
      // scripts/match-operations.ts). They can't be tracked across matches, and
      // merging them would invent one composite player out of several people.
      if (player.player_id === ANONYMOUS_PLAYER_ID) continue

      const games = gamesByPlayer.get(player.player_id) ?? []
      games.push({
        matchId: match.id,
        startDateTime: match.start_date_time,
        won,
        heroId: player.hero_id,
        opponentTeamId,
        position: player.position,
        gpm: player.gpm,
        xpm: player.xpm,
        kills: player.kills,
        deaths: player.deaths,
        assists: player.assists,
        heroDamage: player.hero_damage,
        kda: getGameKda(player.kills, player.deaths, player.assists),
      })
      gamesByPlayer.set(player.player_id, games)

      const latest = latestNames.get(player.player_id)
      if (
        player.player_name &&
        (!latest || match.start_date_time > latest.at)
      ) {
        latestNames.set(player.player_id, {
          name: player.player_name,
          at: match.start_date_time,
        })
      }
    }
  }

  const entries: PlayerStatsEntry[] = []
  for (const [playerId, games] of gamesByPlayer) {
    games.sort((a, b) => b.startDateTime - a.startDateTime)
    const registeredPlayer = registered.get(playerId)
    const { label, sortKey } = getPositionLabel(
      games,
      registeredPlayer ? roleToPosition(registeredPlayer.role) : null,
    )
    const wins = games.filter(game => game.won).length

    entries.push({
      playerId,
      name:
        registeredPlayer?.name ??
        latestNames.get(playerId)?.name ??
        String(playerId),
      positionLabel: label,
      positionSortKey: sortKey,
      wins,
      losses: games.length - wins,
      averages: getAverages(games),
      games,
    })
  }

  // An empty roster means "we don't know who plays for this team", not "nobody
  // does". Calling all ten players stand-ins would be worse than saying nothing,
  // so fall back to a single position-ordered list.
  if (registered.size === 0) {
    return { roster: entries.sort(compareRoster), standIns: [] }
  }

  // Roster members with no games in this league would otherwise vanish, hiding
  // half of every roster mistake: you'd see the stand-in who played but not the
  // registered player who didn't. Both halves need to be visible to notice the
  // roster is wrong for the season you're looking at.
  const played = new Set(entries.map(entry => entry.playerId))
  for (const member of rosterMembers) {
    if (played.has(member.player_id)) continue

    const { label, sortKey } = getDeclaredPositionLabel(member.role)
    entries.push({
      playerId: member.player_id,
      name: member.name,
      positionLabel: label,
      positionSortKey: sortKey,
      wins: 0,
      losses: 0,
      averages: getAverages([]),
      games: [],
    })
  }

  return {
    roster: entries.filter(e => registered.has(e.playerId)).sort(compareRoster),
    standIns: entries
      .filter(e => !registered.has(e.playerId))
      .sort(compareStandIn),
  }
}

/** Hero damage is five digits often enough that 18.5k reads better than 18,532. */
export function formatDamage(value: number): string {
  return value >= 1000
    ? `${(value / 1000).toFixed(1)}k`
    : String(Math.round(value))
}
