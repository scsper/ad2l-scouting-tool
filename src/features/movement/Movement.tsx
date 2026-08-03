import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { DotaMap } from "../../components/DotaMap"
import { useGetTeamsByLeagueQuery } from "../league-and-team-picker/teams-api"
import { getHero } from "../../utils/get-hero"
import {
  POSITION_LABELS,
  formatGameTime,
  positionColor,
} from "../../utils/ward-aggregation"
import { getMinimapForMatches } from "../../utils/ward-map"
import {
  binPlayer,
  decodeMatch,
  eventsNear,
  playersForTeam,
  positionBounds,
  type DecodedMatch,
} from "../../utils/movement"
import { HeatmapLayer, HeatmapLegend } from "./HeatmapLayer"
import {
  PlaybackEventList,
  PlaybackLayer,
  type HoveredHero,
} from "./PlaybackLayer"
import { useGetTeamPositionsQuery } from "./positions-api"

const panel =
  "bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg"

/** How long a drag has to settle before the URL is rewritten. */
const TIME_WRITE_DELAY_MS = 250

/** How far back playback markers trail the playhead. */
const EVENT_WINDOW_SECONDS = 20

const SIZE = 640

type Mode = "heatmap" | "playback"

function parseMode(value: string | null): Mode {
  return value === "playback" ? "playback" : "heatmap"
}

