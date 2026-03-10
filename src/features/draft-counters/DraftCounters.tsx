import { useEffect } from "react"
import { useAppDispatch, useAppSelector } from "../../app/hooks"
import {
  setSelectedTeamB,
  setSelectedPlayer,
  setSelectedHero,
  fetchCounters,
  refreshCounters,
  fetchTeamBMatches,
  fetchTeamBPlayers,
  selectSelectedTeamBId,
  selectSelectedPlayerId,
  selectSelectedHeroId,
  selectCounters,
  selectTeamBMatches,
  selectTeamBPlayers,
} from "./draft-counters-slice"
import { useGetMatchesQuery } from "../matches/matches-api"
import {
  useGetPlayersByTeamQuery,
  useGetPlayerPubMatchesQuery,
} from "../players/players-api"
import { useGetTeamsByLeagueQuery } from "../league-and-team-picker/teams-api"
import { aggregatePlayerLeagueHeroes } from "../players/player-league-heroes-utils"
import { getHero } from "../../utils/get-hero"
import type { HeroCounterRow, PlayerRow } from "../../../types/db"
import type { MatchApiResponse } from "../../../types/api"

type DraftCountersProps = {
  leagueId: number
  teamId: number
}

const POSITION_ORDER = [
  "POSITION_1",
  "POSITION_2",
  "POSITION_3",
  "POSITION_4",
  "POSITION_5",
] as const
const POSITION_LABELS: Record<string, string> = {
  POSITION_1: "Carry (P1)",
  POSITION_2: "Mid (P2)",
  POSITION_3: "Offlane (P3)",
  POSITION_4: "Soft Support (P4)",
  POSITION_5: "Hard Support (P5)",
}
const ROLE_TO_POSITION: Record<string, string> = {
  Carry: "POSITION_1",
  Mid: "POSITION_2",
  Offlane: "POSITION_3",
  "Soft Support": "POSITION_4",
  "Hard Support": "POSITION_5",
}

type HeroOption = {
  heroId: number
  label: string
}

type GroupedHeroOptions = {
  league: HeroOption[]
  pub: HeroOption[]
}

function buildTeamAHeroOptions(
  matchesData: MatchApiResponse[] | undefined,
  playerId: number | undefined,
  recentMatches: Array<{ hero_id: number; wins: number; losses: number }>,
  topHeroesOverall: Array<{ hero_id: number; wins: number; losses: number }>
): GroupedHeroOptions {
  if (!playerId) return { league: [], pub: [] }

  // League heroes
  const leagueHeroes = matchesData
    ? aggregatePlayerLeagueHeroes(matchesData, playerId)
    : []
  const league: HeroOption[] = leagueHeroes
    .sort((a, b) => b.games - a.games)
    .map(h => ({ heroId: h.heroId, label: `${getHero(h.heroId)} (${h.wins}-${h.losses})` }))

  // Pub heroes — track recent and overall records separately
  type PubEntry = { recent?: { wins: number; losses: number }; overall?: { wins: number; losses: number } }
  const pubEntries = new Map<number, PubEntry>()
  for (const s of recentMatches) {
    const existing = pubEntries.get(s.hero_id) ?? {}
    pubEntries.set(s.hero_id, { ...existing, recent: { wins: s.wins, losses: s.losses } })
  }
  for (const s of topHeroesOverall) {
    const existing = pubEntries.get(s.hero_id) ?? {}
    pubEntries.set(s.hero_id, { ...existing, overall: { wins: s.wins, losses: s.losses } })
  }
  const pub: HeroOption[] = Array.from(pubEntries.entries())
    .sort((a, b) => {
      const gamesA = (a[1].recent ? a[1].recent.wins + a[1].recent.losses : 0) + (a[1].overall ? a[1].overall.wins + a[1].overall.losses : 0)
      const gamesB = (b[1].recent ? b[1].recent.wins + b[1].recent.losses : 0) + (b[1].overall ? b[1].overall.wins + b[1].overall.losses : 0)
      return gamesB - gamesA
    })
    .map(([heroId, entry]) => {
      const parts: string[] = []
      if (entry.recent) parts.push(`${entry.recent.wins}-${entry.recent.losses} recent`)
      if (entry.overall) parts.push(`${entry.overall.wins}-${entry.overall.losses} overall`)
      return { heroId, label: `${getHero(heroId)} (${parts.join(", ")})` }
    })

  return { league, pub }
}

