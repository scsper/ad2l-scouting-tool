/**
 * Turn odota/parser NDJSON into the two things we store: a per-second position
 * track per player, and the handful of events worth drawing on a map.
 *
 * The parser emits 59 event types and ~249,000 events for a 47-minute game. The
 * full stream is archived to disk; this module picks out the ~447 rows that
 * reach Postgres. Everything dropped here is recoverable from the archive
 * without re-downloading a 57 MB replay from Valve.
 */

import { encodePositions, SLOT_COUNT } from "../shared/position-codec.js"
import type { SlotSamples } from "../shared/position-codec.js"

/** One line of parser output. Deliberately loose: 59 shapes share this stream. */
type ParserEvent = {
  type?: string
  time?: number
  slot?: number
  x?: number
  y?: number
  unit?: string
  hero_id?: number
  life_state?: number
  value?: number
  player1?: number
  player2?: number
  attackername?: string
  targetname?: string
  targetsourcename?: string
  attackerhero?: boolean
  targethero?: boolean
  targetillusion?: boolean
  inflictor?: string
}

export type ExtractedEvent = {
  time: number
  type: string
  slot: number | null
  target_slot: number | null
  key: string | null
  x: number | null
  y: number | null
}

export type ExtractedMatch = {
  firstTime: number
  sampleCount: number
  slotHeroIds: number[]
  positions: Uint8Array
  lifeStates: Uint8Array
  events: ExtractedEvent[]
  /** Samples trimmed off the ends to square the slot tracks up. Normally 0. */
  trimmedSamples: number
}

/**
 * Normalise the two hero-naming conventions the parser mixes in one stream.
 *
 * `interval` rows identify a hero as `CDOTA_Unit_Hero_Void_Spirit`; combat log
 * rows call the same hero `npc_dota_hero_void_spirit`. Stripping the prefix,
 * lowercasing and dropping underscores collapses both to `voidspirit`, which is
 * how a combat-log hero name becomes a player slot. Matching on the names
 * already in the stream means no hero-id constants file to keep in sync with
 * Valve's renames.
 */
function heroKey(name: string): string {
  return name
    .replace(/^CDOTA_Unit_Hero_/i, "")
    .replace(/^npc_dota_hero_/i, "")
    .toLowerCase()
    .replace(/_/g, "")
}

const RUNE_NAMES: Record<number, string | undefined> = {
  0: "double_damage",
  1: "haste",
  2: "illusion",
  3: "invisibility",
  4: "regeneration",
  5: "bounty",
  6: "arcane",
  7: "water",
  8: "shield",
}

type SlotTrack = {
  heroId: number
  /** The interval's own `unit` string, e.g. `CDOTA_Unit_Hero_Void_Spirit`. */
  unit: string | null
  /**
   * Keyed by game time rather than pushed to an array, because the parser emits
   * ~7,200 pre-hero intervals (the draft phase) with no x/y at all, and those
   * must not occupy a sample index.
   */
  byTime: Map<number, { x: number; y: number; dead: boolean }>
}

/** Event types that survive the cut into `match_event`. */
function isInterestingEvent(event: ParserEvent): boolean {
  switch (event.type) {
    case "obs":
    case "sen":
    case "obs_left":
    case "sen_left":
    case "DOTA_COMBATLOG_TEAM_BUILDING_KILL":
    case "CHAT_MESSAGE_RUNE_PICKUP":
    case "CHAT_MESSAGE_BUYBACK":
    case "CHAT_MESSAGE_SCAN_USED":
    case "CHAT_MESSAGE_GLYPH_USED":
    case "CHAT_MESSAGE_ROSHAN_KILL":
    case "CHAT_MESSAGE_MINIBOSS_KILL":
    case "CHAT_MESSAGE_AEGIS":
    case "CHAT_MESSAGE_COURIER_LOST":
    case "CHAT_MESSAGE_FIRSTBLOOD":
      return true
    case "DOTA_COMBATLOG_DEATH":
      // 4,654 death rows a game, of which 89 are heroes. The rest are creeps,
      // wards and Clockwerk cogs — this filter is not a tidy-up, it is the
      // difference between 89 markers and a map that is solid with them.
      return event.targethero === true && event.targetillusion !== true
    case "DOTA_COMBATLOG_ITEM":
      // Smoke has no event type of its own; it is an item-use row identified
      // only by its inflictor.
      return (
        event.inflictor === "item_smoke_of_deceit" &&
        event.attackerhero === true
      )
    default:
      return false
  }
}

