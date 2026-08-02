import type { ObjectiveEvent, ObjectiveMatch } from "../../api/match-objectives"
import {
  ALL_TOWER_SLOTS,
  parseTowerKey,
  roshanPitAt,
  tormentorSpotAt,
  slotKey,
  slotLabel,
  slotOf,
  towerKeyOf,
  type PitSide,
  type TowerId,
  type TowerSlot,
} from "./dota-map"

export const ROSHAN_TYPE = "CHAT_MESSAGE_ROSHAN_KILL"
export const TORMENTOR_TYPE = "CHAT_MESSAGE_MINIBOSS_KILL"
export const BUILDING_TYPE = "building_kill"

/** Dota team ids as they appear on objective rows. */
const RADIANT_TEAM = 2

/**
 * A tower falling in one game, tagged with whose tower it was.
 *
 * `ownedByTeam` is the whole point of this type. The scouted team is Radiant in
 * some games and Dire in others, so "their T1 mid" is a different building from
 * game to game. Aggregating on the absolute side would average two unrelated
 * towers together and report the mean as a habit.
 */
export type TowerFall = {
  tower: TowerId
  time: number
  matchId: number
  /** True when the tower belonged to the scouted team. */
  ownedByTeam: boolean
}

export type ObjectiveMoment = {
  time: number
  matchId: number
  /** True when the scouted team took it. */
  takenByTeam: boolean
  pit: PitSide | null
}

/** Matches with objective data, which is the only honest denominator. */
export function withObjectiveData(matches: ObjectiveMatch[]): ObjectiveMatch[] {
  return matches.filter(m => m.hasObjectiveData)
}

/** Every plotted tower that fell across the given matches. */
export function collectTowerFalls(matches: ObjectiveMatch[]): TowerFall[] {
  const out: TowerFall[] = []
  for (const match of matches) {
    for (const event of match.objectives) {
      if (event.type !== BUILDING_TYPE) continue
      const tower = parseTowerKey(event.key)
      if (tower === null) continue
      out.push({
        tower,
        time: event.time,
        matchId: match.id,
        ownedByTeam: tower.side === (match.isRadiant ? "radiant" : "dire"),
      })
    }
  }
  return out
}

function collectMoments(
  matches: ObjectiveMatch[],
  type: string,
  pitAt: (time: number, patch: number | null) => PitSide | null,
): ObjectiveMoment[] {
  const out: ObjectiveMoment[] = []
  for (const match of matches) {
    for (const event of match.objectives) {
      if (event.type !== type) continue
      out.push({
        time: event.time,
        matchId: match.id,
        // `team` on these rows is the killer, not an owner.
        takenByTeam: (event.team === RADIANT_TEAM) === match.isRadiant,
        pit: pitAt(event.time, match.patch),
      })
    }
  }
  return out
}

export function collectRoshanKills(
  matches: ObjectiveMatch[],
): ObjectiveMoment[] {
  return collectMoments(matches, ROSHAN_TYPE, roshanPitAt)
}

export function collectTormentorKills(
  matches: ObjectiveMatch[],
): ObjectiveMoment[] {
  return collectMoments(matches, TORMENTOR_TYPE, tormentorSpotAt)
}

