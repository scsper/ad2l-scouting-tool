import { describe, expect, it } from "vitest"
import {
  activeNeutralsAt,
  eventsToWards,
  neutralKillsFromEvents,
  slotIsScouted,
  towerFallsFromEvents,
} from "./playback-objects"
import { isAliveAt, wasDewarded } from "./ward-map"
import type { PositionEvent } from "../features/movement/positions-api"

function event(over: Partial<PositionEvent> & { type: string }): PositionEvent {
  return {
    matchId: 111,
    time: 0,
    slot: 0,
    target_slot: null,
    key: null,
    x: null,
    y: null,
    ...over,
  }
}

describe("slotIsScouted", () => {
  it("reads allegiance off the slot number, not off match_player", () => {
    // The point of the rule: `teamId` is null for whole sides of partly-written
    // matches, and those heroes used to all render as the enemy.
    expect(slotIsScouted(0, true)).toBe(true)
    expect(slotIsScouted(4, true)).toBe(true)
    expect(slotIsScouted(5, true)).toBe(false)
    expect(slotIsScouted(9, true)).toBe(false)
  })

  it("flips with the side the scouted team played", () => {
    expect(slotIsScouted(0, false)).toBe(false)
    expect(slotIsScouted(5, false)).toBe(true)
  })

  it("treats an actorless event as not theirs rather than guessing", () => {
    expect(slotIsScouted(null, true)).toBe(false)
  })
})

describe("eventsToWards", () => {
  it("pairs a placement with its removal", () => {
    const wards = eventsToWards(
      [
        event({ type: "obs", time: 100, x: 120, y: 80, slot: 1 }),
        event({ type: "obs_left", time: 250, x: 120, y: 80, slot: 6 }),
      ],
      true,
    )

    expect(wards).toHaveLength(1)
    expect(wards[0].ward.placed).toBe(100)
    expect(wards[0].ward.left).toBe(250)
  })

  it("pairs across single-precision drift in the stored coordinates", () => {
    // `match_event.x` is Postgres REAL, so a placement and its removal describe
    // one ward without comparing equal as doubles. Exact matching would leave
    // this ward standing for the rest of the game.
    const wards = eventsToWards(
      [
        event({ type: "sen", time: 100, x: 120.30000305175781, y: 80.4 }),
        event({ type: "sen_left", time: 300, x: 120.3, y: 80.40000152587891 }),
      ],
      true,
    )

    expect(wards[0].ward.left).toBe(300)
  })

  it("expires an unmatched placement naturally rather than never", () => {
    // A null `left` would NOT do this. To `isAliveAt` it means "outlived the
    // game", so an unpaired ward would stand for every later time — the exact
    // failure the pairing tolerance exists to avoid.
    const wards = eventsToWards(
      [event({ type: "obs", time: 100, x: 120, y: 80 })],
      true,
    )

    expect(wards[0].ward.left).toBe(460) // 100 + the observer's 360
    expect(isAliveAt(wards[0].ward, 400)).toBe(true)
    expect(isAliveAt(wards[0].ward, 461)).toBe(false)
    // And it must not then be reported as killed early.
    expect(wasDewarded(wards[0].ward)).toBe(false)
  })

  it("gives each of two wards on one spot its own removal", () => {
    // Re-warding a good perch is the normal case, not an edge case.
    const wards = eventsToWards(
      [
        event({ type: "obs", time: 100, x: 120, y: 80 }),
        event({ type: "obs_left", time: 200, x: 120, y: 80 }),
        event({ type: "obs", time: 210, x: 120, y: 80 }),
        event({ type: "obs_left", time: 400, x: 120, y: 80 }),
      ],
      true,
    )

    expect(wards.map(w => [w.ward.placed, w.ward.left])).toEqual([
      [100, 200],
      [210, 400],
    ])
  })

  it("never pairs a placement with a removal that predates it", () => {
    const wards = eventsToWards(
      [
        event({ type: "obs_left", time: 50, x: 120, y: 80 }),
        event({ type: "obs", time: 100, x: 120, y: 80 }),
      ],
      true,
    )

    expect(wards[0].ward.left).toBe(460)
  })

  it("keeps observers and sentries on separate spots even at one coordinate", () => {
    const wards = eventsToWards(
      [
        event({ type: "obs", time: 100, x: 120, y: 80 }),
        event({ type: "sen", time: 105, x: 120, y: 80 }),
        event({ type: "sen_left", time: 200, x: 120, y: 80 }),
      ],
      true,
    )

    const obs = wards.find(w => w.ward.type === "obs")
    const sen = wards.find(w => w.ward.type === "sen")
    expect(obs?.ward.left).toBe(460) // untouched by the sentry's removal
    expect(sen?.ward.left).toBe(200)
  })

  it("returns both teams' wards, tagged", () => {
    // Nothing else in this app can do this: the Wards tab reads a column that
    // is only ever populated for the scouted team.
    const wards = eventsToWards(
      [
        event({ type: "obs", time: 100, x: 120, y: 80, slot: 4 }),
        event({ type: "obs", time: 110, x: 140, y: 90, slot: 5 }),
      ],
      true,
    )

    expect(wards.map(w => w.byScouted)).toEqual([true, false])
  })

  it("marks an early removal as a deward", () => {
    const wards = eventsToWards(
      [
        event({ type: "obs", time: 100, x: 120, y: 80 }),
        event({ type: "obs_left", time: 200, x: 120, y: 80 }),
      ],
      true,
    )

    expect(wasDewarded(wards[0].ward)).toBe(true)
  })
})

