import { useMemo, useState } from "react"
import { useGetTeamsByLeagueQuery } from "../league-and-team-picker/teams-api"
import { getHero } from "../../utils/get-hero"
import {
  getMinimapForMatches,
  wardToFraction,
  wasDewarded,
} from "../../utils/ward-map"
import {
  POSITION_LABELS,
  collectWards,
  filterBySide,
  formatGameTime,
  getCoverage,
  getDefaultTime,
  getTimeBounds,
  positionColor,
  wardsAliveAt,
  type PlacedWard,
  type SideFilter,
} from "../../utils/ward-aggregation"
import { useGetMatchWardsQuery } from "./wards-api"

const ALL_GAMES = "all"

const panel =
  "bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg"

const WardDot = ({ placed, size }: { placed: PlacedWard; size: number }) => {
  const { x, y } = wardToFraction(placed.ward)
  const isObs = placed.ward.type === "obs"
  const r = isObs ? 6 : 3.5
  const dewarded = wasDewarded(placed.ward)
  const color = positionColor(placed.position)

  const title =
    `${placed.playerName ?? "Unknown"} (${getHero(placed.heroId)})\n` +
    `${isObs ? "Observer" : "Sentry"} placed ${formatGameTime(placed.ward.placed)}\n` +
    (placed.ward.left === null
      ? "Stood until the game ended"
      : `${dewarded ? "Destroyed" : "Expired"} ${formatGameTime(placed.ward.left)} after ${formatGameTime(placed.ward.left - placed.ward.placed)}` +
        (dewarded && placed.ward.by
          ? ` by ${placed.ward.by.replace(/_/g, " ")}`
          : "")) +
    `\nMatch ${String(placed.matchId)}`

  return (
    <g>
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
      >
        <title>{title}</title>
      </circle>
    </g>
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

  const [side, setSide] = useState<SideFilter>("all")
  const [selectedMatch, setSelectedMatch] = useState<string>(ALL_GAMES)
  const [showObs, setShowObs] = useState(true)
  const [showSen, setShowSen] = useState(false)
  const [time, setTime] = useState<number | null>(null)

  const allMatches = useMemo(() => data?.matches ?? [], [data])

  // Side filter first, then the game selector, so "All games" honours the side.
  const sideMatches = useMemo(
    () => filterBySide(allMatches, side),
    [allMatches, side],
  )
  const visibleMatches = useMemo(
    () =>
      selectedMatch === ALL_GAMES
        ? sideMatches
        : sideMatches.filter(m => String(m.id) === selectedMatch),
    [sideMatches, selectedMatch],
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

  const teamName = teamsData?.[leagueId]?.[teamId] ?? "This team"
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
              ward data ({coverage.radiant} Radiant / {coverage.dire} Dire)
              {missingWardData > 0 && (
                <span className="text-amber-400">
                  {" "}
                  · {missingWardData} without
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedMatch}
              onChange={e => {
                setSelectedMatch(e.target.value)
                setTime(null)
              }}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200"
            >
              <option value={ALL_GAMES}>
                All games ({sideMatches.length})
              </option>
              {sideMatches.map(m => (
                <option key={m.id} value={String(m.id)}>
                  {new Date(m.start_date_time * 1000).toLocaleDateString()} ·{" "}
                  {m.isRadiant ? "Radiant" : "Dire"} ·{" "}
                  {m.winning_team_id === teamId ? "W" : "L"} · {m.id}
                </option>
              ))}
            </select>

            <div className="flex rounded overflow-hidden border border-slate-700">
              {(["all", "radiant", "dire"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => {
                    setSide(s)
                    setSelectedMatch(ALL_GAMES)
                  }}
                  className={`px-3 py-1 text-sm capitalize ${
                    side === s
                      ? "bg-blue-600 text-white"
                      : "bg-slate-900 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {s === "all" ? "All" : `As ${s}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {coverage.withData === 0 ? (
        <div className={`${panel} p-12 text-center`}>
          <div className="text-slate-400 text-lg font-medium">
            No ward data for these games
          </div>
          <div className="text-slate-500 text-sm mt-2">
            Ward placements come from OpenDota&apos;s parsed replays. Matches
            entered by hand, or whose replay was never parsed, have none.
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
                  setShowObs(e.target.checked)
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
                  setShowSen(e.target.checked)
                }}
                className="accent-sky-400"
              />
              <span className="inline-block w-2 h-2 rounded-full bg-sky-400/60 border border-sky-300" />
              Sentries ({senTotal})
            </label>

            <div className="flex flex-wrap items-center gap-3 ml-auto text-xs text-slate-400">
              {Object.entries(POSITION_LABELS).map(([pos, label]) => (
                <span key={pos} className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: positionColor(pos) }}
                  />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex justify-center">
            <div style={{ width: size, maxWidth: "100%" }}>
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
                  />
                ))}
              </svg>
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
            <input
              type="range"
              min={bounds.min}
              max={bounds.max}
              step={5}
              value={clampedTime}
              onChange={e => {
                setTime(Number(e.target.value))
              }}
              className="w-full accent-blue-500"
              aria-label="Game time"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-0.5">
              <span>{formatGameTime(bounds.min)}</span>
              <span>{formatGameTime(bounds.max)}</span>
            </div>
          </div>

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