function getRelativeTime(isoString: string): string {
  if (!isoString) return "unknown"
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return "today"
  if (diffDays === 1) return "1 day ago"
  if (diffDays < 7) return `${diffDays} days ago`
  const diffWeeks = Math.floor(diffDays / 7)
  if (diffWeeks === 1) return "1 week ago"
  if (diffWeeks < 4) return `${diffWeeks} weeks ago`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths === 1) return "1 month ago"
  return `${diffMonths} months ago`
}

type RecordMap = Map<number, string>

function CounterSection({
  title,
  counters,
  records,
}: {
  title: string
  counters: HeroCounterRow[]
  records: RecordMap
}) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">{title}</div>
      <div className="space-y-1.5">
        {counters.map((c, i) => {
          const synPct = c.synergy.toFixed(2)
          const color =
            c.synergy > 2
              ? "text-green-500"
              : c.synergy >= 0
              ? "text-green-300"
              : c.synergy < -3
              ? "text-red-400"
              : c.synergy < -1.5
              ? "text-orange-400"
              : "text-yellow-400"
          const rec = records.get(c.counter_hero_id)
          return (
            <div key={c.counter_hero_id} className="flex items-center justify-between text-sm">
              <span className="text-slate-300">
                <span className="text-slate-500 mr-1.5">{i + 1}.</span>
                {getHero(c.counter_hero_id)}
                {rec && (
                  <span className="text-slate-500 ml-1.5">({rec})</span>
                )}
              </span>
              <span className={`font-medium ${color}`}>{synPct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Sub-component for each Team B position — can use hooks internally
function TeamBPositionCard({
  position,
  registeredPlayer,
  teamBMatches,
  teamBId,
  counterEntries,
}: {
  position: string
  registeredPlayer: PlayerRow | undefined
  teamBMatches: MatchApiResponse[]
  teamBId: number
  counterEntries: HeroCounterRow[]
}) {
  // Fetch pub stats for registered Team B player (skip if unregistered)
  const { data: pubData } = useGetPlayerPubMatchesQuery(
    { playerId: registeredPlayer?.id ?? 0 },
    { skip: !registeredPlayer }
  )

  // Build separate hero pools and records
  const leaguePool = new Set<number>()
  const leagueRecordsTmp = new Map<number, { wins: number; losses: number }>()

  for (const match of teamBMatches) {
    const won = match.winning_team_id === teamBId
    for (const player of match.players) {
      if (player.team_id === teamBId && player.position === position) {
        leaguePool.add(player.hero_id)
        const existing = leagueRecordsTmp.get(player.hero_id) ?? { wins: 0, losses: 0 }
        leagueRecordsTmp.set(player.hero_id, {
          wins: existing.wins + (won ? 1 : 0),
          losses: existing.losses + (won ? 0 : 1),
        })
      }
    }
  }
  const leagueRecords: RecordMap = new Map(
    Array.from(leagueRecordsTmp.entries()).map(([id, { wins, losses }]) => [id, `${wins}-${losses}`])
  )

  const pubPool = new Set<number>()
  const pubRecords: RecordMap = new Map()

  if (pubData?.data) {
    type PubRec = { recent?: { wins: number; losses: number }; overall?: { wins: number; losses: number } }
    const tmp = new Map<number, PubRec>()
    for (const s of pubData.data.recentMatches) {
      pubPool.add(s.hero_id)
      tmp.set(s.hero_id, { ...(tmp.get(s.hero_id) ?? {}), recent: { wins: s.wins, losses: s.losses } })
    }
    for (const s of pubData.data.topHeroesOverall) {
      pubPool.add(s.hero_id)
      tmp.set(s.hero_id, { ...(tmp.get(s.hero_id) ?? {}), overall: { wins: s.wins, losses: s.losses } })
    }
    for (const [heroId, entry] of tmp) {
      const parts: string[] = []
      if (entry.recent) parts.push(`${entry.recent.wins}-${entry.recent.losses} recent`)
      if (entry.overall) parts.push(`${entry.overall.wins}-${entry.overall.losses} overall`)
      pubRecords.set(heroId, parts.join(", "))
    }
  }

  const heroPool = new Set([...leaguePool, ...pubPool])

  const sortBySynergy = (a: HeroCounterRow, b: HeroCounterRow) => a.synergy - b.synergy

  const leagueCounters = counterEntries
    .filter(c => leaguePool.has(c.counter_hero_id))
    .sort(sortBySynergy)

  const pubCounters = counterEntries
    .filter(c => pubPool.has(c.counter_hero_id))
    .sort(sortBySynergy)

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold text-slate-300">
          {POSITION_LABELS[position]}
        </div>
        {registeredPlayer && (
          <div className="text-xs text-slate-400 mt-0.5">
            {registeredPlayer.name}
          </div>
        )}
        {heroPool.size > 0 && (
          <div className="text-xs text-slate-500 mt-0.5">
            {heroPool.size} heroes in pool
          </div>
        )}
      </div>

      {heroPool.size === 0 ? (
        <div className="text-xs text-slate-500">No hero pool data available</div>
      ) : (
        <div className="space-y-4">
          {leagueCounters.length > 0 && (
            <CounterSection title="League" counters={leagueCounters} records={leagueRecords} />
          )}
          {pubCounters.length > 0 && (
            <CounterSection title="Pubs" counters={pubCounters} records={pubRecords} />
          )}
          {leagueCounters.length === 0 && pubCounters.length === 0 && (
            <div className="text-xs text-slate-500">No counter data found</div>
          )}
        </div>
      )}
    </div>
  )
}

export const DraftCounters = ({ leagueId, teamId }: DraftCountersProps) => {
  const dispatch = useAppDispatch()

  // Redux state
  const selectedTeamBId = useAppSelector(selectSelectedTeamBId)
  const selectedPlayerId = useAppSelector(selectSelectedPlayerId)
  const selectedHeroId = useAppSelector(selectSelectedHeroId)
  const allCounters = useAppSelector(selectCounters)
  const allTeamBMatches = useAppSelector(selectTeamBMatches)
  const allTeamBPlayers = useAppSelector(selectTeamBPlayers)

  // Team A data via RTK Query
  const { data: matchesData } = useGetMatchesQuery({ leagueId, teamId })
  const { data: teamAPlayers = [] } = useGetPlayersByTeamQuery({ teamId })
  const { data: pubData } = useGetPlayerPubMatchesQuery(
    { playerId: selectedPlayerId ?? 0 },
    { skip: !selectedPlayerId }
  )
  const { data: teamsData } = useGetTeamsByLeagueQuery({ leagueId })

  // Fetch Team B data when selected
  useEffect(() => {
    if (selectedTeamBId) {
      void dispatch(fetchTeamBMatches({ leagueId, teamId: selectedTeamBId }))
      void dispatch(fetchTeamBPlayers(selectedTeamBId))
    }
  }, [dispatch, leagueId, selectedTeamBId])

  // Fetch counters when hero selected
  useEffect(() => {
    if (selectedHeroId) {
      void dispatch(fetchCounters(selectedHeroId))
    }
  }, [dispatch, selectedHeroId])

  // Build Team A hero options
  const heroOptions = buildTeamAHeroOptions(
    matchesData?.matches,
    selectedPlayerId,
    pubData?.data?.recentMatches ?? [],
    pubData?.data?.topHeroesOverall ?? []
  )

  // Counter state for selected hero
  const counterEntry = selectedHeroId ? allCounters[selectedHeroId] : undefined

  // Team B data
  const teamBMatchesEntry = selectedTeamBId
    ? allTeamBMatches[selectedTeamBId]
    : undefined
  const teamBPlayersEntry = selectedTeamBId
    ? allTeamBPlayers[selectedTeamBId]
    : undefined
  const teamBMatchesList = teamBMatchesEntry?.data ?? []
  const teamBPlayersList = teamBPlayersEntry?.data ?? []

  // All teams for dropdown (excluding Team A)
  const allTeams = teamsData?.[leagueId] ?? {}
  const teamBOptions = Object.entries(allTeams)
    .filter(([id]) => Number(id) !== teamId)
    .sort((a, b) => a[1].localeCompare(b[1]))

  // Sort team A players by role
  const roleOrder: Record<string, number> = {
    Carry: 1,
    Mid: 2,
    Offlane: 3,
    "Soft Support": 4,
    "Hard Support": 5,
  }
  const sortedTeamAPlayers = [...teamAPlayers].sort(
    (a, b) => (roleOrder[a.role] ?? 99) - (roleOrder[b.role] ?? 99)
  )

  const handleTeamBChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    dispatch(setSelectedTeamB(val ? Number(val) : undefined))
  }

  const handlePlayerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    dispatch(setSelectedPlayer(val ? Number(val) : undefined))
  }

  const handleHeroChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    dispatch(setSelectedHero(val ? Number(val) : undefined))
  }

  const handleRefresh = () => {
    if (selectedHeroId) {
      void dispatch(refreshCounters(selectedHeroId))
    }
  }

  const isCounterLoading = counterEntry?.status === "loading"

  return (
    <div className="space-y-6">
      {/* Selection row */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-4">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Team A player selector */}
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Team A Player
            </label>
            <select
              value={selectedPlayerId ?? ""}
              onChange={handlePlayerChange}
              className="bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500"
            >
              <option value="">Select player...</option>
              {sortedTeamAPlayers.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.role})
                </option>
              ))}
            </select>
          </div>

          {/* Hero selector */}
          <div className="flex flex-col gap-1 min-w-[220px]">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Hero
            </label>
            <select
              value={selectedHeroId ?? ""}
              onChange={handleHeroChange}
              disabled={!selectedPlayerId}
              className="bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Select hero...</option>
              {heroOptions.league.length > 0 && (
                <optgroup label="League">
                  {heroOptions.league.map(h => (
                    <option key={h.heroId} value={h.heroId}>{h.label}</option>
                  ))}
                </optgroup>
              )}
              {heroOptions.pub.length > 0 && (
                <optgroup label="Pubs">
                  {heroOptions.pub.map(h => (
                    <option key={h.heroId} value={h.heroId}>{h.label}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Team B selector */}
          <div className="flex flex-col gap-1 min-w-[220px]">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Team B (Opponent)
            </label>
            <select
              value={selectedTeamBId ?? ""}
              onChange={handleTeamBChange}
              className="bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500"
            >
              <option value="">Select opponent...</option>
              {teamBOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Counter display */}
      {selectedHeroId && selectedTeamBId && (
        <>
          {/* Status bar */}
          <div className="flex items-center gap-3">
            {counterEntry?.updatedAt && (
              <span className="text-xs text-slate-400">
                Counter data: {getRelativeTime(counterEntry.updatedAt)}
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={isCounterLoading}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 disabled:text-blue-400/50 disabled:cursor-not-allowed transition-colors"
            >
              <svg
                className={`w-3.5 h-3.5 ${
                  isCounterLoading ? "animate-spin" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh
            </button>
            {isCounterLoading && (
              <span className="text-xs text-slate-500">
                Fetching counter data...
              </span>
            )}
            {counterEntry?.status === "failed" && (
              <span className="text-xs text-red-400">
                Failed to load counter data
              </span>
            )}
          </div>

          {/* Position cards */}
          {counterEntry?.status === "loaded" || counterEntry?.data?.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {POSITION_ORDER.map(position => {
                const registeredPlayer = teamBPlayersList.find(
                  p => ROLE_TO_POSITION[p.role] === position
                )
                return (
                  <TeamBPositionCard
                    key={position}
                    position={position}
                    registeredPlayer={registeredPlayer}
                    teamBMatches={teamBMatchesList}
                    teamBId={selectedTeamBId}
                    counterEntries={counterEntry?.data ?? []}
                  />
                )
              })}
            </div>
          ) : isCounterLoading ? (
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-8 text-center">
              <div className="flex items-center justify-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
                <span className="text-slate-400">Loading counter data...</span>
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* Empty states */}
      {!selectedPlayerId && (
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-8 text-center">
          <div className="text-slate-400">
            Select a Team A player to get started
          </div>
        </div>
      )}

      {selectedPlayerId && !selectedHeroId && (
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-8 text-center">
          <div className="text-slate-400">
            Select a hero from the player's pool
          </div>
          {heroOptions.league.length === 0 && heroOptions.pub.length === 0 && (
            <div className="text-slate-500 text-sm mt-2">
              No hero data found. The player may have no matches.
            </div>
          )}
        </div>
      )}

      {selectedPlayerId && selectedHeroId && !selectedTeamBId && (
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-8 text-center">
          <div className="text-slate-400">
            Select an opponent team to see counters by position
          </div>
        </div>
      )}
    </div>
  )
}
