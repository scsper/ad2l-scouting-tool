import type { WardRecord } from "../../types/db"
import type { PositionEvent } from "../features/movement/positions-api"
import { parseTowerKey, type MapSide } from "./dota-map"
import { WARD_DURATION } from "./ward-map"
import type { TowerFall } from "./objective-aggregation"

/**
 * Turning the parsed replay's event stream into things that can be drawn on the
 * playback map.
 *
 * Everything here reads from `match_event`, which we produce ourselves from the
 * replay. That matters most for wards: the Wards tab reads `match_player.wards`,
 * which is only ever populated for the scouted team, so the enemy's vision has
 * never been visible anywhere in this app. The event stream has both sides.
 */

/**
 * Which side a slot is on, from the slot number alone.
 *
 * Slots 0-4 are Radiant and 5-9 are Dire, always, so allegiance is derivable
 * without `match_player` — and that is the point. `PositionSlot.teamId` is null
 * whenever a match's ten rows were only partly written, and the previous
 * `slot.teamId === teamId` test silently painted those heroes as the enemy.
 * Slot parity is exact and always present.
 */
export function isRadiantSlot(slot: number): boolean {
  return slot < 5
}

/** True when the slot belongs to the team being scouted. */
export function slotIsScouted(
  slot: number | null,
  isRadiant: boolean,
): boolean {
  if (slot === null) return false
  return isRadiantSlot(slot) === isRadiant
}

/** A ward with everything needed to draw and describe it. */
export type PlaybackWard = {
  ward: WardRecord
  /** True when the team being scouted placed it. */
  byScouted: boolean
  slot: number | null
}

const PLACE_TYPES: Record<string, WardRecord["type"] | undefined> = {
  obs: "obs",
  sen: "sen",
}

const LEAVE_TYPE: Record<WardRecord["type"], string> = {
  obs: "obs_left",
  sen: "sen_left",
}

/**
 * A ward's position, rounded, as a bucket key.
 *
 * `match_event.x`/`y` are Postgres `REAL` — single precision — so a placement
 * and its removal do not reliably compare equal as floats even though they
 * describe the same ward. Rounding to two decimals is far tighter than the
 * spacing between any two real wards and far looser than the representation
 * error.
 */
function posKey(x: number, y: number): string {
  return `${x.toFixed(2)},${y.toFixed(2)}`
}

/**
 * Pair ward placements with their removals into `WardRecord`s.
 *
 * Producing `WardRecord` rather than a new shape is deliberate: it is what
 * `isAliveAt`, `wasDewarded` and `WARD_DURATION` already consume, so both map
 * tabs end up sharing one definition of "alive" and one of "dewarded" instead
 * of growing a second, subtly different copy.
 *
 * An unmatched placement is expired at its nominal duration rather than left as
 * `left: null`. Those are not the same thing: to `isAliveAt`, a null `left`
 * means "outlived the game" and keeps the ward standing for every later time.
 * That is the right reading of `match_player.wards`, where a surviving ward
 * genuinely has no removal row, and the wrong one here, where a null means only
 * that we failed to find the removal. Failing to a natural expiry makes a
 * missed pair look like a ward that ran its course instead of one that sits on
 * the map for the rest of the game.
 */
export function eventsToWards(
  events: PositionEvent[],
  isRadiant: boolean,
): PlaybackWard[] {
  // Removals bucketed by type and place, each list in time order, consumed
  // front-to-back. Two wards really can occupy the same spot in one game — a
  // re-ward of a good perch is the normal case, not an edge case — so a
  // placement takes the earliest removal that has not already been claimed.
  const removals = new Map<string, number[]>()
  for (const event of events) {
    if (event.x === null || event.y === null) continue
    if (event.type !== "obs_left" && event.type !== "sen_left") continue
    const key = `${event.type}|${posKey(event.x, event.y)}`
    const list = removals.get(key) ?? []
    list.push(event.time)
    removals.set(key, list)
  }
  for (const list of removals.values()) list.sort((a, b) => a - b)

  const placements = events
    .filter(e => PLACE_TYPES[e.type] !== undefined && e.x !== null)
    .sort((a, b) => a.time - b.time)

  const out: PlaybackWard[] = []
  for (const event of placements) {
    const type = PLACE_TYPES[event.type]
    if (type === undefined || event.x === null || event.y === null) continue

    const key = `${LEAVE_TYPE[type]}|${posKey(event.x, event.y)}`
    const list = removals.get(key)
    const index = list?.findIndex(t => t >= event.time) ?? -1
    const left =
      index >= 0 && list ? list[index] : event.time + WARD_DURATION[type]
    if (index >= 0 && list) list.splice(index, 1)

    out.push({
      ward: {
        type,
        x: event.x,
        y: event.y,
        placed: event.time,
        left,
        by: event.key,
      },
      byScouted: slotIsScouted(event.slot, isRadiant),
      slot: event.slot,
    })
  }
  return out
}

