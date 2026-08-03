import { describe, expect, it } from "vitest"
import { encodePositions, type SlotSamples } from "../../shared/position-codec"
import type { PositionMatch, PositionSlot } from "../../api/match-positions"
import {
  binPlayer,
  decodeMatch,
  eventsNear,
  playersForTeam,
  positionBounds,
  slotsForPlayer,
} from "./movement"

const TEAM = 900
const ENEMY = 901

function toBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/**
 * A match where every slot stands still at its own coordinate for `seconds`.
 *
 * Constant positions make the binning assertions exact: a player parked at one
 * spot for N seconds must produce a single bin holding N.
 */
function makeMatch({
  id,
  seconds = 10,
  firstTime = 0,
  slots,
  deadFrom = null,
}: {
  id: number
  seconds?: number
  firstTime?: number
  slots: Omit<PositionSlot, "slot">[]
  /** Sample index from which slot 0 counts as dead. */
  deadFrom?: number | null
}): PositionMatch {
  const samples: SlotSamples[] = slots.map((slot, i) => ({
    heroId: slot.heroId,
    x: Array.from({ length: seconds }, () => 70 + i * 10),
    y: Array.from({ length: seconds }, () => 70 + i * 10),
    dead: Array.from(
      { length: seconds },
      (_, s) => i === 0 && deadFrom !== null && s >= deadFrom,
    ),
  }))
  const encoded = encodePositions(samples)

  return {
    id,
    start_date_time: 1769738631,
    isRadiant: true,
    opponentTeamId: ENEMY,
    winning_team_id: TEAM,
    encoding: "delta-i16-0.1grid-gz-v1",
    firstTime,
    sampleCount: seconds,
    slots: slots.map((slot, i) => ({ ...slot, slot: i })),
    positions: toBase64(encoded.positions),
    lifeStates: toBase64(encoded.lifeStates),
  }
}

const ROSTER: Omit<PositionSlot, "slot">[] = [
  {
    heroId: 1,
    playerId: 11,
    playerName: "Ana",
    position: "POSITION_1",
    teamId: TEAM,
  },
  {
    heroId: 2,
    playerId: 12,
    playerName: "Bo",
    position: "POSITION_5",
    teamId: TEAM,
  },
  {
    heroId: 3,
    playerId: 21,
    playerName: "Cy",
    position: "POSITION_1",
    teamId: ENEMY,
  },
]

describe("decodeMatch", () => {
  it("round-trips a base64 payload back into grid coordinates", () => {
    const decoded = decodeMatch(makeMatch({ id: 1, slots: ROSTER }))
    expect(decoded.positions.slots).toHaveLength(3)
    expect(decoded.positions.slots[0].x[0]).toBeCloseTo(70, 1)
    expect(decoded.positions.slots[2].y[9]).toBeCloseTo(90, 1)
  })
})

describe("playersForTeam", () => {
  it("aggregates by player id and counts their games", () => {
    const matches = [
      makeMatch({ id: 1, slots: ROSTER }),
      makeMatch({ id: 2, slots: ROSTER }),
    ]
    const players = playersForTeam(matches, TEAM)
    expect(players.map(p => [p.playerId, p.games])).toEqual([
      [11, 2],
      [12, 2],
    ])
  })

  it("excludes the opposing team", () => {
    const players = playersForTeam([makeMatch({ id: 1, slots: ROSTER })], TEAM)
    expect(players.some(p => p.playerId === 21)).toBe(false)
  })

  it("keeps one entry when a player is renamed between matches", () => {
    // The same human appears under different `player_name`s across a season,
    // so name is a label and id is the identity.
    const renamed = ROSTER.map(s =>
      s.playerId === 11 ? { ...s, playerName: "Ana2" } : s,
    )
    const players = playersForTeam(
      [
        makeMatch({ id: 1, slots: renamed }),
        makeMatch({ id: 2, slots: ROSTER }),
      ],
      TEAM,
    )
    const ana = players.find(p => p.playerId === 11)
    expect(ana?.games).toBe(2)
    // Newest match wins the label; matches arrive newest-first.
    expect(ana?.name).toBe("Ana2")
  })

  it("does not merge two people who shared a position", () => {
    // 32 of 40 AD2L S47 position slots were played by more than one person, so
    // this is the common case rather than the edge case.
    const swapped = ROSTER.map(s =>
      s.playerId === 12
        ? { ...s, playerId: 13, playerName: "Dee", heroId: 2 }
        : s,
    )
    const players = playersForTeam(
      [
        makeMatch({ id: 1, slots: ROSTER }),
        makeMatch({ id: 2, slots: swapped }),
      ],
      TEAM,
    )
    expect(players.filter(p => p.position === "POSITION_5")).toHaveLength(2)
    expect(players.find(p => p.playerId === 12)?.games).toBe(1)
    expect(players.find(p => p.playerId === 13)?.games).toBe(1)
  })
})