/** Whether a tower was still standing at `time` in a single game. */
export function towerStandingAt(
  falls: TowerFall[],
  tower: TowerId,
  time: number,
): boolean {
  const key = towerKeyOf(tower)
  const fall = falls.find(f => towerKeyOf(f.tower) === key)
  return fall === undefined || time < fall.time
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

/**
 * One tower's record across a set of games.
 *
 * `medianTime` and `fell`/`games` are produced together and must be presented
 * together. Tower fall times are right-censored: a game that ends before T3 top
 * falls is not a slow T3 top, it is no observation at all. A median taken over
 * only the games where the tower fell is therefore biased fast, and reading it
 * without the fall rate turns "they lose T3 top at 31:00 in the third of games
 * where they lose it" into "they lose T3 top at 31:00".
 */
export type TowerRecord = TowerSlot & {
  /** Games in which this tower fell. */
  fell: number
  /** Objective-parsed games in the sample. */
  games: number
  medianTime: number | null
  earliest: number | null
  latest: number | null
  times: number[]
}

/**
 * Per-tower records over the given games, keyed team-relative.
 *
 * Every tower slot appears in the output even when it never fell, because a
 * tower that survives every game is a finding — silently omitting the row would
 * make the most one-sided fact in the sample the one you cannot see.
 */
export function aggregateTowers(matches: ObjectiveMatch[]): TowerRecord[] {
  const parsed = withObjectiveData(matches)
  const falls = collectTowerFalls(parsed)
  const games = parsed.length

  // Keyed on the team-relative slot, never on the building. Keying on the
  // building looks equivalent and is not: a team that played both sides owns
  // Radiant's T1 mid in some games and faces it in others, so one absolute
  // tower carries two different meanings. Collapsing that to a single
  // ownership flag both mixed their own falls in with the opposition's and,
  // when the two buildings for a lane happened to land on the same flag, left
  // one of the eighteen rows with nothing in it at all.
  const byKey = new Map<string, number[]>()
  for (const fall of falls) {
    const key = slotKey(slotOf(fall.tower, fall.ownedByTeam))
    const list = byKey.get(key) ?? []
    list.push(fall.time)
    byKey.set(key, list)
  }

  return ALL_TOWER_SLOTS.map(slot => {
    const times = byKey.get(slotKey(slot)) ?? []
    return {
      ...slot,
      fell: times.length,
      // Every game contributes one observation to every slot: both teams have
      // a T1 mid in every game, whichever side they were on. So the
      // denominator is the parsed sample, not the games this slot fell in.
      games,
      medianTime: median(times),
      earliest: times.length > 0 ? Math.min(...times) : null,
      latest: times.length > 0 ? Math.max(...times) : null,
      times,
    }
  })
}

/**
 * Tick positions for the time slider.
 *
 * In a single game these are the actual fall times. Across several they are the
 * per-tower medians, because sixty-odd ticks on a 640-pixel slider is texture
 * rather than a timeline.
 */
export type ObjectiveTick = {
  key: string
  time: number
  label: string
  ownedByTeam: boolean
  kind: "tower" | "roshan" | "tormentor"
  /** How many games back this tick, for the aggregate view. */
  sampleSize: number
  totalGames: number
}

export function towerTicks(
  matches: ObjectiveMatch[],
  singleGame: boolean,
): ObjectiveTick[] {
  const records = aggregateTowers(matches)
  const ticks: ObjectiveTick[] = []

  for (const record of records) {
    if (record.times.length === 0) continue
    const label = slotLabel(record)

    if (singleGame) {
      for (const time of record.times) {
        ticks.push({
          key: `${slotKey(record)}-${String(time)}`,
          time,
          label,
          ownedByTeam: record.ownedByTeam,
          kind: "tower",
          sampleSize: 1,
          totalGames: record.games,
        })
      }
    } else if (record.medianTime !== null) {
      ticks.push({
        key: slotKey(record),
        time: record.medianTime,
        label,
        ownedByTeam: record.ownedByTeam,
        kind: "tower",
        sampleSize: record.fell,
        totalGames: record.games,
      })
    }
  }

  return ticks.sort((a, b) => a.time - b.time)
}

/**
 * Roshan and Tormentor ticks.
 *
 * Single-game only. Neither event carries a position, so unlike towers there is
 * nothing to aggregate onto a shared slot — a median over "Roshan kills" would
 * average the first Roshan of one game with the third of another.
 */
export function neutralTicks(matches: ObjectiveMatch[]): ObjectiveTick[] {
  const parsed = withObjectiveData(matches)
  const ticks: ObjectiveTick[] = []

  for (const moment of collectRoshanKills(parsed)) {
    ticks.push({
      key: `roshan-${String(moment.matchId)}-${String(moment.time)}`,
      time: moment.time,
      label: "Roshan",
      ownedByTeam: moment.takenByTeam,
      kind: "roshan",
      sampleSize: 1,
      totalGames: parsed.length,
    })
  }
  for (const moment of collectTormentorKills(parsed)) {
    ticks.push({
      key: `tormentor-${String(moment.matchId)}-${String(moment.time)}`,
      time: moment.time,
      label: "Tormentor",
      ownedByTeam: moment.takenByTeam,
      kind: "tormentor",
      sampleSize: 1,
      totalGames: parsed.length,
    })
  }

  return ticks.sort((a, b) => a.time - b.time)
}

/** Objective coverage, reported separately from match count for the same
 *  reason ward coverage is: unparsed games are not empty games. */
export function getObjectiveCoverage(matches: ObjectiveMatch[]): {
  total: number
  withData: number
} {
  return {
    total: matches.length,
    withData: withObjectiveData(matches).length,
  }
}

export type { ObjectiveEvent, ObjectiveMatch }
