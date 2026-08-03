import { describe, expect, it } from "vitest"
import { extractFromEvents } from "./replay-extract"
import { decodePositions } from "../shared/position-codec"

const HEROES = [
  "Void_Spirit",
  "Axe",
  "Gyrocopter",
  "Dawnbreaker",
  "Shadow_Shaman",
  "Invoker",
  "Dark_Willow",
  "Visage",
  "Rattletrap",
  "Abaddon",
]

/** Ten slots, `seconds` samples each, starting at `firstTime`. */
function intervals(firstTime: number, seconds: number): string[] {
  const lines: string[] = []
  for (let slot = 0; slot < 10; slot++) {
    for (let i = 0; i < seconds; i++) {
      lines.push(
        JSON.stringify({
          type: "interval",
          time: firstTime + i,
          slot,
          unit: `CDOTA_Unit_Hero_${HEROES[slot]}`,
          hero_id: 100 + slot,
          x: 100 + slot,
          y: 120 + i,
          life_state: 0,
        }),
      )
    }
  }
  return lines
}

describe("extractFromEvents", () => {
  it("builds a rectangular blob from 1 Hz intervals", () => {
    const result = extractFromEvents(intervals(-89, 5))

    expect(result.firstTime).toBe(-89)
    expect(result.sampleCount).toBe(5)
    expect(result.trimmedSamples).toBe(0)
    expect(result.slotHeroIds).toEqual([
      100, 101, 102, 103, 104, 105, 106, 107, 108, 109,
    ])

    const decoded = decodePositions({
      positions: result.positions,
      lifeStates: result.lifeStates,
      firstTime: result.firstTime,
      sampleCount: result.sampleCount,
      slotHeroIds: result.slotHeroIds,
    })
    expect(decoded.slots[3].x[0]).toBeCloseTo(103, 1)
    expect(decoded.slots[3].y[4]).toBeCloseTo(124, 1)
  })

  it("ignores draft-phase intervals that carry no position", () => {
    // ~7,200 of these precede the first positioned sample in a real game, and
    // counting them would push `first_time` back to before heroes existed.
    const lines = [
      JSON.stringify({ type: "interval", time: -809, slot: 0, gold: 0 }),
      ...intervals(-89, 3),
    ]
    expect(extractFromEvents(lines).firstTime).toBe(-89)
  })

  it("intersects slot windows rather than shearing the blob", () => {
    const lines = [
      ...intervals(-89, 5),
      // Slot 2 starts a second late and ends a second early.
      JSON.stringify({
        type: "interval",
        time: -90,
        slot: 2,
        unit: "CDOTA_Unit_Hero_Gyrocopter",
        hero_id: 102,
        x: 102,
        y: 119,
        life_state: 0,
      }),
    ]
    const result = extractFromEvents(lines)
    expect(result.firstTime).toBe(-89)
    expect(result.sampleCount).toBe(5)
    expect(result.trimmedSamples).toBe(1)
  })

  it("refuses a hole inside the common window instead of interpolating", () => {
    const lines = intervals(-89, 5).filter(
      line => !line.includes('"time":-87,"slot":6'),
    )
    expect(() => extractFromEvents(lines)).toThrow(/missing t=/)
  })

  it("refuses a stream missing a slot entirely", () => {
    const lines = intervals(-89, 3).filter(line => !line.includes('"slot":7'))
    expect(() => extractFromEvents(lines)).toThrow(/expected 10 positioned/)
  })

  it("attributes a hero death to victim and killer, with the victim's position", () => {
    // The combat log is used rather than CHAT_MESSAGE_HERO_KILL because the chat
    // message orders player1/player2 as victim/killer while FIRSTBLOOD orders
    // them killer/victim.
    const lines = [
      ...intervals(0, 5),
      JSON.stringify({
        type: "DOTA_COMBATLOG_DEATH",
        time: 2,
        attackername: "npc_dota_hero_rattletrap",
        targetname: "npc_dota_hero_shadow_shaman",
        targetsourcename: "npc_dota_hero_shadow_shaman",
        attackerhero: true,
        targethero: true,
        targetillusion: false,
      }),
    ]
    const death = extractFromEvents(lines).events.find(
      e => e.type === "hero_death",
    )
    expect(death).toMatchObject({
      time: 2,
      slot: 4, // shadow shaman
      target_slot: 8, // rattletrap
      key: "npc_dota_hero_rattletrap",
    })
    // Borrowed from the victim's track at t=2: x=100+4, y=120+2.
    expect(death?.x).toBeCloseTo(104, 1)
    expect(death?.y).toBeCloseTo(122, 1)
  })

  it("drops the ~98% of combat-log deaths that are not heroes", () => {
    const lines = [
      ...intervals(0, 3),
      JSON.stringify({
        type: "DOTA_COMBATLOG_DEATH",
        time: 1,
        attackername: "npc_dota_hero_axe",
        targetname: "npc_dota_creep_badguys_melee",
        targethero: false,
      }),
      JSON.stringify({
        type: "DOTA_COMBATLOG_DEATH",
        time: 1,
        attackername: "npc_dota_hero_axe",
        targetname: "npc_dota_hero_visage",
        targetsourcename: "npc_dota_hero_visage",
        targethero: true,
        targetillusion: true,
      }),
    ]
    expect(
      extractFromEvents(lines).events.filter(e => e.type === "hero_death"),
    ).toHaveLength(0)
  })

  it("finds smoke, which has no event type of its own", () => {
    const lines = [
      ...intervals(0, 3),
      JSON.stringify({
        type: "DOTA_COMBATLOG_ITEM",
        time: 1,
        attackername: "npc_dota_hero_dark_willow",
        attackerhero: true,
        inflictor: "item_smoke_of_deceit",
      }),
      JSON.stringify({
        type: "DOTA_COMBATLOG_ITEM",
        time: 1,
        attackername: "npc_dota_hero_dark_willow",
        attackerhero: true,
        inflictor: "item_quelling_blade",
      }),
    ]
    const smokes = extractFromEvents(lines).events.filter(
      e => e.type === "smoke",
    )
    expect(smokes).toHaveLength(1)
    expect(smokes[0].slot).toBe(6)
    expect(smokes[0].x).toBeCloseTo(106, 1)
  })

  it("keeps ward coordinates from the event rather than the position stream", () => {
    const lines = [
      ...intervals(0, 3),
      JSON.stringify({
        type: "obs",
        time: 1,
        slot: 8,
        x: 112.5,
        y: 130.1,
      }),
    ]
    const obs = extractFromEvents(lines).events.find(e => e.type === "obs")
    expect(obs).toMatchObject({ slot: 8, x: 112.5, y: 130.1 })
  })

  it("records scan and glyph without inventing an actor", () => {
    // SCAN carries player1/player2 of -1 with the team in `value`; GLYPH's
    // player1 reads equally well as a team or a slot, so neither gets a slot.
    const lines = [
      ...intervals(0, 3),
      JSON.stringify({
        type: "CHAT_MESSAGE_SCAN_USED",
        time: 1,
        value: 2,
        player1: -1,
        player2: -1,
      }),
      JSON.stringify({
        type: "CHAT_MESSAGE_GLYPH_USED",
        time: 2,
        value: 0,
        player1: 2,
        player2: -1,
      }),
    ]
    const events = extractFromEvents(lines).events
    expect(events.find(e => e.type === "scan")).toMatchObject({
      slot: null,
      key: "team=2",
      x: null,
    })
    expect(events.find(e => e.type === "glyph")).toMatchObject({
      slot: null,
      key: "player1=2",
    })
  })

  it("reads Roshan and Tormentor with their opposite slot conventions", () => {
    const lines = [
      ...intervals(0, 3),
      // ROSHAN: player1 is the team, player2 the slot.
      JSON.stringify({
        type: "CHAT_MESSAGE_ROSHAN_KILL",
        time: 1,
        value: 135,
        player1: 3,
        player2: 8,
      }),
      // MINIBOSS: value is the team, player1 the slot.
      JSON.stringify({
        type: "CHAT_MESSAGE_MINIBOSS_KILL",
        time: 2,
        value: 3,
        player1: 5,
        player2: -1,
      }),
    ]
    const events = extractFromEvents(lines).events
    expect(events.find(e => e.type === "roshan")).toMatchObject({
      slot: 8,
      key: "team=3",
    })
    expect(events.find(e => e.type === "tormentor")).toMatchObject({
      slot: 5,
      key: "team=3",
    })
  })

  it("leaves building kills unpositioned", () => {
    const lines = [
      ...intervals(0, 3),
      JSON.stringify({
        type: "DOTA_COMBATLOG_TEAM_BUILDING_KILL",
        time: 1,
        attackername: "dota_unknown",
        targetname: "npc_dota_goodguys_tower1_bot",
        attackerhero: false,
      }),
    ]
    expect(
      extractFromEvents(lines).events.find(e => e.type === "building_kill"),
    ).toMatchObject({
      slot: null,
      key: "npc_dota_goodguys_tower1_bot",
      x: null,
      y: null,
    })
  })

  it("skips malformed lines instead of failing the match", () => {
    const lines = [...intervals(0, 3), "{not json", ""]
    expect(extractFromEvents(lines).sampleCount).toBe(3)
  })
})
