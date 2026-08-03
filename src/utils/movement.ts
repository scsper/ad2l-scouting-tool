import {
  decodePositions,
  type DecodedPositions,
} from "../../shared/position-codec"
import type {
  PositionEvent,
  PositionMatch,
  PositionSlot,
} from "../../api/match-positions"
import { wardToFraction } from "./ward-map"

export type DecodedMatch = {
  match: PositionMatch
  positions: DecodedPositions
}

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

/**
 * base64 to bytes, without `atob` or `Buffer`.
 *
 * Written out rather than delegated because this file is imported by both the
 * browser bundle and the node test run: `Buffer` does not exist in one and is
 * untyped in the other's tsconfig, and branching on `typeof` to satisfy both
 * puts an unreachable branch in the shipped bundle. Twelve lines of arithmetic
 * is cheaper than that.
 */
function fromBase64(value: string): Uint8Array {
  const clean = value.replace(/=+$/, "")
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let buffer = 0
  let bits = 0
  let out = 0
  for (const char of clean) {
    const index = BASE64_ALPHABET.indexOf(char)
    if (index < 0) continue
    buffer = (buffer << 6) | index
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[out++] = (buffer >> bits) & 0xff
    }
  }
  return bytes
}

export function decodeMatch(match: PositionMatch): DecodedMatch {
  return {
    match,
    positions: decodePositions({
      positions: fromBase64(match.positions),
      lifeStates: fromBase64(match.lifeStates),
      firstTime: match.firstTime,
      sampleCount: match.sampleCount,
      slotHeroIds: match.slots.map(s => s.heroId),
    }),
  }
}

export type PlayerOption = {
  playerId: number
  name: string
  /** The position they most often played. Ties break toward the lower number. */
  position: string | null
  games: number
}

/**
 * Everyone who played for `teamId` across these games, by `player_id`.
 *
 * Keyed by id rather than name because the same human appears under different
 * `player_name`s between matches, and keyed by person rather than by position
 * because position is not a stable identity: across AD2L Season 47, 32 of 40
 * (team, position) slots were played by more than one person — one team's
 * position 5 was eight different people across 23 games. A heatmap aggregated
 * on position there is a picture of nobody.
 */