describe("slotsForPlayer", () => {
  it("finds the slot a player occupied", () => {
    const match = makeMatch({ id: 1, slots: ROSTER })
    expect(slotsForPlayer(match, 12).map(s => s.slot)).toEqual([1])
    expect(slotsForPlayer(match, 999)).toEqual([])
  })
})

describe("positionBounds", () => {
  it("spans the widest window across the games, including pre-horn", () => {
    const bounds = positionBounds([
      makeMatch({ id: 1, firstTime: -89, seconds: 100, slots: ROSTER }),
      makeMatch({ id: 2, firstTime: -20, seconds: 300, slots: ROSTER }),
    ])
    expect(bounds).toEqual({ from: -89, to: 279 })
  })
})

describe("binPlayer", () => {
  const range = { from: -1000, to: 10000 }

  it("counts one alive second per sample into a single cell", () => {
    const decoded = [makeMatch({ id: 1, seconds: 10, slots: ROSTER })].map(
      decodeMatch,
    )
    const heatmap = binPlayer(decoded, 11, range)
    expect(heatmap.samples).toBe(10)
    expect(heatmap.games).toBe(1)
    expect([...heatmap.bins].filter(v => v > 0)).toEqual([10])
  })

  it("accumulates across games and reports the game count", () => {
    const decoded = [
      makeMatch({ id: 1, seconds: 10, slots: ROSTER }),
      makeMatch({ id: 2, seconds: 10, slots: ROSTER }),
    ].map(decodeMatch)
    const heatmap = binPlayer(decoded, 11, range)
    expect(heatmap.samples).toBe(20)
    expect(heatmap.games).toBe(2)
  })

  it("excludes time spent dead", () => {
    // 12.6% of a real game is spent dead, parked on a corpse or the fountain.
    // Counting it would put a permanent hotspot on both.
    const decoded = [
      makeMatch({ id: 1, seconds: 10, slots: ROSTER, deadFrom: 4 }),
    ].map(decodeMatch)
    expect(binPlayer(decoded, 11, range).samples).toBe(4)
  })

  it("honours the time range", () => {
    const decoded = [
      makeMatch({ id: 1, firstTime: 0, seconds: 100, slots: ROSTER }),
    ].map(decodeMatch)
    expect(binPlayer(decoded, 11, { from: 10, to: 19 }).samples).toBe(10)
  })

  it("clips a range reaching past a shorter game rather than overrunning", () => {
    const decoded = [
      makeMatch({ id: 1, firstTime: 0, seconds: 50, slots: ROSTER }),
    ].map(decodeMatch)
    const heatmap = binPlayer(decoded, 11, { from: 0, to: 5000 })
    expect(heatmap.samples).toBe(50)
  })

  it("reports no games for a player who never appears", () => {
    const decoded = [makeMatch({ id: 1, slots: ROSTER })].map(decodeMatch)
    const heatmap = binPlayer(decoded, 404, range)
    expect(heatmap).toMatchObject({ samples: 0, games: 0 })
  })

  it("counts a game only when the range actually overlaps it", () => {
    // The game-count caption is the only thing distinguishing a two-game
    // heatmap from a twenty-game one, so it must count contributing games
    // rather than fetched ones.
    const decoded = [
      makeMatch({ id: 1, firstTime: 0, seconds: 10, slots: ROSTER }),
      makeMatch({ id: 2, firstTime: 0, seconds: 600, slots: ROSTER }),
    ].map(decodeMatch)
    expect(binPlayer(decoded, 11, { from: 100, to: 200 }).games).toBe(1)
  })
})

describe("eventsNear", () => {
  const events = [
    {
      matchId: 1,
      time: 10,
      type: "hero_death",
      slot: 0,
      target_slot: 1,
      key: null,
      x: 100,
      y: 100,
    },
    {
      matchId: 1,
      time: 25,
      type: "smoke",
      slot: 2,
      target_slot: null,
      key: null,
      x: 110,
      y: 110,
    },
    {
      matchId: 1,
      time: 25,
      type: "scan",
      slot: null,
      target_slot: null,
      key: "team=2",
      x: null,
      y: null,
    },
    {
      matchId: 2,
      time: 25,
      type: "hero_death",
      slot: 0,
      target_slot: 1,
      key: null,
      x: 100,
      y: 100,
    },
  ]

  it("returns only positioned events for the match, in a trailing window", () => {
    expect(eventsNear(events, 1, 30, 20).map(e => e.type)).toEqual(["smoke"])
  })

  it("excludes events after the playhead", () => {
    expect(eventsNear(events, 1, 20, 20).map(e => e.type)).toEqual([
      "hero_death",
    ])
  })

  it("drops events with no coordinates rather than drawing them at the origin", () => {
    // Scans and glyphs are stored without a position on purpose; rendering them
    // at (0,0) would put a marker in the corner of the map every time.
    expect(eventsNear(events, 1, 25, 5).some(e => e.type === "scan")).toBe(
      false,
    )
  })
})
