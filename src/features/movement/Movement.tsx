import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { DotaMap } from "../../components/DotaMap"
import { useGetTeamsByLeagueQuery } from "../league-and-team-picker/teams-api"
import { getHero } from "../../utils/get-hero"
import { POSITION_LABELS, formatGameTime } from "../../utils/ward-aggregation"
import { getMinimapForMatches } from "../../utils/ward-map"
import {
  binPlayer,
  confidenceFor,
  decodeMatch,
  eventsNear,
  filterBySide,
  majoritySide,
  playersForTeam,
  positionBounds,
  type DecodedMatch,
  type MovementSide,
} from "../../utils/movement"
import {
  activeNeutralsAt,
  eventsToWards,
  neutralKillsFromEvents,
  towerFallsFromEvents,
} from "../../utils/playback-objects"
import {
  ENEMY_COLOR,
  OBSERVER_COLOR,
  SCOUTED_COLOR,
  SENTRY_COLOR,
} from "../../utils/map-colors"
import { TowerLayer } from "../wards/TowerLayer"
import { HeatmapLayer, HeatmapLegend } from "./HeatmapLayer"
import {
  PlaybackEventList,
  PlaybackLayer,
  towerHoverAdapter,
  type HoveredMark,
} from "./PlaybackLayer"
import { useGetTeamPositionsQuery } from "./positions-api"

const panel =
  "bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg"

/**
 * The windows a scouting question is actually asked in.
 *
 * `to: null` means "to the end of the game", which is clamped against the real
 * bounds at render — a 22-minute stomp has no late game to show.
 */
const PHASES: { label: string; from: number; to: number | null }[] = [
  { label: "Laning", from: 0, to: 600 },
  { label: "Mid", from: 600, to: 1200 },
  { label: "Late", from: 1200, to: null },
  { label: "Full", from: 0, to: null },
]

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

/**
 * Anything unrecognised falls back to the team's majority side, which also
 * quietly rescues links saved before the side control existed.
 */
