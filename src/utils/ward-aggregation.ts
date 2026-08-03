import type { WardRecord } from "../../types/db"
import type { WardMatch } from "../features/wards/wards-api"
import { isAliveAt } from "./ward-map"

export type SideFilter = "radiant" | "dire"

export type PlacedWard = {
  ward: WardRecord
  matchId: number
  startDateTime: number
  /** The other team in that game, so hover can name who they were playing. */
  opponentTeamId: number | null
  playerName: string | null
  heroId: number
  position: string | null
}

export type WardCoverage = {
  /** Matches matching the current side filter. */
  total: number
  /** Of those, how many actually have ward data. */
  withData: number
}

/**
 * Matches for the current side filter.
 *
 * There is deliberately no "both sides" option. The minimap has a fixed
 * orientation: a team's "own safelane triangle" is the bottom-left corner as
 * Radiant and the top-right as Dire. The same habit lands in opposite corners,
 * so a combined aggregate is two mirrored smears that describe no single game.
 * We filter rather than mirror-normalise — the Dota map is not 180-degree
 * symmetric, so rotating Dire games onto Radiant terrain would place wards on
 * ground that may not even be wardable.
 */
export function filterBySide(
  matches: WardMatch[],
  side: SideFilter,
): WardMatch[] {
  return matches.filter(m => (side === "radiant" ? m.isRadiant : !m.isRadiant))
}

/**
 * The side this team has the most games on, used as the opening view.
 *
 * Since there is no "both" option, something has to be picked, and the larger
 * sample is the stronger read. Ward data is what counts — opening on a side
 * whose only games were never parsed would show an empty map. Ties break to
 * Radiant so the choice stays deterministic for a given team.
 */
export function majoritySide(matches: WardMatch[]): SideFilter {
  const withData = matches.filter(m => m.hasWardData)
  const dire = withData.filter(m => !m.isRadiant).length
  return dire > withData.length - dire ? "dire" : "radiant"
}

/**
 * Coverage for the given matches.
 *
 * `withData` is reported separately from `total` so the UI can state the real
 * denominator. Matches OpenDota never parsed — including the games hand-entered
 * from screenshots — carry no wards at all, and counting them as "zero wards"
 * would understate every tendency.
 */
export function getCoverage(matches: WardMatch[]): WardCoverage {
  return {
    total: matches.length,
    withData: matches.filter(m => m.hasWardData).length,
  }
}

/**
 * Match labels keyed by id, with same-day rematches numbered by game order.
 *
 * A Bo2 against one opponent on one day is the normal league week, so "7/12 vs
 * Random Gaming" routinely names two different games — and two identical chips
 * are useless in a row whose whole job is telling games apart. Only colliding
 * labels get a number, so the ordinary single game stays uncluttered, and the
 * number follows start time so g1 really is the one they played first.
 */
export function labelMatches(
  matches: WardMatch[],
  base: (match: WardMatch) => string,
): Map<number, string> {
  const groups = new Map<string, WardMatch[]>()
  for (const match of matches) {
    const key = base(match)
    groups.set(key, [...(groups.get(key) ?? []), match])
  }

  const labels = new Map<number, string>()
  for (const [key, group] of groups) {
    if (group.length === 1) {
      labels.set(group[0].id, key)
      continue
    }
    const byStart = [...group].sort(
      (a, b) => a.start_date_time - b.start_date_time,
    )
    byStart.forEach((match, i) => {
      labels.set(match.id, `${key} (g${String(i + 1)})`)
    })
  }
  return labels
}

/** Every ward placed across the given matches, flattened with its context. */
export function collectWards(matches: WardMatch[]): PlacedWard[] {
  const out: PlacedWard[] = []
  for (const match of matches) {
    for (const player of match.players) {
      for (const ward of player.wards ?? []) {
        out.push({
          ward,
          matchId: match.id,
          startDateTime: match.start_date_time,
          opponentTeamId: match.isRadiant
            ? match.dire_team_id
            : match.radiant_team_id,
          playerName: player.player_name,
          heroId: player.hero_id,
          position: player.position,
        })
      }
    }
  }
  return out
}

/**
 * The wards standing at `time`, restricted to the enabled ward types.
 *
 * "Alive at T" rather than "placed before T": it answers what vision the team
 * actually had at that moment, which is the question you ask when planning a
 * smoke or reading a lost fight. It depends on `left` being recorded, which is
 * why the removal logs are stored even though the deward layer is not drawn yet.
 */
export function wardsAliveAt(
  wards: PlacedWard[],
  time: number,
  types: { obs: boolean; sen: boolean },
): PlacedWard[] {
  return wards.filter(
    w =>
      (w.ward.type === "obs" ? types.obs : types.sen) &&
      isAliveAt(w.ward, time),
  )
}

/**
 * Slider bounds for the given matches, in seconds.
 *
 * The lower bound can be negative: wards placed during the pre-horn setup are
 * logged at negative times, and those first-ward placements are the most
 * repeatable habit a team has, so the slider must reach them.
 */
export function getTimeBounds(matches: WardMatch[]): {
  min: number
  max: number
} {
  let min = 0
  let max = 0
  for (const match of matches) {
    max = Math.max(max, match.duration)
    for (const player of match.players) {
      for (const ward of player.wards ?? []) {
        min = Math.min(min, ward.placed)
        max = Math.max(max, ward.placed)
      }
    }
  }
  return { min, max: Math.max(max, min + 1) }
}

/** Laning stage, the window where ward placement is most habitual. */
const LANING_END_SECONDS = 600
const DEFAULT_TIME_STEP_SECONDS = 5

/**
 * A sensible starting position for the time slider: the moment during laning
 * when the most wards were standing.
 *
 * A fixed default does not work. "Alive at T" only shows wards up at that exact
 * instant, so an arbitrary early time lands on a nearly empty map whenever a
 * team wards late — the feature then looks broken on open. Picking the laning
 * peak guarantees the first thing you see is their fullest early vision setup,
 * which is also the thing worth scouting.
 */
export function getDefaultTime(
  wards: PlacedWard[],
  types: { obs: boolean; sen: boolean },
  bounds: { min: number; max: number },
): number {
  const end = Math.min(bounds.max, LANING_END_SECONDS)
  let bestTime = Math.min(bounds.max, Math.max(bounds.min, 0))
  let bestCount = -1
  for (let t = bounds.min; t <= end; t += DEFAULT_TIME_STEP_SECONDS) {
    const count = wardsAliveAt(wards, t, types).length
    if (count > bestCount) {
      bestCount = count
      bestTime = t
    }
  }
  return bestTime
}

export function formatGameTime(seconds: number): string {
  const sign = seconds < 0 ? "-" : ""
  const abs = Math.abs(Math.round(seconds))
  const m = Math.floor(abs / 60)
  const s = abs % 60
  return `${sign}${String(m)}:${String(s).padStart(2, "0")}`
}

export const POSITION_LABELS: Record<string, string> = {
  POSITION_1: "Carry",
  POSITION_2: "Mid",
  POSITION_3: "Offlane",
  POSITION_4: "Soft Support",
  POSITION_5: "Hard Support",
}

/**
 * Colours by ward type, not by who placed it: with observers and sentries on
 * independent toggles, telling the two apart is the job hue is best at, and
 * size alone is a weak discriminator once both are drawn.
 *
 * These are `amber-400` and `sky-400` — the same colours as the Tailwind
 * swatches beside the toggles in `Wards.tsx`. Change one, change the other.
 */
export const OBSERVER_COLOR = "#fbbf24"
export const SENTRY_COLOR = "#38bdf8"