describe("towerFallsFromEvents", () => {
  it("locates a tower by name, since the event carries no coordinates", () => {
    const falls = towerFallsFromEvents(
      [
        event({
          type: "building_kill",
          time: 900,
          key: "npc_dota_goodguys_tower2_mid",
        }),
      ],
      111,
      true,
    )

    expect(falls).toHaveLength(1)
    expect(falls[0].tower).toEqual({ tier: 2, lane: "mid", side: "radiant" })
    expect(falls[0].time).toBe(900)
  })

  it("attributes ownership by the side the scouted team played", () => {
    const key = "npc_dota_goodguys_tower1_top"
    expect(
      towerFallsFromEvents([event({ type: "building_kill", key })], 1, true)[0]
        .ownedByTeam,
    ).toBe(true)
    expect(
      towerFallsFromEvents([event({ type: "building_kill", key })], 1, false)[0]
        .ownedByTeam,
    ).toBe(false)
  })

  it("ignores buildings that are not plotted towers", () => {
    const falls = towerFallsFromEvents(
      [
        event({ type: "building_kill", key: "npc_dota_badguys_melee_rax_mid" }),
        event({ type: "building_kill", key: "npc_dota_goodguys_fort" }),
      ],
      111,
      true,
    )

    expect(falls).toEqual([])
  })
})

describe("neutralKillsFromEvents", () => {
  it("takes the position from the kill rather than deducing a pit", () => {
    const kills = neutralKillsFromEvents(
      [event({ type: "roshan", time: 1450, x: 150, y: 140, key: "team=2" })],
      true,
    )

    expect(kills[0]).toMatchObject({ kind: "roshan", x: 150, y: 140 })
  })

  it("credits the kill to whichever team the event names", () => {
    const radiantKill = event({ type: "roshan", key: "team=2", x: 1, y: 1 })
    expect(neutralKillsFromEvents([radiantKill], true)[0].byScouted).toBe(true)
    expect(neutralKillsFromEvents([radiantKill], false)[0].byScouted).toBe(
      false,
    )
  })

  it("drops a kill with no recorded position instead of drawing it at 0,0", () => {
    expect(
      neutralKillsFromEvents([event({ type: "roshan", key: "team=2" })], true),
    ).toEqual([])
  })
})

describe("activeNeutralsAt", () => {
  const roshan = neutralKillsFromEvents(
    [event({ type: "roshan", time: 1000, x: 150, y: 140, key: "team=2" })],
    true,
  )

  it("shows nothing before the kill", () => {
    expect(activeNeutralsAt(roshan, 999)).toEqual([])
  })

  it("shows it solidly while it is certainly down", () => {
    expect(activeNeutralsAt(roshan, 1200)).toHaveLength(1)
    expect(activeNeutralsAt(roshan, 1200)[0].fading).toBe(false)
  })

  it("fades through the window where it may already be back", () => {
    // Roshan's respawn is randomised across three minutes, so there is no
    // moment to snap off at without claiming a precision the game lacks.
    expect(activeNeutralsAt(roshan, 1500)[0].fading).toBe(true)
  })

  it("clears once it has certainly respawned", () => {
    // Otherwise a 45-minute game ends up carrying three stale Roshan markers,
    // each asserting something that stopped being true half an hour earlier.
    expect(activeNeutralsAt(roshan, 1660)).toEqual([])
  })

  it("never fades the Tormentor, whose ten minutes are fixed", () => {
    const torm = neutralKillsFromEvents(
      [event({ type: "tormentor", time: 1200, x: 90, y: 90, key: "team=3" })],
      true,
    )

    expect(activeNeutralsAt(torm, 1799)[0].fading).toBe(false)
    expect(activeNeutralsAt(torm, 1800)).toEqual([])
  })
})