export function extractFromEvents(lines: Iterable<string>): ExtractedMatch {
  const tracks = new Map<number, SlotTrack>()
  const raw: ParserEvent[] = []

  for (const line of lines) {
    if (line.trim() === "") continue
    let event: ParserEvent
    try {
      event = JSON.parse(line) as ParserEvent
    } catch {
      // A truncated final line is the normal shape of an interrupted parse.
      continue
    }

    if (event.type === "interval") {
      // No x means the hero entity does not exist yet. Skipping those is what
      // makes `first_time` the first second a position actually existed.
      if (
        event.x === undefined ||
        event.y === undefined ||
        event.slot === undefined ||
        event.time === undefined
      ) {
        continue
      }
      let track = tracks.get(event.slot)
      if (!track) {
        track = {
          heroId: event.hero_id ?? 0,
          unit: event.unit ?? null,
          byTime: new Map(),
        }
        tracks.set(event.slot, track)
      }
      track.byTime.set(event.time, {
        x: event.x,
        y: event.y,
        dead: (event.life_state ?? 0) !== 0,
      })
      continue
    }

    if (isInterestingEvent(event)) raw.push(event)
  }

  if (tracks.size !== SLOT_COUNT) {
    throw new Error(
      `extractFromEvents: expected ${String(SLOT_COUNT)} positioned slots, saw ${String(tracks.size)}`,
    )
  }
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    if (!tracks.has(slot)) {
      // Slot numbers index `slot_hero_ids` and every event's `slot` column, so
      // a non-contiguous set would misname every player downstream.
      throw new Error(
        `extractFromEvents: no intervals for slot ${String(slot)}`,
      )
    }
  }

  // Ordered by slot once the set is known to be exactly 0..9, so everything
  // below indexes an array instead of re-asserting that a Map lookup hit.
  const ordered: SlotTrack[] = []
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const track = tracks.get(slot)
    if (track) ordered.push(track)
  }

  /**
   * The window every slot covers.
   *
   * Intersection, not union: the blob is a flat [slot][sample] rectangle, so a
   * slot missing a second would shear every slot after it. The spike match
   * needed no trimming — all ten slots ran -89..2776 with a gap histogram of
   * exactly {1: 2865} — but that is one game's behaviour, not a guarantee, and a
   * silent shear is far worse than a second lost off each end.
   */
  let firstTime = -Infinity
  let lastTime = Infinity
  let widest = 0
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const times = [...ordered[slot].byTime.keys()]
    firstTime = Math.max(firstTime, Math.min(...times))
    lastTime = Math.min(lastTime, Math.max(...times))
    widest = Math.max(widest, times.length)
  }
  if (lastTime < firstTime) {
    throw new Error("extractFromEvents: slots share no common time window")
  }

  const sampleCount = lastTime - firstTime + 1
  const slots: SlotSamples[] = []

  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const track = ordered[slot]
    const x: number[] = []
    const y: number[] = []
    const dead: boolean[] = []
    for (let t = firstTime; t <= lastTime; t++) {
      const sample = track.byTime.get(t)
      if (!sample) {
        // A hole inside the common window, which 1 Hz emission should make
        // impossible. Refuse rather than interpolate: a hero dragged across an
        // invented straight line would read as a rotation that never happened,
        // which is exactly the lie this tab exists to avoid telling.
        throw new Error(
          `extractFromEvents: slot ${String(slot)} missing t=${String(t)}`,
        )
      }
      x.push(sample.x)
      y.push(sample.y)
      dead.push(sample.dead)
    }
    slots.push({ heroId: track.heroId, x, y, dead })
  }

  const encoded = encodePositions(slots)

  const heroToSlot = new Map<string, number>()
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const unit = ordered[slot].unit
    if (unit !== null) heroToSlot.set(heroKey(unit), slot)
  }

  /** A slot's position at a game time, for events that carry none of their own. */
  const positionAt = (slot: number | null, time: number) => {
    if (slot === null) return { x: null, y: null }
    const sample = tracks.get(slot)?.byTime.get(time)
    return sample ? { x: sample.x, y: sample.y } : { x: null, y: null }
  }

  const events: ExtractedEvent[] = []
  const add = (
    event: Omit<ExtractedEvent, "x" | "y">,
    borrowPositionFrom: number | null,
  ) => {
    events.push({ ...event, ...positionAt(borrowPositionFrom, event.time) })
  }
  const slotOrNull = (value: number) => (value >= 0 ? value : null)

  for (const event of raw) {
    const time = event.time ?? 0
    const p1 = event.player1 ?? -1
    const p2 = event.player2 ?? -1
    const slotOfHero = (name: string | undefined) =>
      name === undefined ? null : (heroToSlot.get(heroKey(name)) ?? null)

    switch (event.type) {
      case "obs":
      case "sen":
      case "obs_left":
      case "sen_left":
        // The only events in the whole stream that carry their own coordinates.
        events.push({
          time,
          type: event.type,
          slot: event.slot ?? null,
          target_slot: null,
          key: event.attackername ?? null,
          x: event.x ?? null,
          y: event.y ?? null,
        })
        break

      case "DOTA_COMBATLOG_DEATH": {
        // Attribution here is unambiguous — hero npc names on both sides — which
        // is why deaths come from the combat log rather than
        // CHAT_MESSAGE_HERO_KILL. That message carries player1=VICTIM and
        // player2=KILLER, the reverse of CHAT_MESSAGE_FIRSTBLOOD's ordering in
        // the same stream, and reading either one as "the killer" silently swaps
        // half the markers on the map.
        const victim = slotOfHero(event.targetsourcename ?? event.targetname)
        const killer =
          event.attackerhero === true ? slotOfHero(event.attackername) : null
        add(
          {
            time,
            type: "hero_death",
            slot: victim,
            target_slot: killer,
            key: event.attackername ?? null,
          },
          victim,
        )
        break
      }

      case "DOTA_COMBATLOG_ITEM": {
        const user = slotOfHero(event.attackername)
        add(
          { time, type: "smoke", slot: user, target_slot: null, key: null },
          user,
        )
        break
      }

      case "DOTA_COMBATLOG_TEAM_BUILDING_KILL":
        // No position borrowed: a building's location comes from its name, which
        // src/utils/dota-map.ts already maps, and the killer is usually a creep
        // standing somewhere irrelevant.
        events.push({
          time,
          type: "building_kill",
          slot:
            event.attackerhero === true ? slotOfHero(event.attackername) : null,
          target_slot: null,
          key: event.targetname ?? null,
          x: null,
          y: null,
        })
        break

      case "CHAT_MESSAGE_RUNE_PICKUP":
        // player1 is the picker; player2 is -1 on all 57 rows in the sample
        // match. A rune pickup has exactly one actor.
        add(
          {
            time,
            type: "rune_pickup",
            slot: slotOrNull(p1),
            target_slot: null,
            key: RUNE_NAMES[event.value ?? -1] ?? String(event.value ?? ""),
          },
          slotOrNull(p1),
        )
        break

      case "CHAT_MESSAGE_BUYBACK":
        add(
          {
            time,
            type: "buyback",
            slot: slotOrNull(p1),
            target_slot: null,
            key: null,
          },
          slotOrNull(p1),
        )
        break

      case "CHAT_MESSAGE_AEGIS":
        add(
          {
            time,
            type: "aegis",
            slot: slotOrNull(p1),
            target_slot: null,
            key: null,
          },
          slotOrNull(p1),
        )
        break

      case "CHAT_MESSAGE_MINIBOSS_KILL":
        // value is the team (2/3) and player1 the slot. Verified: both rows in
        // the sample carried value=3 with player1 of 5 and 9, which are Dire
        // slots — the side agrees, so the reading is not a coincidence.
        add(
          {
            time,
            type: "tormentor",
            slot: slotOrNull(p1),
            target_slot: null,
            key: `team=${String(event.value ?? "")}`,
          },
          slotOrNull(p1),
        )
        break

      case "CHAT_MESSAGE_ROSHAN_KILL":
        // The opposite convention from MINIBOSS, in the same stream: player1 is
        // the TEAM and player2 the slot. Verified against the sample's single
        // Roshan — player1=3 (Dire) with player2=8, a Dire slot.
        add(
          {
            time,
            type: "roshan",
            slot: slotOrNull(p2),
            target_slot: null,
            key: `team=${String(p1)}`,
          },
          slotOrNull(p2),
        )
        break

      case "CHAT_MESSAGE_COURIER_LOST":
        // player1 = killer slot, player2 = the team that lost it. Verified by
        // side agreement across all five rows: p1=0 (Radiant) with p2=3 (Dire),
        // p1=9 (Dire) with p2=2 (Radiant), and so on.
        add(
          {
            time,
            type: "courier_lost",
            slot: slotOrNull(p1),
            target_slot: null,
            key: `team=${String(p2)}`,
          },
          slotOrNull(p1),
        )
        break

      case "CHAT_MESSAGE_FIRSTBLOOD":
        // player1 = killer, player2 = victim, confirmed against the combat log
        // row at the same second. Note this is the reverse of HERO_KILL.
        add(
          {
            time,
            type: "firstblood",
            slot: slotOrNull(p1),
            target_slot: slotOrNull(p2),
            key: null,
          },
          slotOrNull(p1),
        )
        break

      case "CHAT_MESSAGE_SCAN_USED":
        // No actor at all: player1 and player2 are -1 on every row, and `value`
        // holds the team (2 or 3). Recorded team-only rather than guessed onto a
        // player who happened to have the right slot number.
        events.push({
          time,
          type: "scan",
          slot: null,
          target_slot: null,
          key: `team=${String(event.value ?? "")}`,
          x: null,
          y: null,
        })
        break

      case "CHAT_MESSAGE_GLYPH_USED":
        // Genuinely ambiguous, and left that way. All five rows in the sample
        // carry player1=2, which reads equally well as "team 2 (Radiant)" and
        // "slot 2 clicked it every time". Glyph is a team-wide cooldown so the
        // former is likelier, but likelier is not a basis for putting a marker
        // over one player's head. The raw field is preserved for a later pass
        // over the archive.
        events.push({
          time,
          type: "glyph",
          slot: null,
          target_slot: null,
          key: `player1=${String(p1)}`,
          x: null,
          y: null,
        })
        break

      default:
        break
    }
  }

  events.sort((a, b) => a.time - b.time)

  return {
    firstTime,
    sampleCount,
    slotHeroIds: encoded.slotHeroIds,
    positions: encoded.positions,
    lifeStates: encoded.lifeStates,
    events,
    trimmedSamples: widest - sampleCount,
  }
}
