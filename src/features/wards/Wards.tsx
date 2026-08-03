import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react"
import { useSearchParams } from "react-router"
import { useGetTeamsByLeagueQuery } from "../league-and-team-picker/teams-api"
import { getHero } from "../../utils/get-hero"
import {
  getMinimapForMatches,
  wardToFraction,
  wasDewarded,
} from "../../utils/ward-map"
import {
  POSITION_LEGEND,
  collectWards,
  filterBySide,
  formatGameTime,
  getCoverage,
  getDefaultTime,
  getTimeBounds,
  labelMatches,
  majoritySide,
  positionColor,
  wardsAliveAt,
  type PlacedWard,
  type SideFilter,
} from "../../utils/ward-aggregation"
import {
  collectRoshanKills,
  collectTormentorKills,
  collectTowerFalls,
  neutralTicks,
  towerTicks,
  withObjectiveData,
  type ObjectiveMoment,
} from "../../utils/objective-aggregation"
import type { PitSide } from "../../utils/dota-map"
import { useGetMatchObjectivesQuery } from "../objectives/objectives-api"
import { ObjectiveTicks } from "./ObjectiveTicks"
import {
  ENEMY_TOWER_COLOR,
  NeutralMark,
  OWN_TOWER_COLOR,
  ROSHAN_COLOR,
  ROSHAN_PITS,
  TORMENTOR_COLOR,
  TORMENTOR_SPOTS,
  TowerLayer,
  type HoveredObjective,
} from "./TowerLayer"
import { useGetMatchWardsQuery, type WardMatch } from "./wards-api"

/** How long a drag has to settle before the URL is rewritten. */
const TIME_WRITE_DELAY_MS = 250

/**
 * Anything unrecognised falls back to the team's majority side, which quietly
 * rescues links saved back when `side=all` existed.
 */
function parseSide(value: string | null, fallback: SideFilter): SideFilter {
  return value === "radiant" || value === "dire" ? value : fallback
}

/**
 * The games to aggregate, as a comma-separated id list.
 *
 * An absent param means every game on this side, so the common case stays a
 * clean URL; an empty one means none, which is a reachable state via Clear.
 * Ids are intersected with what is actually on this side rather than trusted,
 * so a stale link — or one carried across a side switch — degrades to the
 * games it can still show instead of an empty map.
 */
function parseMatchIds(value: string | null, available: WardMatch[]): number[] {
  const ids = available.map(m => m.id)
  if (value === null) return ids
  const wanted = new Set(
    value
      .split(",")
      .map(part => Number(part.trim()))
      .filter(n => Number.isFinite(n)),
  )
  return ids.filter(id => wanted.has(id))
}

/** Null when every game is on, which `updateFilters` drops from the URL. */
function serializeMatchIds(selected: number[], available: WardMatch[]) {
  return selected.length === available.length ? null : selected.join(",")
}