/**
 * Tower falls for one game, from its `building_kill` events.
 *
 * The events carry no coordinates — a building's position comes from its name —
 * so this pairs the event's `key` with the static tower table. Barracks and the
 * ancient fall out here rather than being filtered: `parseTowerKey` only matches
 * `tower1` through `tower4`, and returns null for everything else.
 */
export function towerFallsFromEvents(
  events: PositionEvent[],
  matchId: number,
  isRadiant: boolean,
): TowerFall[] {
  const side: MapSide = isRadiant ? "radiant" : "dire"
  const out: TowerFall[] = []
  for (const event of events) {
    if (event.type !== "building_kill") continue
    const tower = parseTowerKey(event.key)
    if (tower === null) continue
    out.push({
      tower,
      time: event.time,
      matchId,
      ownedByTeam: tower.side === side,
    })
  }
  return out
}

export type NeutralKind = "roshan" | "tormentor"

/** A Roshan or Tormentor kill, at the place it actually happened. */
export type NeutralKill = {
  kind: NeutralKind
  time: number
  x: number
  y: number
  /** True when the team being scouted took it. */
  byScouted: boolean
}

/** Dota team ids as they appear in a `roshan`/`tormentor` event's `key`. */
const RADIANT_TEAM = 2

function killerIsScouted(key: string | null, isRadiant: boolean): boolean {
  const team = Number((key ?? "").replace("team=", ""))
  return (team === RADIANT_TEAM) === isRadiant
}

/**
 * Roshan and Tormentor kills, read off the replay rather than deduced.
 *
 * The Wards tab draws these at a pit inferred from a five-minute rotation clock,
 * gated on the patch. That inference is not repeated here, for two reasons: the
 * gate is only configured for 7.41 so it produces nothing at all on older
 * games, and the Tormentor spots it would draw are explicitly unverified. This
 * tab's whole claim is that it shows what the replay recorded, and a deduced
 * coordinate sitting next to measured hero positions reads as the same kind of
 * fact when it is not.
 */
export function neutralKillsFromEvents(
  events: PositionEvent[],
  isRadiant: boolean,
): NeutralKill[] {
  const out: NeutralKill[] = []
  for (const event of events) {
    if (event.type !== "roshan" && event.type !== "tormentor") continue
    if (event.x === null || event.y === null) continue
    out.push({
      kind: event.type,
      time: event.time,
      x: event.x,
      y: event.y,
      byScouted: killerIsScouted(event.key, isRadiant),
    })
  }
  return out
}

/**
 * How long a kill marker stays on the map.
 *
 * `earliest` is when the thing can be back, `latest` when it certainly is.
 * Roshan's respawn is randomised across that three-minute window, so the marker
 * fades through it rather than snapping off at a precision the game does not
 * have. The Tormentor's ten minutes are fixed, so its window has no width and it
 * never renders as fading.
 */
export const RESPAWN_WINDOW: Record<
  NeutralKind,
  { earliest: number; latest: number }
> = {
  roshan: { earliest: 480, latest: 660 },
  tormentor: { earliest: 600, latest: 600 },
}

export type ActiveNeutral = NeutralKill & {
  /** Inside the respawn window: down, but possibly already back. */
  fading: boolean
}

/**
 * The neutral markers to draw at `time`.
 *
 * A marker appears when the thing dies and clears once it has certainly
 * respawned. Keeping it to the end of the game was the obvious alternative and
 * is worse: by 45:00 you would have three stale Roshan markers each asserting
 * something that stopped being true half an hour earlier.
 */
export function activeNeutralsAt(
  kills: NeutralKill[],
  time: number,
): ActiveNeutral[] {
  const out: ActiveNeutral[] = []
  for (const kill of kills) {
    const window = RESPAWN_WINDOW[kill.kind]
    const since = time - kill.time
    if (since < 0 || since >= window.latest) continue
    out.push({ ...kill, fading: since >= window.earliest })
  }
  return out
}
