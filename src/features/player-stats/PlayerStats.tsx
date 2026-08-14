import { useMemo, useState } from "react"
import { useGetMatchesQuery } from "../matches/matches-api"
import { useGetTeamsByLeagueQuery } from "../league-and-team-picker/teams-api"
import { useGetRosterQuery } from "../players/players-api"
import { getHero } from "../../utils/get-hero"
import {
  buildPlayerStats,
  formatDamage,
  formatWards,
  type PlayerStatsEntry,
} from "./player-stats-utils"

/**
 * Shared across the header, every collapsed average row, and every game row so
 * the averages line up column-for-column and can be scanned down the page.
 *
 * Fourteen columns need about 790px, so the phone gets five of them over two
 * rows instead. Same cells in the same DOM order — the eight that don't fit are
 * hidden rather than dropped, and restated by `MoreStats` when a card is
 * expanded, so nothing is unreachable.
 */
const GRID =
  "grid grid-cols-[1.25rem_minmax(0,1fr)_auto_2.75rem_2.75rem] md:grid-cols-[1.5rem_minmax(7rem,1.5fr)_minmax(5.5rem,1fr)_minmax(6rem,1.1fr)_repeat(10,minmax(2.75rem,0.7fr))_1.75rem] gap-x-2 items-center"

/**
 * Where each surviving cell lands on the phone. Placed explicitly rather than
 * left to auto-flow: with some siblings hidden and one spanning two rows,
 * auto-placement puts cells in whichever hole it finds first, which is stable
 * until someone adds a column and then silently is not.
 */
const AT = {
  gutter: "max-md:col-start-1 max-md:row-start-1 max-md:row-span-2",
  primary: "max-md:col-start-2 max-md:row-start-1",
  sub: "max-md:col-start-2 max-md:row-start-2 max-md:col-span-4",
  third: "max-md:col-start-3 max-md:row-start-1",
  fourth: "max-md:col-start-4 max-md:row-start-1",
  fifth: "max-md:col-start-5 max-md:row-start-1",
  subLeft: "max-md:col-start-2 max-md:row-start-2",
  subRight: "max-md:col-start-3 max-md:row-start-2 max-md:col-span-2",
  subEnd: "max-md:col-start-5 max-md:row-start-2",
  thirdRow: "max-md:col-start-1 max-md:col-span-5 max-md:row-start-3",
  phoneHidden: "max-md:hidden",
}

const NUMERIC = "text-right tabular-nums"

/**
 * The columns the phone row has no room for, restated as labelled pairs.
 *
 * Wrapping text rather than a grid: eight short numbers in a two-column table
 * is taller than the row it describes, and these are read one at a time
 * ("what's their ward count") rather than scanned as a column.
 */
const MoreStats = ({
  pairs,
  className = "",
}: {
  pairs: [string, string][]
  className?: string
}) => (
  <div
    className={`md:hidden flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400 ${className}`}
  >
    {pairs.map(([label, value]) => (
      <span key={label}>
        <span className="text-slate-500">{label}</span> {value}
      </span>
    ))}
  </div>
)

const formatMatchDate = (startDateTime: number) =>
  new Date(startDateTime * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })

/**
 * A roster member who hasn't played in this league. Rendered rather than omitted
 * because it's half of how a wrong roster shows up: the other half — someone
 * playing who isn't registered — already appears under "Stand-ins". Seeing "Alca
 * · no games this league" next to a stand-in with 7 games is the prompt to fix
 * the season's roster.
 */
const NoGamesRow = ({ entry }: { entry: PlayerStatsEntry }) => (
  <li className="rounded-lg bg-slate-800/30 border border-slate-800">
    <div className={`${GRID} w-full px-3 py-2.5`}>
      <span className={AT.gutter} />
      <span
        className={`font-medium text-slate-500 truncate ${AT.primary}`}
        title={entry.name}
      >
        {entry.name}
      </span>
      <span className={`text-sm text-slate-600 ${AT.sub}`}>
        {entry.positionLabel}
      </span>
      <span
        className={`text-sm text-slate-600 col-span-8 max-md:col-span-3 ${AT.third}`}
      >
        no games this league
      </span>
      <span className={AT.phoneHidden} />
    </div>
  </li>
)