function parseNumber(value: string | null): number | null {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const Movement = ({
  leagueId,
  teamId,
}: {
  leagueId: number
  teamId: number
}) => {
  const { data, isLoading, isError } = useGetTeamPositionsQuery({
    leagueId,
    teamId,
  })
  const { data: teamsData } = useGetTeamsByLeagueQuery({ leagueId })

  const [searchParams, setSearchParams] = useSearchParams()
  const [hovered, setHovered] = useState<HoveredHero | null>(null)

  const mode = parseMode(searchParams.get("mode"))
  const urlPlayer = parseNumber(searchParams.get("player"))
  const urlMatch = searchParams.get("match")
  const urlFrom = parseNumber(searchParams.get("from"))
  const urlTo = parseNumber(searchParams.get("to"))
  const urlTime = parseNumber(searchParams.get("t"))

  /**
   * Filters live in the query string so a view can be pasted rather than
   * described. Params at their default are deleted, and every write replaces
   * rather than pushes — these change what you are looking at, not where you
   * are.
   */
  const updateFilters = (changes: Record<string, string | null>) => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) next.delete(key)
          else next.set(key, value)
        }
        return next
      },
      { replace: true },
    )
  }

  // The sliders track the drag; the URL lags behind. Browsers rate-limit history
  // writes, and one sweep of a 50-minute game would spend the whole allowance.
  const [draftTime, setDraftTime] = useState<number | null>(null)
  const [draftRange, setDraftRange] = useState<{
    from: number
    to: number
  } | null>(null)
  const pendingWrite = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    setDraftTime(null)
  }, [urlTime])
  useEffect(() => {
    setDraftRange(null)
  }, [urlFrom, urlTo])
  useEffect(
    () => () => {
      clearTimeout(pendingWrite.current)
    },
    [],
  )

  const matches = useMemo(() => data?.matches ?? [], [data])
  const events = useMemo(() => data?.events ?? [], [data])

  /**
   * Decoding is memoised on the fetched payload, not on the filters.
   *
   * A season is roughly 570,000 samples across twenty games. Decoding is fast
   * but not free, and it must not be redone every time the range slider moves —
   * only the binning should be.
   */
  const decoded = useMemo<DecodedMatch[]>(
    () => matches.map(decodeMatch),
    [matches],
  )

  const players = useMemo(
    () => playersForTeam(matches, teamId),
    [matches, teamId],
  )

  const bounds = useMemo(() => positionBounds(matches), [matches])

  /**
   * Default to the roster's most-played player rather than the first by
   * position, so the tab opens on the densest, most trustworthy heatmap it can.
   */
  const defaultPlayer = useMemo(
    () =>
      [...players].sort((a, b) => b.games - a.games).at(0)?.playerId ?? null,
    [players],
  )
  const selectedPlayer =
    urlPlayer !== null && players.some(p => p.playerId === urlPlayer)
      ? urlPlayer
      : defaultPlayer

  // Memoised because it is a fresh object literal every render, and it is a
  // dependency of the binning below — without this, dragging any other control
  // would re-bin half a million samples.
  const range = useMemo(
    () =>
      draftRange ?? { from: urlFrom ?? bounds.from, to: urlTo ?? bounds.to },
    [draftRange, urlFrom, urlTo, bounds],
  )

  const heatmap = useMemo(
    () =>
      selectedPlayer === null
        ? null
        : binPlayer(decoded, selectedPlayer, range),
    [decoded, selectedPlayer, range],
  )

  const selectedMatch =
    matches.find(m => String(m.id) === urlMatch) ?? matches.at(0)
  const decodedMatch = decoded.find(d => d.match.id === selectedMatch?.id)

  const matchBounds = decodedMatch
    ? {
        from: decodedMatch.match.firstTime,
        to: decodedMatch.match.firstTime + decodedMatch.match.sampleCount - 1,
      }
    : bounds
  const time = Math.min(
    matchBounds.to,
    Math.max(matchBounds.from, draftTime ?? urlTime ?? 0),
  )

  const visibleEvents = useMemo(
    () =>
      selectedMatch
        ? eventsNear(events, selectedMatch.id, time, EVENT_WINDOW_SECONDS)
        : [],
    [events, selectedMatch, time],
  )

  if (isLoading) {
    return (
      <div className={`${panel} p-6`}>
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
          <span className="text-slate-400">Loading movement data...</span>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-red-500/30 shadow-lg p-6">
        <div className="text-red-400">
          Error loading movement data. Please try again.
        </div>
      </div>
    )
  }

  if (matches.length === 0) {
    return (
      <div className={`${panel} p-12 text-center`}>
        <div className="text-slate-400 text-lg font-medium">
          No parsed replays for this team
        </div>
        <div className="text-slate-500 text-sm mt-2">
          Movement comes from replays we parse ourselves, not from OpenDota —
          their match API has no per-second data. Run{" "}
          <code className="text-slate-400">
            npm run parse-replays -- --league {String(leagueId)}
          </code>{" "}
          with odota/parser running locally.
        </div>
      </div>
    )
  }

  const teamName = teamsData?.[leagueId]?.[teamId]?.name ?? "This team"
  const minimap = getMinimapForMatches(matches.map(m => m.start_date_time))
  const player = players.find(p => p.playerId === selectedPlayer)
  const slotName = (slot: number | null) => {
    if (slot === null || !selectedMatch) return "?"
    const found = selectedMatch.slots.find(s => s.slot === slot)
    return found ? getHero(found.heroId) : "?"
  }

  const writeRangeSoon = (next: { from: number; to: number }) => {
    setDraftRange(next)
    clearTimeout(pendingWrite.current)
    pendingWrite.current = setTimeout(() => {
      updateFilters({ from: String(next.from), to: String(next.to) })
    }, TIME_WRITE_DELAY_MS)
  }

  return (
    <div className="space-y-4">
      <div className={`${panel} p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Movement · {teamName}
            </h2>
            <div className="text-sm text-slate-400 mt-0.5">
              {matches.length} game{matches.length === 1 ? "" : "s"} with
              per-second positions
            </div>
          </div>

          <div className="flex rounded overflow-hidden border border-slate-700">
            {(["heatmap", "playback"] as const).map(m => (
              <button
                key={m}
                onClick={() => {
                  updateFilters({ mode: m === "heatmap" ? null : m })
                }}
                className={`px-3 py-1 text-sm capitalize ${
                  mode === m
                    ? "bg-blue-600 text-white"
                    : "bg-slate-900 text-slate-400 hover:text-slate-200"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`${panel} p-4`}>
        {mode === "heatmap" ? (
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <select
              value={selectedPlayer === null ? "" : String(selectedPlayer)}
              onChange={e => {
                updateFilters({ player: e.target.value })
              }}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200"
            >
              {players.map(p => (
                <option key={p.playerId} value={String(p.playerId)}>
                  {p.name} ·{" "}
                  {p.position
                    ? (POSITION_LABELS[p.position] ?? p.position)
                    : "?"}{" "}
                  · {p.games} game{p.games === 1 ? "" : "s"}
                </option>
              ))}
            </select>
            <HeatmapLegend />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <select
              value={selectedMatch ? String(selectedMatch.id) : ""}
              onChange={e => {
                updateFilters({ match: e.target.value, t: null })
              }}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200"
            >
              {matches.map(m => (
                <option key={m.id} value={String(m.id)}>
                  {new Date(m.start_date_time * 1000).toLocaleDateString()} ·{" "}
                  {m.isRadiant ? "Radiant" : "Dire"} ·{" "}
                  {m.winning_team_id === teamId ? "W" : "L"} · {m.id}
                </option>
              ))}
            </select>
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-400" />
              {teamName}
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-400 ml-2" />
              Opponent
            </span>
          </div>
        )}

        <div className="flex justify-center">
          <DotaMap
            src={minimap.src}
            size={SIZE}
            label={
              mode === "heatmap"
                ? "Player position heatmap"
                : "Hero position playback"
            }
            overlay={
              hovered && (
                <div
                  className="absolute z-20 pointer-events-none w-max max-w-[15rem] rounded border border-slate-600 bg-slate-900/95 px-2.5 py-1.5 text-xs text-slate-300 shadow-lg"
                  style={{
                    left: `${String(hovered.x * 100)}%`,
                    top: `${String(hovered.y * 100)}%`,
                    transform: `translate(${
                      hovered.x > 0.6 ? "calc(-100% - 10px)" : "10px"
                    }, ${hovered.y < 0.25 ? "10px" : "calc(-100% - 10px)"})`,
                  }}
                >
                  <div className="font-medium text-slate-100">
                    {hovered.label}
                  </div>
                  <div>{hovered.detail}</div>
                </div>
              )
            }
          >
            {mode === "heatmap" && heatmap && (
              <HeatmapLayer heatmap={heatmap} size={SIZE} />
            )}
            {mode === "playback" && decodedMatch && (
              <PlaybackLayer
                decoded={decodedMatch}
                teamId={teamId}
                time={time}
                events={visibleEvents}
                size={SIZE}
                setHovered={setHovered}
              />
            )}
          </DotaMap>
        </div>

        {mode === "heatmap" ? (
          <div className="mt-4 px-2">
            <div className="flex flex-wrap items-center justify-between text-sm mb-1 gap-2">
              <span className="text-slate-400">
                {player ? (
                  <>
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                      style={{
                        backgroundColor: positionColor(player.position),
                      }}
                    />
                    <span className="text-slate-100">{player.name}</span> ·{" "}
                    {formatGameTime(range.from)} to {formatGameTime(range.to)}
                  </>
                ) : (
                  "No players"
                )}
              </span>
              {/*
                The game count sits next to the map at all times, deliberately.
                Some AD2L position slots were played by eight different people in
                a season; a two-game heatmap and a twenty-game one look identical
                once they are drawn, and only this number tells them apart.
              */}
              <span className="text-slate-500">
                {heatmap
                  ? `${String(heatmap.games)} game${heatmap.games === 1 ? "" : "s"} · ${String(Math.round(heatmap.samples / 60))} min alive`
                  : ""}
              </span>
            </div>
            <div className="space-y-1">
              <input
                type="range"
                min={bounds.from}
                max={bounds.to}
                step={5}
                value={range.from}
                onChange={e => {
                  const next = Math.min(Number(e.target.value), range.to - 1)
                  writeRangeSoon({ from: next, to: range.to })
                }}
                className="w-full accent-blue-500"
                aria-label="Range start"
              />
              <input
                type="range"
                min={bounds.from}
                max={bounds.to}
                step={5}
                value={range.to}
                onChange={e => {
                  const next = Math.max(Number(e.target.value), range.from + 1)
                  writeRangeSoon({ from: range.from, to: next })
                }}
                className="w-full accent-blue-500"
                aria-label="Range end"
              />
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {[
                { label: "All game", from: bounds.from, to: bounds.to },
                { label: "Laning (0-10)", from: 0, to: 600 },
                { label: "Mid (10-25)", from: 600, to: 1500 },
                { label: "Late (25+)", from: 1500, to: bounds.to },
              ].map(preset => (
                <button
                  key={preset.label}
                  onClick={() => {
                    clearTimeout(pendingWrite.current)
                    setDraftRange(null)
                    updateFilters({
                      from: String(preset.from),
                      to: String(preset.to),
                    })
                  }}
                  className="px-2 py-0.5 text-xs rounded border border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {heatmap && heatmap.games < 5 && heatmap.games > 0 && (
              <div className="mt-2 text-xs text-amber-400 text-center">
                Only {heatmap.games} game{heatmap.games === 1 ? "" : "s"} — this
                is one player&apos;s habits in a handful of games, not a
                tendency.
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 px-2">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-slate-400">
                Positions at{" "}
                <span className="text-slate-100 font-mono">
                  {formatGameTime(time)}
                </span>
              </span>
              <span className="text-slate-500">
                {selectedMatch
                  ? `vs ${
                      (selectedMatch.opponentTeamId !== null
                        ? teamsData?.[leagueId]?.[selectedMatch.opponentTeamId]
                            ?.name
                        : null) ?? "Unknown team"
                    }`
                  : ""}
              </span>
            </div>
            <input
              type="range"
              min={matchBounds.from}
              max={matchBounds.to}
              step={1}
              value={time}
              onChange={e => {
                const next = Number(e.target.value)
                setDraftTime(next)
                clearTimeout(pendingWrite.current)
                pendingWrite.current = setTimeout(() => {
                  updateFilters({ t: String(next) })
                }, TIME_WRITE_DELAY_MS)
              }}
              className="w-full accent-blue-500"
              aria-label="Game time"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-0.5">
              <span>{formatGameTime(matchBounds.from)}</span>
              <span>{formatGameTime(matchBounds.to)}</span>
            </div>
            <div className="mt-2 text-xs overflow-x-auto whitespace-nowrap">
              <PlaybackEventList events={visibleEvents} slotName={slotName} />
            </div>
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
          {mode === "heatmap" && <span> · time spent dead is excluded</span>}
        </div>
      </div>
    </div>
  )
}
