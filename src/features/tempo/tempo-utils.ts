import type {
  LeagueBuildingTiming,
  ObjectiveMatch,
} from "../objectives/objectives-api"
import {
  LANE_ROLES,
  LANE_ROLE_LABEL,
  RENDERED_TIERS,
  laneForRole,
  type LaneRole,
  type MapSide,
  type RenderedTier,
} from "../../utils/dota-map"
import {
  aggregateTowers,
  withObjectiveData,
} from "../../utils/objective-aggregation"

/**
 * Games before a team's tower timings are compared against the league.
 *
 * Deliberately the same floor `division-players-utils` uses for player ranking,
 * imported rather than re-picked so the two boards cannot drift into disagreeing
 * about what counts as a sample.
 */
export { MIN_GAMES } from "../division-players/division-players-utils"

export type TempoSplit = "theirs" | "enemy"

/**
 * One tower slot for one team, next to the league baseline for the same slot.
 *
 * `fell` and `games` are not decoration. Tower fall times are right-censored —
 * a game that ends before T3 top falls contributes no observation rather than a
 * late one — so `medianTime` alone reads systematically fast, and the pair
 * `fell / games` is what makes it interpretable. Nothing in this module returns
 * a median without the rate that qualifies it.
 */
export type TempoRow = {
  tier: RenderedTier
  laneRole: LaneRole
  label: string
  split: TempoSplit
  medianTime: number | null
  fell: number
  games: number
  /** Median across the whole league for the same tower slot and side. */
  leagueMedian: number | null
  /** League-wide share of games in which this slot fell. */
  leagueFallRate: number | null
  /** Team median minus league median. Negative means faster. */
  deltaSeconds: number | null
}

function fallRate(fell: number, games: number): number | null {
  return games === 0 ? null : fell / games
}

/**
 * Match the league baseline to a team row.
 *
 * The view is keyed by map lane, so a role has to be translated back into the
 * lane it occupies on each side before the rows can be found: a team's safe
 * lane is bottom in their Radiant games and top in their Dire ones, and both
 * sets belong in the same comparison.
 *
 * Sides are kept separate rather than pooled because Radiant and Dire towers do
 * not fall at the same pace, so a pooled figure would fold a map-side effect
 * into what reads as a team tendency.
 */
function baselineFor(
  baseline: LeagueBuildingTiming[],
  tier: number,
  role: LaneRole,
  sides: MapSide[],
): { median: number | null; rate: number | null } {
  const wanted = sides.map(side => ({ side, lane: laneForRole(side, role) }))
  const rows = baseline.filter(b =>
    wanted.some(w => b.tier === tier && b.lane === w.lane && b.side === w.side),
  )
  if (rows.length === 0) return { median: null, rate: null }

  const fell = rows.reduce((sum, r) => sum + r.fell, 0)
  const parsed = rows.reduce((sum, r) => sum + r.parsed_matches, 0)
  // Weighted by how many games each side contributed, so a league that played
  // more games on one side does not get that side's pace double-counted.
  const weighted = rows.reduce(
    (sum, r) => sum + (r.median_time ?? 0) * r.fell,
    0,
  )

  return {
    median: fell === 0 ? null : weighted / fell,
    rate: parsed === 0 ? null : fell / parsed,
  }
}

/**
 * Tower tempo for one team, split into their buildings and the enemy's.
 *
 * Both halves are produced because the causal story runs both ways: how fast
 * they lose their own towers is a vulnerability profile, and how fast they take
 * the enemy's is a tempo profile, and a team can be fast at one and slow at the
 * other.
 */
export function buildTempoRows(
  matches: ObjectiveMatch[],
  baseline: LeagueBuildingTiming[],
): TempoRow[] {
  const parsed = withObjectiveData(matches)
  const records = aggregateTowers(parsed)

  // Which absolute sides the scouted team actually occupied, so the league
  // comparison is drawn from the same map sides they played on.
  const ownSides = [
    ...new Set(parsed.map((m): MapSide => (m.isRadiant ? "radiant" : "dire"))),
  ]
  const enemySides = [
    ...new Set(parsed.map((m): MapSide => (m.isRadiant ? "dire" : "radiant"))),
  ]

  const rows: TempoRow[] = []

  for (const split of ["theirs", "enemy"] as TempoSplit[]) {
    for (const tier of RENDERED_TIERS) {
      for (const laneRole of LANE_ROLES) {
        // Exactly one record per slot now that aggregateTowers keys on the
        // team-relative slot, so there is nothing to merge and no slot that can
        // go missing — all eighteen rows are always present.
        const record = records.find(
          r =>
            r.tier === tier &&
            r.laneRole === laneRole &&
            r.ownedByTeam === (split === "theirs"),
        )
        if (!record) continue

        const { fell, medianTime } = record

        const league = baselineFor(
          baseline,
          tier,
          laneRole,
          split === "theirs" ? ownSides : enemySides,
        )

        rows.push({
          tier,
          laneRole,
          label: `T${String(tier)} ${LANE_ROLE_LABEL[laneRole]}`,
          split,
          medianTime,
          fell,
          games: parsed.length,
          leagueMedian: league.median,
          leagueFallRate: league.rate,
          deltaSeconds:
            medianTime === null || league.median === null
              ? null
              : medianTime - league.median,
        })
      }
    }
  }

  return rows
}

export function formatFallRate(fell: number, games: number): string {
  const rate = fallRate(fell, games)
  if (rate === null) return "—"
  return `${String(fell)}/${String(games)}`
}

export function formatDelta(seconds: number | null): string {
  if (seconds === null) return "—"
  const sign = seconds < 0 ? "−" : "+"
  const abs = Math.abs(Math.round(seconds))
  const m = Math.floor(abs / 60)
  const s = abs % 60
  return `${sign}${String(m)}:${String(s).padStart(2, "0")}`
}

export { fallRate }