function parseTime(value: string | null): number | null {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const panel =
  "bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg"

const WardDot = ({
  placed,
  size,
  setHovered,
}: {
  placed: PlacedWard
  size: number
  setHovered: Dispatch<SetStateAction<PlacedWard | null>>
}) => {
  const { x, y } = wardToFraction(placed.ward)
  const isObs = placed.ward.type === "obs"
  const r = isObs ? 6 : 3.5
  const dewarded = wasDewarded(placed.ward)
  const color = positionColor(placed.position)

  return (
    <g
      onMouseEnter={() => {
        setHovered(placed)
      }}
      onMouseLeave={() => {
        // Only clear our own ward: sliding straight onto a neighbouring dot can
        // land its enter before this leave, and a blind reset would blank it.
        setHovered(prev => (prev === placed ? null : prev))
      }}
    >
      {/* Dark halo first: the terrain runs from bright jungle to near-black
          river, and a single flat colour disappears against one or the other. */}
      <circle
        cx={x * size}
        cy={y * size}
        r={r + 1.25}
        fill="none"
        stroke="#020617"
        strokeOpacity={0.85}
        strokeWidth={2}
      />
      <circle
        cx={x * size}
        cy={y * size}
        r={r}
        fill={color}
        fillOpacity={isObs ? 0.8 : 0.55}
        stroke="#f8fafc"
        strokeOpacity={0.9}
        strokeWidth={isObs ? 1.5 : 1}
        strokeDasharray={dewarded ? "2 1.5" : undefined}
      />
      {/* Invisible, generous hit area: a sentry is 3.5px across, which is a
          miserable hover target on a 640px map. */}
      <circle
        cx={x * size}
        cy={y * size}
        r={r + 4}
        fill="transparent"
        stroke="none"
      />
    </g>
  )
}

/**
 * Hover card for a single ward.
 *
 * An HTML overlay rather than SVG `<title>`: the native tooltip waits a second,
 * renders unstyled, and cannot be read at a glance while scrubbing the slider.
 */
const WardTooltip = ({
  placed,
  opponentName,
}: {
  placed: PlacedWard
  opponentName: string
}) => {
  const { x, y } = wardToFraction(placed.ward)
  const isObs = placed.ward.type === "obs"
  // Flip near the edges so the card never spills off the map.
  const flipX = x > 0.6
  const flipY = y < 0.25

  return (
    <div
      className="absolute z-10 pointer-events-none w-max max-w-[15rem] rounded border border-slate-600 bg-slate-900/95 px-2.5 py-1.5 text-xs text-slate-300 shadow-lg"
      style={{
        left: `${String(x * 100)}%`,
        top: `${String(y * 100)}%`,
        transform: `translate(${flipX ? "calc(-100% - 10px)" : "10px"}, ${
          flipY ? "10px" : "calc(-100% - 10px)"
        })`,
      }}
    >
      <div className="font-medium text-slate-100">
        {isObs ? "Observer" : "Sentry"} placed at{" "}
        {formatGameTime(placed.ward.placed)}
      </div>
      <div>
        {placed.playerName ?? "Unknown"} - {getHero(placed.heroId)}
      </div>
      <div>
        {new Date(placed.startDateTime * 1000).toLocaleDateString()} - vs{" "}
        {opponentName}
      </div>
    </div>
  )
}

/**
 * One game in the selection row.
 *
 * Games OpenDota never ward-parsed are shown disabled rather than hidden. A
 * missing chip would make the count here silently disagree with the match list,
 * and when the whole point is comparing subsets, it matters whether a sample is
 * small because they played four games or because two failed to parse.
 */
const GameChip = ({
  match,
  label,
  isWin,
  selected,
  onToggle,
}: {
  match: WardMatch
  label: string
  isWin: boolean
  selected: boolean
  onToggle: () => void
}) => {
  if (!match.hasWardData) {
    return (
      <span
        className="rounded border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-500 opacity-50 cursor-not-allowed"
        title={`Match ${String(match.id)} — replay never parsed, no ward data`}
      >
        {label} · no data
      </span>
    )
  }

  return (
    <button
      onClick={onToggle}
      aria-pressed={selected}
      title={`Match ${String(match.id)}`}
      className={`rounded border px-2 py-1 text-xs ${
        selected
          ? "bg-blue-600 border-blue-500 text-white"
          : "bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300"
      }`}
    >
      {label} ·{" "}
      <span className={isWin ? "text-emerald-300" : "text-rose-300"}>
        {isWin ? "W" : "L"}
      </span>
    </button>
  )
}

export const Wards = ({
  leagueId,
  teamId,
}: {
  leagueId: number
  teamId: number
}) => {
  const { data, isLoading, isError } = useGetMatchWardsQuery({
    leagueId,
    teamId,
  })
  const { data: teamsData, isLoading: isLoadingTeams } =
    useGetTeamsByLeagueQuery({ leagueId })
  // Objectives ride alongside rather than blocking: the ward map is useful
  // without tower marks, so a slow or failed objective fetch must not hold up
  // the thing the tab is named after.
  const { data: objectivesData } = useGetMatchObjectivesQuery({
    leagueId,
    teamId,
  })

  const [searchParams, setSearchParams] = useSearchParams()
  const [hovered, setHovered] = useState<PlacedWard | null>(null)
  const [hoveredObjective, setHoveredObjective] =
    useState<HoveredObjective | null>(null)

  const allMatches = useMemo(() => data?.matches ?? [], [data])

  // Side is resolved before anything else: with no "both" option it decides
  // which games even exist to be toggled.
  const defaultSide = useMemo(() => majoritySide(allMatches), [allMatches])
  const side = parseSide(searchParams.get("side"), defaultSide)
  const sideMatches = useMemo(
    () => filterBySide(allMatches, side),
    [allMatches, side],
  )
  const selectedIds = useMemo(
    () => parseMatchIds(searchParams.get("match"), sideMatches),
    [searchParams, sideMatches],
  )

  const showObs = searchParams.get("obs") !== "0"
  const showSen = searchParams.get("sen") === "1"
  const showTowers = searchParams.get("towers") !== "0"
  const urlTime = parseTime(searchParams.get("t"))

  /**
   * The filters live in the query string so a ward view can be pasted to
   * someone rather than described to them.
   *
   * A param at its default is deleted rather than written, which keeps the
   * common URL short enough to read. Every write replaces rather than pushes:
   * these change what you are looking at, not where you are, and back should
   * return you to the tab you came from instead of stepping you back through
   * four toggles.
   */
  const updateFilters = (changes: Record<string, string | null>) => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev)
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

  // The slider tracks the drag; the URL deliberately lags behind it. Browsers
  // rate-limit history writes, and one sweep of a 60-minute game would spend
  // the whole allowance.
  const [draftTime, setDraftTime] = useState<number | null>(null)
  const pendingTimeWrite = useRef<ReturnType<typeof setTimeout>>(undefined)

  // By the time the debounced write lands, the URL holds the value being
  // dragged to, so dropping the draft changes nothing on screen. Back and
  // forward land here too, which is what lets them move the slider.
  useEffect(() => {
    setDraftTime(null)
  }, [urlTime])

  useEffect(
    () => () => {
      clearTimeout(pendingTimeWrite.current)
    },
    [],
  )

  const time = draftTime ?? urlTime

  const visibleMatches = useMemo(() => {
    const wanted = new Set(selectedIds)
    return sideMatches.filter(m => wanted.has(m.id))
  }, [sideMatches, selectedIds])

  const chipLabels = useMemo(
    () =>
      labelMatches(sideMatches, m => {
        const opponentId = m.isRadiant ? m.dire_team_id : m.radiant_team_id
        const opponent =
          (opponentId !== null
            ? teamsData?.[leagueId]?.[opponentId]?.name
            : null) ?? "Unknown"
        const date = new Date(m.start_date_time * 1000).toLocaleDateString(
          undefined,
          { month: "numeric", day: "numeric" },
        )
        return `${date} vs ${opponent}`
      }),
    [sideMatches, teamsData, leagueId],
  )

  const coverage = useMemo(() => getCoverage(visibleMatches), [visibleMatches])
  const bounds = useMemo(() => getTimeBounds(visibleMatches), [visibleMatches])
  const wards = useMemo(() => collectWards(visibleMatches), [visibleMatches])

  // Open on the laning-stage peak rather than a fixed time, so the first view is
  // never a near-empty map. An explicit drag always wins.
  const defaultTime = useMemo(
    () => getDefaultTime(wards, { obs: showObs, sen: showSen }, bounds),
    [wards, showObs, showSen, bounds],
  )
  const clampedTime = Math.min(
    bounds.max,
    Math.max(bounds.min, time ?? defaultTime),
  )

  const visibleWards = useMemo(
    () => wardsAliveAt(wards, clampedTime, { obs: showObs, sen: showSen }),
    [wards, clampedTime, showObs, showSen],
  )

  const obsTotal = wards.filter(w => w.ward.type === "obs").length
  const senTotal = wards.filter(w => w.ward.type === "sen").length

  // A tower cannot be drawn both standing and destroyed, so the map layer and
  // the neutral ticks stay gated on there being exactly one game to describe —
  // which is now reached by toggling chips off rather than picking from a list.
  const isSingleGame = selectedIds.length === 1

  // Objective matches are filtered by the same two stages as the wards, so the
  // tower marks always describe the games on screen.
  const visibleObjectiveMatches = useMemo(() => {
    const wanted = new Set(selectedIds)
    return (objectivesData?.matches ?? []).filter(
      m =>
        (side === "radiant" ? m.isRadiant : !m.isRadiant) && wanted.has(m.id),
    )
  }, [objectivesData, side, selectedIds])

  const objectiveTicks = useMemo(() => {
    if (!showTowers) return []
    const towers = towerTicks(visibleObjectiveMatches, isSingleGame)
    // Roshan and Tormentor have no shared slot to average onto, so they only
    // appear when a single game is selected.
    return isSingleGame
      ? [...towers, ...neutralTicks(visibleObjectiveMatches)].sort(
          (a, b) => a.time - b.time,
        )
      : towers
  }, [visibleObjectiveMatches, isSingleGame, showTowers])

  // The map layer is single-game only: a tower cannot be drawn both standing and
  // destroyed, which is what an aggregate would ask of it.
  const singleObjectiveMatch =
    isSingleGame && visibleObjectiveMatches.length === 1
      ? withObjectiveData(visibleObjectiveMatches)[0]
      : undefined

  const towerFalls = useMemo(
    () =>
      singleObjectiveMatch ? collectTowerFalls([singleObjectiveMatch]) : [],
    [singleObjectiveMatch],
  )

  const objectiveCount = objectiveTicks.filter(t => t.kind === "tower").length

  /**
   * The most recent Roshan and Tormentor kill at or before the current time.
   *
   * Marked where it was taken rather than where the creature currently stands:
   * the question this tab answers is what their vision looked like around an
   * objective, so the pit that matters is the one that was just fought over.
   * `pit` is null on pre-7.41 games, and those are skipped rather than guessed.
   */
  const lastNeutral = useMemo(() => {
    const pick = (moments: ObjectiveMoment[]) => {
      const past = moments
        .filter(
          (m): m is ObjectiveMoment & { pit: PitSide } =>
            m.time <= clampedTime && m.pit !== null,
        )
        .sort((a, b) => b.time - a.time)
      if (past.length === 0) return null
      const latest = past[0]
      return {
        pit: latest.pit,
        detail: `Taken by ${latest.takenByTeam ? "them" : "the opponent"} at ${formatGameTime(latest.time)}`,
      }
    }

    if (!singleObjectiveMatch) return { roshan: null, tormentor: null }
    return {
      roshan: pick(collectRoshanKills([singleObjectiveMatch])),
      tormentor: pick(collectTormentorKills([singleObjectiveMatch])),
    }
  }, [singleObjectiveMatch, clampedTime])

  /** Seeking from a tick writes the URL immediately — it is a deliberate jump to
   *  a named moment, not a drag, so there is no history flood to debounce. */
  const seekTo = (next: number) => {
    clearTimeout(pendingTimeWrite.current)
    setDraftTime(next)
    updateFilters({ t: String(next) })
  }

  /**
   * Changing which games are on holds the clock still.
   *
   * The point of toggling games is to compare the same moment across two sets,
   * and letting the slider snap back to each set's own laning peak would answer
   * a different question every click. The current time is written explicitly
   * rather than left implicit, so an untouched slider stops drifting as soon as
   * the first comparison starts. Out-of-range values are clamped on render.
   */
  const selectGames = (ids: number[]) => {
    updateFilters({
      match: serializeMatchIds(ids, sideMatches),
      t: String(clampedTime),
    })
  }

  /** Radiant and Dire games are disjoint sets, so the selection resets — but
   *  the clock does not: the same minute on either side is the sharpest A/B. */
  const selectSide = (next: SideFilter) => {
    updateFilters({
      side: next === defaultSide ? null : next,
      match: null,
      t: String(clampedTime),
    })
  }

  if (isLoading || isLoadingTeams) {
    return (
      <div className={`${panel} p-6`}>
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
          <span className="text-slate-400">Loading ward data...</span>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-red-500/30 shadow-lg p-6">
        <div className="text-red-400">
          Error loading ward data. Please try again.
        </div>
      </div>
    )
  }

  if (allMatches.length === 0) {
    return (
      <div className={`${panel} p-12 text-center`}>
        <div className="text-slate-400 text-lg font-medium">
          No parsed games for this team
        </div>
        <div className="text-slate-500 text-sm mt-2">
          Ward maps are built from parsed matches. Paste this team&apos;s match
          IDs into Parse Matches to scout them.
        </div>
      </div>
    )
  }

  const teamName = teamsData?.[leagueId]?.[teamId]?.name ?? "This team"
  const size = 640
  const minimap = getMinimapForMatches(
    visibleMatches.filter(m => m.hasWardData).map(m => m.start_date_time),
  )
  const missingWardData = coverage.total - coverage.withData

  return (
    <div className="space-y-4">
      <div className={`${panel} p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Wards · {teamName}
            </h2>
            <div className="text-sm text-slate-400 mt-0.5">
              {coverage.withData} game{coverage.withData === 1 ? "" : "s"} with
              ward data
              {missingWardData > 0 && (
                <span className="text-amber-400">
                  {" "}
                  · {missingWardData} without
                </span>
              )}
            </div>
          </div>

          <div className="flex rounded overflow-hidden border border-slate-700">
            {(["radiant", "dire"] as const).map(s => (
              <button
                key={s}
                onClick={() => {
                  selectSide(s)
                }}
                className={`px-3 py-1 text-sm capitalize ${
                  side === s
                    ? "bg-blue-600 text-white"
                    : "bg-slate-900 text-slate-400 hover:text-slate-200"
                }`}
              >
                As {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-700">
          <button
            onClick={() => {
              selectGames(sideMatches.map(m => m.id))
            }}
            className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2"
          >
            Select all
          </button>
          <button
            onClick={() => {
              selectGames([])
            }}
            className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2 mr-1"
          >
            Clear
          </button>
          {sideMatches.map(m => (
            <GameChip
              key={m.id}
              match={m}
              label={chipLabels.get(m.id) ?? String(m.id)}
              isWin={m.winning_team_id === teamId}
              selected={selectedIds.includes(m.id)}
              onToggle={() => {
                selectGames(
                  selectedIds.includes(m.id)
                    ? selectedIds.filter(id => id !== m.id)
                    : [...selectedIds, m.id],
                )
              }}
            />
          ))}
        </div>
      </div>

      {coverage.withData === 0 ? (
        <div className={`${panel} p-12 text-center`}>
          <div className="text-slate-400 text-lg font-medium">
            {sideMatches.length === 0
              ? `No games as ${side}`
              : selectedIds.length === 0
                ? "No games selected"
                : "No ward data for these games"}
          </div>
          <div className="text-slate-500 text-sm mt-2">
            {sideMatches.length === 0
              ? "This team has not played this side in the games on record."
              : selectedIds.length === 0
                ? "Pick a game above, or Select all to see them together."
                : "Ward placements come from OpenDota's parsed replays. Matches entered by hand, or whose replay was never parsed, have none."}
          </div>
        </div>
      ) : (
        <div className={`${panel} p-4`}>
          <div className="flex flex-wrap items-center gap-4 mb-3">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showObs}
                onChange={e => {
                  updateFilters({ obs: e.target.checked ? null : "0" })
                }}
                className="accent-amber-400"
              />
              <span className="inline-block w-3 h-3 rounded-full bg-amber-400/60 border border-amber-300" />
              Observers ({obsTotal})
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showSen}
                onChange={e => {
                  updateFilters({ sen: e.target.checked ? "1" : null })
                }}
                className="accent-sky-400"
              />
              <span className="inline-block w-2 h-2 rounded-full bg-sky-400/60 border border-sky-300" />
              Sentries ({senTotal})
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showTowers}
                onChange={e => {
                  updateFilters({ towers: e.target.checked ? null : "0" })
                }}
                className="accent-rose-400"
              />
              <span
                className="inline-block w-2.5 h-2.5 border"
                style={{
                  borderColor: OWN_TOWER_COLOR,
                  backgroundColor: `${OWN_TOWER_COLOR}66`,
                }}
              />
              Towers ({objectiveCount})
            </label>

            <div className="flex flex-wrap items-center gap-3 ml-auto text-xs text-slate-400">
              {showTowers && (
                <>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-2.5 h-2.5 border"
                      style={{
                        borderColor: OWN_TOWER_COLOR,
                        backgroundColor: `${OWN_TOWER_COLOR}66`,
                      }}
                    />
                    Their towers
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-2.5 h-2.5 border"
                      style={{
                        borderColor: ENEMY_TOWER_COLOR,
                        backgroundColor: `${ENEMY_TOWER_COLOR}66`,
                      }}
                    />
                    Enemy towers
                  </span>
                </>
              )}
              {POSITION_LEGEND.map(({ label, color }) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex justify-center">
            <div className="relative" style={{ width: size, maxWidth: "100%" }}>
              <svg
                viewBox={`0 0 ${String(size)} ${String(size)}`}
                width="100%"
                className="rounded border border-slate-700 bg-slate-900"
                role="img"
                aria-label="Ward placement map"
              >
                <image
                  href={minimap.src}
                  x={0}
                  y={0}
                  width={size}
                  height={size}
                />
                {visibleWards.map((placed, i) => (
                  <WardDot
                    key={`${String(placed.matchId)}-${String(placed.ward.placed)}-${placed.ward.type}-${String(i)}`}
                    placed={placed}
                    size={size}
                    setHovered={setHovered}
                  />
                ))}
                {showTowers && singleObjectiveMatch && (
                  <>
                    <TowerLayer
                      falls={towerFalls}
                      time={clampedTime}
                      size={size}
                      teamSide={
                        singleObjectiveMatch.isRadiant ? "radiant" : "dire"
                      }
                      onHover={setHoveredObjective}
                    />
                    {lastNeutral.roshan && (
                      <NeutralMark
                        pit={lastNeutral.roshan.pit}
                        spots={ROSHAN_PITS}
                        size={size}
                        color={ROSHAN_COLOR}
                        label="Roshan"
                        detail={lastNeutral.roshan.detail}
                        onHover={setHoveredObjective}
                      />
                    )}
                    {lastNeutral.tormentor && (
                      <NeutralMark
                        pit={lastNeutral.tormentor.pit}
                        spots={TORMENTOR_SPOTS}
                        size={size}
                        color={TORMENTOR_COLOR}
                        label="Tormentor"
                        detail={lastNeutral.tormentor.detail}
                        onHover={setHoveredObjective}
                      />
                    )}
                  </>
                )}
              </svg>
              {hoveredObjective && (
                <div
                  className="absolute z-20 pointer-events-none w-max max-w-[15rem] rounded border border-slate-600 bg-slate-900/95 px-2.5 py-1.5 text-xs text-slate-300 shadow-lg"
                  style={{
                    left: `${String(hoveredObjective.x * 100)}%`,
                    top: `${String(hoveredObjective.y * 100)}%`,
                    transform: `translate(${
                      hoveredObjective.x > 0.6 ? "calc(-100% - 10px)" : "10px"
                    }, ${
                      hoveredObjective.y < 0.25 ? "10px" : "calc(-100% - 10px)"
                    })`,
                  }}
                >
                  <div className="font-medium text-slate-100">
                    {hoveredObjective.label}
                  </div>
                  <div>{hoveredObjective.detail}</div>
                </div>
              )}
              {hovered && (
                <WardTooltip
                  placed={hovered}
                  opponentName={
                    (hovered.opponentTeamId !== null
                      ? teamsData?.[leagueId]?.[hovered.opponentTeamId]?.name
                      : null) ?? "Unknown team"
                  }
                />
              )}
            </div>
          </div>

          <div className="mt-4 px-2">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-slate-400">
                Vision standing at{" "}
                <span className="text-slate-100 font-mono">
                  {formatGameTime(clampedTime)}
                </span>
              </span>
              <span className="text-slate-500">
                {visibleWards.length} ward
                {visibleWards.length === 1 ? "" : "s"} up
              </span>
            </div>
            {showTowers && (
              <ObjectiveTicks
                ticks={objectiveTicks}
                bounds={bounds}
                aggregate={!isSingleGame}
                onSeek={seekTo}
              />
            )}
            <input
              type="range"
              min={bounds.min}
              max={bounds.max}
              step={5}
              value={clampedTime}
              onChange={e => {
                const next = Number(e.target.value)
                setDraftTime(next)
                clearTimeout(pendingTimeWrite.current)
                pendingTimeWrite.current = setTimeout(() => {
                  updateFilters({ t: String(next) })
                }, TIME_WRITE_DELAY_MS)
              }}
              className="w-full accent-blue-500"
              aria-label="Game time"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-0.5">
              <span>{formatGameTime(bounds.min)}</span>
              <span>{formatGameTime(bounds.max)}</span>
            </div>
          </div>

          {showTowers && !isSingleGame && objectiveTicks.length > 0 && (
            <div className="mt-2 text-xs text-slate-500 text-center">
              Tower marks show median fall times across these games. Narrow to a
              single game to see them on the map.
            </div>
          )}

          <div className="mt-3 text-xs text-slate-500 text-center">
            Map: patch {minimap.patch}
            {minimap.isFallback && (
              <span className="text-amber-400">
                {" "}
                — no map image published for a newer patch, terrain may differ
              </span>
            )}
            {minimap.isMixed && (
              <span className="text-amber-400">
                {" "}
                — these games span a terrain change
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