function parseSide(value: string | null, fallback: MovementSide): MovementSide {
  return value === "radiant" || value === "dire" ? value : fallback
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
  const [hovered, setHovered] = useState<HoveredMark | null>(null)

  const mode = parseMode(searchParams.get("mode"))
  /*
   * Same URL keys and same defaults-omitted encoding as the Wards tab, with one
   * deliberate difference: sentries default ON here.
   *
   * There they are off because the map is an aggregate, where sixty sentries
   * across eight games is texture. Playback draws only what is standing at the
   * playhead — two to four sentries — and the deward interaction it exposes,
   * their support walking to a spot because a sentry died there twenty seconds
   * earlier, is the best thing this map can show. Defaulting it off would hide
   * the payoff.
   */
  const showObs = searchParams.get("obs") !== "0"
  const showSen = searchParams.get("sen") !== "0"
  const showTowers = searchParams.get("towers") !== "0"
  const urlPlayer = parseNumber(searchParams.get("player"))
  const urlSide = searchParams.get("side")
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

  /**
   * Whether the two range handles are on show. Opened by the Custom chip, and
   * left closed by default — a link carrying a hand-picked window still renders
   * that window, it just doesn't open the sliders to say so.
   */
  const [isCustomRange, setIsCustomRange] = useState(false)
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

  /**
   * Side is resolved before anything else, because everything the heatmap shows
   * is scoped to it — the games binned, the roster's counts, and the confidence
   * those counts imply.
   */
  const defaultSide = useMemo(() => majoritySide(matches), [matches])
  const side = parseSide(urlSide, defaultSide)

  const sideMatches = useMemo(
    () => filterBySide(matches, side),
    [matches, side],
  )
  const sideDecoded = useMemo(
    () =>
      decoded.filter(d =>
        side === "radiant" ? d.match.isRadiant : !d.match.isRadiant,
      ),
    [decoded, side],
  )

  // Given ALL matches, not the side-filtered set: a player who never played this
  // side still belongs in the picker, disabled, showing what the other side has.
  const players = useMemo(
    () => playersForTeam(matches, teamId, side),
    [matches, teamId, side],
  )

  // Bounds stay across both sides so the range slider does not jump when you
  // switch — the window you chose is a question about the game clock, not about
  // which side they happened to be on.
  const bounds = useMemo(() => positionBounds(matches), [matches])

  /**
   * Default to the roster's most-played player rather than the first by
   * position, so the tab opens on the densest, most trustworthy heatmap it can.
   */
  /**
   * Prefer whoever has the most games on this side, but fall back to the first
   * of the roster when nobody played it at all. Resolving to null instead would
   * render neither a heatmap nor the message explaining why — a blank tab that
   * looks broken rather than empty.
   */
  const defaultPlayer = useMemo(
    () =>
      [...players]
        .filter(p => p.games > 0)
        .sort((a, b) => b.games - a.games)
        .at(0)?.playerId ??
      players.at(0)?.playerId ??
      null,
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
        : binPlayer(sideDecoded, selectedPlayer, range),
    [sideDecoded, selectedPlayer, range],
  )

  const confidence = confidenceFor(heatmap?.games ?? 0)

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

  /*
   * The whole game's events, unlike `visibleEvents`.
   *
   * Wards, towers and objectives are state rather than moments: whether a ward
   * is standing at 20:00 depends on a placement at 17:30 and a removal at
   * 21:00, both far outside the twenty-second marker window. `eventsNear` also
   * drops rows without coordinates, which is every building kill.
   */
  const matchEvents = useMemo(
    () =>
      selectedMatch ? events.filter(e => e.matchId === selectedMatch.id) : [],
    [events, selectedMatch],
  )

  const wards = useMemo(
    () =>
      selectedMatch ? eventsToWards(matchEvents, selectedMatch.isRadiant) : [],
    [matchEvents, selectedMatch],
  )
  const visibleWards = useMemo(
    () => wards.filter(w => (w.ward.type === "obs" ? showObs : showSen)),
    [wards, showObs, showSen],
  )

  const towerFalls = useMemo(
    () =>
      selectedMatch
        ? towerFallsFromEvents(
            matchEvents,
            selectedMatch.id,
            selectedMatch.isRadiant,
          )
        : [],
    [matchEvents, selectedMatch],
  )

  const neutralKills = useMemo(
    () =>
      selectedMatch
        ? neutralKillsFromEvents(matchEvents, selectedMatch.isRadiant)
        : [],
    [matchEvents, selectedMatch],
  )
  const activeNeutrals = useMemo(
    () => (showTowers ? activeNeutralsAt(neutralKills, time) : []),
    [neutralKills, time, showTowers],
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

  /**
   * Move the playhead, clamped to the game.
   *
   * Extracted because the slider is no longer the only thing that moves it: a
   * 40-minute game on a 350px track is about seven seconds per pixel, so
   * stepping is the only way to land on a specific moment with a thumb. The
   * track's width is the constraint, and no amount of slider polish changes it.
   */
  const seek = (next: number) => {
    const clamped = Math.min(matchBounds.to, Math.max(matchBounds.from, next))
    setDraftTime(clamped)
    clearTimeout(pendingWrite.current)
    pendingWrite.current = setTimeout(() => {
      updateFilters({ t: String(clamped) })
    }, TIME_WRITE_DELAY_MS)
  }

  const STEPS = [-30, -10, 10, 30]

  /**
   * The transport, built once and rendered twice — under the map on the page,
   * and again inside the full-screen inspector. Zooming into a fight and then
   * having to close the overlay to advance five seconds means never zooming
   * during playback at all, which is exactly when it is most useful.
   */
  const playbackControls = (
    <div className="flex items-center gap-2">
      {STEPS.slice(0, 2).map(step => (
        <button
          key={step}
          onClick={() => {
            seek(time + step)
          }}
          className="shrink-0 px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-xs text-slate-300 tabular-nums"
        >
          {String(step)}s
        </button>
      ))}
      <input
        type="range"
        min={matchBounds.from}
        max={matchBounds.to}
        step={1}
        value={time}
        onChange={e => {
          seek(Number(e.target.value))
        }}
        className="w-full accent-blue-500"
        aria-label="Game time"
      />
      {STEPS.slice(2).map(step => (
        <button
          key={step}
          onClick={() => {
            seek(time + step)
          }}
          className="shrink-0 px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-xs text-slate-300 tabular-nums"
        >
          +{String(step)}s
        </button>
      ))}
    </div>
  )

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
              {mode === "heatmap" &&
                ` · ${String(sideMatches.length)} as ${side}`}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/*
              Side only appears for the heatmap. Playback shows one game, which
              has exactly one side and says so in the dropdown; gating that list
              would hide half the season for no correctness gain.
            */}
            {mode === "heatmap" && (
              <div className="flex rounded overflow-hidden border border-slate-700">
                {(["radiant", "dire"] as const).map(s2 => (
                  <button
                    key={s2}
                    onClick={() => {
                      updateFilters({ side: s2 === defaultSide ? null : s2 })
                    }}
                    className={`px-3 py-1 text-sm capitalize ${
                      side === s2
                        ? "bg-blue-600 text-white"
                        : "bg-slate-900 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    As {s2}
                  </button>
                ))}
              </div>
            )}
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
                <option
                  key={p.playerId}
                  value={String(p.playerId)}
                  // Listed but unselectable rather than hidden, following the
                  // ward game chips: a roster that silently shrinks as you
                  // switch sides hides the fact that a better sample is one
                  // click away.
                  disabled={p.games === 0}
                >
                  {p.name} ·{" "}
                  {p.position
                    ? (POSITION_LABELS[p.position] ?? p.position)
                    : "?"}{" "}
                  · {p.radiantGames}R / {p.direGames}D
                  {p.games === 0 ? " — none as " + side : ""}
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
            <label className="flex items-center gap-1.5 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showObs}
                onChange={e => {
                  updateFilters({ obs: e.target.checked ? null : "0" })
                }}
                style={{ accentColor: OBSERVER_COLOR }}
              />
              <span
                className="inline-block w-3 h-3 rounded-full border"
                style={{
                  backgroundColor: `${OBSERVER_COLOR}cc`,
                  borderColor: OBSERVER_COLOR,
                }}
              />
              Obs
            </label>
            <label className="flex items-center gap-1.5 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showSen}
                onChange={e => {
                  updateFilters({ sen: e.target.checked ? null : "0" })
                }}
                style={{ accentColor: SENTRY_COLOR }}
              />
              <span
                className="inline-block w-2 h-2 rounded-full border"
                style={{
                  backgroundColor: `${SENTRY_COLOR}cc`,
                  borderColor: SENTRY_COLOR,
                }}
              />
              Sen
            </label>
            <label className="flex items-center gap-1.5 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showTowers}
                onChange={e => {
                  updateFilters({ towers: e.target.checked ? null : "0" })
                }}
                style={{ accentColor: SCOUTED_COLOR }}
              />
              <span
                className="inline-block w-2.5 h-2.5 border"
                style={{
                  borderColor: SCOUTED_COLOR,
                  backgroundColor: `${SCOUTED_COLOR}66`,
                }}
              />
              Towers
            </label>

            {/* Swatches read the constants the map draws with. Stated as
                Tailwind classes, this legend once survived a colour flip
                unchanged and confidently labelled the map with the old key. */}
            <span className="flex items-center gap-3 text-xs text-slate-400 ml-auto">
              <span className="flex items-center gap-1.5">
                <span
                  role="img"
                  aria-label={`${teamName} outline`}
                  className="inline-block w-2.5 h-2.5 rounded-full border-2"
                  style={{ borderColor: SCOUTED_COLOR }}
                />
                {teamName}
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  role="img"
                  aria-label="Opponent outline"
                  className="inline-block w-2.5 h-2.5 rounded-full border-2"
                  style={{ borderColor: ENEMY_COLOR }}
                />
                Opponent
              </span>
            </span>
          </div>
        )}

        {/*
          A player who never played this side keeps the selection and says so.
          Silently re-selecting whoever does have games here would leave you
          reading Bob's map while believing it is Ana's.
        */}
        {mode === "heatmap" && player?.games === 0 && (
          <div className="mb-3 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-400">
            {player.name} played no games as {side} —{" "}
            {player.radiantGames + player.direGames === 0
              ? "no parsed games at all."
              : `their ${String(Math.max(player.radiantGames, player.direGames))} game${
                  Math.max(player.radiantGames, player.direGames) === 1
                    ? ""
                    : "s"
                } are on the other side.`}
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
            controls={mode === "playback" ? playbackControls : undefined}
            onBackgroundTap={() => {
              setHovered(null)
            }}
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
            {mode === "playback" && decodedMatch && selectedMatch && (
              <>
                {showTowers && (
                  <TowerLayer
                    falls={towerFalls}
                    time={time}
                    size={SIZE}
                    teamSide={selectedMatch.isRadiant ? "radiant" : "dire"}
                    onHover={towerHoverAdapter(setHovered)}
                  />
                )}
                <PlaybackLayer
                  decoded={decodedMatch}
                  isRadiant={selectedMatch.isRadiant}
                  time={time}
                  events={visibleEvents}
                  wards={visibleWards}
                  neutrals={activeNeutrals}
                  size={SIZE}
                  hovered={hovered}
                  setHovered={setHovered}
                />
              </>
            )}
          </DotaMap>
        </div>

        {mode === "heatmap" ? (
          <div className="mt-4 px-2">
            <div className="flex flex-wrap items-center justify-between text-sm mb-1 gap-2">
              <span className="text-slate-400">
                {player ? (
                  <>
                    <span className="text-slate-100">{player.name}</span>
                    {player.position !== null &&
                      ` (${POSITION_LABELS[player.position] ?? player.position})`}{" "}
                    · {formatGameTime(range.from)} to {formatGameTime(range.to)}
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
              {heatmap && (
                <span className="text-slate-500">
                  {heatmap.games} game{heatmap.games === 1 ? "" : "s"} as {side}
                  {" · "}
                  <span className={confidence.className}>
                    {confidence.label}
                  </span>
                  {heatmap.samples > 0 &&
                    ` · ${String(Math.round(heatmap.samples / 60))} min alive`}
                </span>
              )}
            </div>
            {/*
              Phases first, sliders second.

              Two range inputs stacked four pixels apart share one problem: when
              both handles sit near the same time there is no way to tell which
              one a finger grabbed, and no way to separate them again once it
              grabs the wrong one. The presets sidestep that, and they are also
              closer to the question actually being asked — "where do they stand
              in laning", "do they hold Rosh after 20" — than two timestamps
              anyone was dragging to approximate. They ship on desktop too for
              the same reason.
            */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PHASES.map(phase => {
                const from = Math.max(bounds.from, phase.from)
                const to = Math.min(bounds.to, phase.to ?? bounds.to)
                const isActive = range.from === from && range.to === to
                return (
                  <button
                    key={phase.label}
                    onClick={() => {
                      setIsCustomRange(false)
                      writeRangeSoon({ from, to })
                    }}
                    className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                      isActive && !isCustomRange
                        ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                        : "bg-slate-800 text-slate-400 border-slate-700"
                    }`}
                  >
                    {phase.label}
                  </button>
                )
              })}
              <button
                onClick={() => {
                  setIsCustomRange(current => !current)
                }}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                  isCustomRange
                    ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                Custom
              </button>
            </div>

            <div className={`space-y-1 ${isCustomRange ? "" : "hidden"}`}>
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
            {heatmap && confidence.detail !== "" && (
              <div
                className={`mt-2 text-xs text-center ${confidence.className}`}
              >
                {confidence.detail}
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
            {playbackControls}
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