export function playersForTeam(
  matches: PositionMatch[],
  teamId: number,
): PlayerOption[] {
  const byPlayer = new Map<
    number,
    { name: string; games: number; positions: Map<string, number> }
  >()

  for (const match of matches) {
    for (const slot of match.slots) {
      if (slot.teamId !== teamId || slot.playerId === null) continue
      const entry = byPlayer.get(slot.playerId) ?? {
        name: slot.playerName ?? `Player ${String(slot.playerId)}`,
        games: 0,
        positions: new Map<string, number>(),
      }
      entry.games += 1
      // The most recent name wins: matches arrive newest-first, so the first one
      // seen is the one they go by now.
      if (entry.games === 1 && slot.playerName) entry.name = slot.playerName
      if (slot.position) {
        entry.positions.set(
          slot.position,
          (entry.positions.get(slot.position) ?? 0) + 1,
        )
      }
      byPlayer.set(slot.playerId, entry)
    }
  }

  return [...byPlayer.entries()]
    .map(([playerId, entry]) => ({
      playerId,
      name: entry.name,
      games: entry.games,
      position:
        [...entry.positions.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .at(0)?.[0] ?? null,
    }))
    .sort(
      (a, b) =>
        (a.position ?? "zz").localeCompare(b.position ?? "zz") ||
        b.games - a.games,
    )
}

/** The slots in one match belonging to a player. Usually one; never assume. */
export function slotsForPlayer(
  match: PositionMatch,
  playerId: number,
): PositionSlot[] {
  return match.slots.filter(s => s.playerId === playerId)
}

export type TimeRange = { from: number; to: number }

/**
 * The widest slider range these games support.
 *
 * `firstTime` is reliably negative — hero entities exist from about -90s, and
 * the pre-horn rune and ward setup is the most repeatable habit a team has, so
 * the range must reach it.
 */
export function positionBounds(matches: PositionMatch[]): TimeRange {
  if (matches.length === 0) return { from: 0, to: 1 }
  let from = Infinity
  let to = -Infinity
  for (const match of matches) {
    from = Math.min(from, match.firstTime)
    to = Math.max(to, match.firstTime + match.sampleCount - 1)
  }
  return { from, to: Math.max(to, from + 1) }
}

export type Heatmap = {
  /** Row-major counts over a `size` x `size` grid of the 0..1 map fraction. */
  bins: Float32Array
  size: number
  /** Hero-seconds that landed in the grid. The honest denominator. */
  samples: number
  /** Games that contributed at least one sample. */
  games: number
  /** The value the colour ramp saturates at. See `binPlayer`. */
  ceiling: number
}

const HEATMAP_SIZE = 96

/**
 * Bin one player's alive time across every game they appear in.
 *
 * Dead samples are dropped, and that is load-bearing rather than tidy: 12.6% of
 * hero-seconds in a real game are spent dead, and Dota parks a corpse where it
 * fell and then a respawned hero at the fountain. Left in, every heatmap grows a
 * fountain the size of the base and a smear over whichever lane the player
 * happened to die in.
 */
export function binPlayer(
  decoded: DecodedMatch[],
  playerId: number,
  range: TimeRange,
  size: number = HEATMAP_SIZE,
): Heatmap {
  const bins = new Float32Array(size * size)
  let samples = 0
  let games = 0

  for (const { match, positions } of decoded) {
    let contributed = false
    for (const slot of slotsForPlayer(match, playerId)) {
      const track = positions.slots.at(slot.slot)
      if (!track) continue

      /**
       * Intersect the requested range with this game's own window in TIME, and
       * only then convert to sample indexes.
       *
       * Clamping indexes instead is wrong in a way that is easy to miss and
       * hard to see: a range starting after a short game ends produces an
       * out-of-window index, and clamping that to 0 bins the entire game from
       * its first second. A "Late (25+)" filter would then quietly fold every
       * 20-minute stomp into the picture in full.
       */
      const gameEnd = match.firstTime + match.sampleCount - 1
      const fromTime = Math.max(range.from, match.firstTime)
      const toTime = Math.min(range.to, gameEnd)
      if (fromTime > toTime) continue

      const start = fromTime - match.firstTime
      const end = toTime - match.firstTime

      for (let i = start; i <= end; i++) {
        if (track.dead[i]) continue
        const { x, y } = wardToFraction({ x: track.x[i], y: track.y[i] })
        // `wardToFraction` clamps, so a fountain sample sitting fractionally
        // outside the 64..191 grid lands on the edge cell rather than out of
        // bounds. The `size - 1` guard is for the exact 1.0 case.
        const col = Math.min(size - 1, Math.floor(x * size))
        const row = Math.min(size - 1, Math.floor(y * size))
        bins[row * size + col] += 1
        samples += 1
        contributed = true
      }
    }
    if (contributed) games += 1
  }

  return { bins, size, samples, games, ceiling: ceilingFor(bins) }
}

/**
 * The intensity the colour ramp should treat as full.
 *
 * The 99th percentile of occupied cells, not the maximum. Players spend real,
 * uninteresting time in one or two cells — the fountain and the shop — and
 * normalising against that peak flattens the entire rest of the map to nearly
 * transparent. Saturating early keeps jungle routes and lane positions legible,
 * at the cost of the very hottest cells being indistinguishable from each other,
 * which is a trade worth making because nobody is scouting the fountain.
 */
function ceilingFor(bins: Float32Array): number {
  const occupied: number[] = []
  for (const value of bins) if (value > 0) occupied.push(value)
  if (occupied.length === 0) return 1
  occupied.sort((a, b) => a - b)
  return Math.max(1, occupied[Math.floor(occupied.length * 0.99)] ?? 1)
}

/** Events for one match at or spanning a moment, for the playback markers. */
export function eventsNear(
  events: PositionEvent[],
  matchId: number,
  time: number,
  windowSeconds: number,
): PositionEvent[] {
  return events.filter(
    e =>
      e.matchId === matchId &&
      e.time <= time &&
      e.time > time - windowSeconds &&
      e.x !== null &&
      e.y !== null,
  )
}