const PlayerCard = ({
  entry,
  isExpanded,
  onToggle,
  getTeamName,
}: {
  entry: PlayerStatsEntry
  isExpanded: boolean
  onToggle: () => void
  getTeamName: (teamId: number | null) => string
}) => {
  const { averages } = entry
  const winRate = Math.round((entry.wins / entry.games.length) * 100)

  return (
    <li className="rounded-lg bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-all overflow-hidden">
      <button
        onClick={onToggle}
        className={`${GRID} w-full text-left px-3 py-2.5 cursor-pointer hover:bg-slate-700/30 transition-colors`}
      >
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${AT.gutter} ${isExpanded ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
        <span
          className={`font-semibold text-slate-100 truncate ${AT.primary}`}
          title={entry.name}
        >
          {entry.name}
        </span>
        <span className={`text-sm text-slate-400 max-md:text-xs ${AT.sub}`}>
          {entry.positionLabel}
          <span className="text-slate-500"> · {entry.games.length}g</span>
        </span>
        <span className={`text-sm max-md:text-xs ${AT.third}`}>
          <span className="text-green-400">{entry.wins}</span>
          <span className="text-slate-500">-</span>
          <span className="text-red-400">{entry.losses}</span>
          <span className="text-slate-500"> ({winRate}%)</span>
        </span>
        <span
          className={`${NUMERIC} text-sm font-medium text-slate-200 ${AT.fourth}`}
        >
          {Math.round(averages.gpm)}
        </span>
        <span
          className={`${NUMERIC} text-sm font-medium text-slate-200 ${AT.phoneHidden}`}
        >
          {Math.round(averages.xpm)}
        </span>
        <span className={`${NUMERIC} text-sm text-slate-200 ${AT.phoneHidden}`}>
          {averages.kills.toFixed(1)}
        </span>
        <span className={`${NUMERIC} text-sm text-slate-200 ${AT.phoneHidden}`}>
          {averages.deaths.toFixed(1)}
        </span>
        <span className={`${NUMERIC} text-sm text-slate-200 ${AT.phoneHidden}`}>
          {averages.assists.toFixed(1)}
        </span>
        <span
          className={`${NUMERIC} text-sm font-medium text-emerald-300 ${AT.fifth}`}
        >
          {averages.kda.toFixed(1)}
        </span>
        <span className={`${NUMERIC} text-sm text-slate-200 ${AT.phoneHidden}`}>
          {formatDamage(averages.heroDamage)}
        </span>
        <span className={`${NUMERIC} text-sm text-slate-200 ${AT.phoneHidden}`}>
          {formatDamage(averages.towerDamage)}
        </span>
        <span className={`${NUMERIC} text-sm text-slate-200 ${AT.phoneHidden}`}>
          {formatWards(averages.obsPlaced, 1)}
        </span>
        <span className={`${NUMERIC} text-sm text-slate-200 ${AT.phoneHidden}`}>
          {formatWards(averages.senPlaced, 1)}
        </span>
        <span className={AT.phoneHidden} />
      </button>

      {isExpanded && (
        <div className="border-t border-slate-700/60 bg-slate-900/30">
          {/* The averages the phone row had to drop. On desktop these are
              already the columns to the right, so this whole block is one more
              copy of what is on screen and stays hidden. */}
          <MoreStats
            className="px-3 py-2 border-b border-slate-800/60"
            pairs={[
              ["XPM", String(Math.round(averages.xpm))],
              [
                "K/D/A",
                `${averages.kills.toFixed(1)}/${averages.deaths.toFixed(1)}/${averages.assists.toFixed(1)}`,
              ],
              ["HD", formatDamage(averages.heroDamage)],
              ["BLD", formatDamage(averages.towerDamage)],
              ["OBS", formatWards(averages.obsPlaced, 1)],
              ["SEN", formatWards(averages.senPlaced, 1)],
            ]}
          />
          {entry.games.map(game => (
            <div
              key={game.matchId}
              className={`${GRID} px-3 py-1.5 border-b border-slate-800/60 last:border-b-0 hover:bg-slate-800/40 transition-colors`}
            >
              <span
                className={`text-xs font-bold ${AT.gutter} ${game.won ? "text-green-400" : "text-red-400"}`}
                title={game.won ? "Win" : "Loss"}
              >
                {game.won ? "W" : "L"}
              </span>
              <span className={`text-xs text-slate-500 ${AT.subLeft}`}>
                {formatMatchDate(game.startDateTime)}
              </span>
              <span
                className={`text-sm text-slate-300 truncate ${AT.primary}`}
                title={getHero(game.heroId)}
              >
                {getHero(game.heroId)}
              </span>
              <span
                className={`text-xs text-slate-400 truncate ${AT.subRight}`}
                title={getTeamName(game.opponentTeamId)}
              >
                vs {getTeamName(game.opponentTeamId)}
              </span>
              <span
                className={`${NUMERIC} text-sm text-slate-300 ${AT.fourth}`}
              >
                {game.gpm}
              </span>
              <span
                className={`${NUMERIC} text-sm text-slate-300 ${AT.phoneHidden}`}
              >
                {game.xpm}
              </span>
              <span
                className={`${NUMERIC} text-sm text-slate-300 ${AT.phoneHidden}`}
              >
                {game.kills}
              </span>
              <span
                className={`${NUMERIC} text-sm text-slate-300 ${AT.phoneHidden}`}
              >
                {game.deaths}
              </span>
              <span
                className={`${NUMERIC} text-sm text-slate-300 ${AT.phoneHidden}`}
              >
                {game.assists}
              </span>
              <span
                className={`${NUMERIC} text-sm text-emerald-300/80 ${AT.fifth}`}
              >
                {game.kda.toFixed(1)}
              </span>
              <span
                className={`${NUMERIC} text-sm text-slate-300 ${AT.phoneHidden}`}
              >
                {formatDamage(game.heroDamage)}
              </span>
              <span
                className={`${NUMERIC} text-sm text-slate-300 ${AT.phoneHidden}`}
              >
                {formatDamage(game.towerDamage)}
              </span>
              <span
                className={`${NUMERIC} text-sm text-slate-300 ${AT.phoneHidden}`}
              >
                {formatWards(game.obsPlaced)}
              </span>
              <span
                className={`${NUMERIC} text-sm text-slate-300 ${AT.phoneHidden}`}
              >
                {formatWards(game.senPlaced)}
              </span>
              <MoreStats
                className={`pt-1 ${AT.thirdRow}`}
                pairs={[
                  ["XPM", String(game.xpm)],
                  [
                    "K/D/A",
                    `${String(game.kills)}/${String(game.deaths)}/${String(game.assists)}`,
                  ],
                  ["HD", formatDamage(game.heroDamage)],
                  ["BLD", formatDamage(game.towerDamage)],
                  ["OBS", formatWards(game.obsPlaced)],
                  ["SEN", formatWards(game.senPlaced)],
                ]}
              />
              <a
                href={`https://www.dotabuff.com/matches/${String(game.matchId)}`}
                target="_blank"
                rel="noopener noreferrer"
                title="View on Dotabuff"
                className={`text-slate-500 hover:text-blue-400 transition-colors justify-self-end ${AT.subEnd}`}
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            </div>
          ))}
        </div>
      )}
    </li>
  )
}

export const PlayerStats = ({
  leagueId,
  teamId,
}: {
  leagueId: number
  teamId: number
}) => {
  const {
    data: matchesData,
    isLoading: isLoadingMatches,
    isFetching: isFetchingMatches,
    isError: isErrorMatches,
  } = useGetMatchesQuery({ leagueId, teamId })
  const {
    data: teamsData,
    isLoading: isLoadingTeams,
    isError: isErrorTeams,
  } = useGetTeamsByLeagueQuery({ leagueId })
  // Decides the display name, the roster/stand-in split, and the tie-break for
  // players whose observed position is ambiguous. Scoped to the league: a team
  // fields a different lineup each season.
  const {
    data: rosterMembers,
    isLoading: isLoadingPlayers,
    isError: isErrorPlayers,
  } = useGetRosterQuery({ leagueId, teamId })

  const [expandedPlayers, setExpandedPlayers] = useState<Set<number>>(new Set())

  // Memoized so expanding a card doesn't re-walk every match and re-sort every
  // player's games. Must sit above the early returns to keep hook order stable.
  const { roster, standIns } = useMemo(
    () =>
      buildPlayerStats(matchesData?.matches ?? [], teamId, rosterMembers ?? []),
    [matchesData?.matches, teamId, rosterMembers],
  )

  const togglePlayer = (playerId: number) => {
    setExpandedPlayers(previous => {
      const next = new Set(previous)
      if (next.has(playerId)) {
        next.delete(playerId)
      } else {
        next.add(playerId)
      }
      return next
    })
  }

  // The roster is part of the gate so the list doesn't render ungrouped and then
  // visibly re-sort when it lands.
  if (
    isLoadingMatches ||
    isFetchingMatches ||
    isLoadingTeams ||
    isLoadingPlayers
  ) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-3 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-500"></div>
          <span className="text-slate-400">Loading player stats...</span>
        </div>
      </div>
    )
  }

  if (isErrorMatches || isErrorTeams) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-red-500/30 shadow-lg p-6">
        <div className="text-red-400">Error: Please try again</div>
      </div>
    )
  }

  // Keyed on matches, not entries: a team with a registered roster but no
  // ingested games would otherwise render a list of "no games" rows, which reads
  // as a roster problem when it's really a missing-matches one.
  if ((matchesData?.matches.length ?? 0) === 0) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-3 sm:p-6">
        <div className="text-slate-400">No matches found for this team</div>
      </div>
    )
  }

  const getTeamName = (opponentTeamId: number | null) =>
    (opponentTeamId != null
      ? teamsData?.[leagueId]?.[opponentTeamId]?.name
      : undefined) ?? "Unknown Team"

  const renderCards = (entries: PlayerStatsEntry[]) => (
    <ul className="space-y-2">
      {entries.map(entry =>
        entry.games.length === 0 ? (
          <NoGamesRow key={entry.playerId} entry={entry} />
        ) : (
          <PlayerCard
            key={entry.playerId}
            entry={entry}
            isExpanded={expandedPlayers.has(entry.playerId)}
            onToggle={() => {
              togglePlayer(entry.playerId)
            }}
            getTeamName={getTeamName}
          />
        ),
      )}
    </ul>
  )

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-3 sm:p-6">
      <h2 className="text-xl font-bold mb-1 bg-linear-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
        Player Stats
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        League averages per player. Click a player to see every game.
      </p>

      {isErrorPlayers && (
        <p className="text-sm text-amber-400/80 mb-4">
          Roster unavailable — stand-ins not marked.
        </p>
      )}

      <div
        className={`${GRID} px-3 pb-2 mb-2 border-b border-slate-700 text-xs font-medium text-slate-500 uppercase tracking-wide`}
      >
        <span className={AT.gutter} />
        <span className={AT.primary}>
          <span className="md:hidden">Player</span>
          <span className="max-md:hidden">Player / Match</span>
        </span>
        <span className={AT.phoneHidden}>Pos / Hero</span>
        <span className={AT.third}>
          <span className="md:hidden">W-L</span>
          <span className="max-md:hidden">Record / Opponent</span>
        </span>
        <span className={`${NUMERIC} ${AT.fourth}`}>GPM</span>
        <span className={`${NUMERIC} ${AT.phoneHidden}`}>XPM</span>
        <span className={`${NUMERIC} ${AT.phoneHidden}`}>K</span>
        <span className={`${NUMERIC} ${AT.phoneHidden}`}>D</span>
        <span className={`${NUMERIC} ${AT.phoneHidden}`}>A</span>
        <span className={`${NUMERIC} ${AT.fifth}`}>KDA</span>
        <span className={`${NUMERIC} ${AT.phoneHidden}`}>HD</span>
        <span
          className={`${NUMERIC} ${AT.phoneHidden}`}
          title="Building damage"
        >
          BLD
        </span>
        <span
          className={`${NUMERIC} ${AT.phoneHidden}`}
          title="Observer wards placed"
        >
          OBS
        </span>
        <span
          className={`${NUMERIC} ${AT.phoneHidden}`}
          title="Sentry wards placed"
        >
          SEN
        </span>
        <span className={AT.phoneHidden} />
      </div>

      {renderCards(roster)}

      {standIns.length > 0 && (
        <>
          <h3 className="mt-6 mb-2 px-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
            Stand-ins
          </h3>
          {renderCards(standIns)}
        </>
      )}
    </div>
  )
}
