import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { extractWards } from "./wards"

describe("extractWards", () => {
  it("pairs a placement to its removal by ehandle", () => {
    const wards = extractWards({
      obs_log: [{ time: 365, x: 129.5, y: 118.2, ehandle: 1 }],
      obs_left_log: [
        {
          time: 725,
          x: 129.5,
          y: 118.2,
          ehandle: 1,
          attackername: "npc_dota_hero_dragon_knight",
        },
      ],
    })
    expect(wards).toEqual([
      {
        type: "obs",
        x: 129.5,
        y: 118.2,
        placed: 365,
        left: 725,
        by: "dragon_knight",
      },
    ])
  })

  it("does not mispair when a player replaces a ward at the same spot", () => {
    // Same x/y, different entity: pairing on position instead of ehandle would
    // cross the wires and produce nonsense lifespans.
    const wards = extractWards({
      obs_log: [
        { time: 100, x: 130, y: 118, ehandle: 1 },
        { time: 500, x: 130, y: 118, ehandle: 2 },
      ],
      obs_left_log: [
        { time: 860, x: 130, y: 118, ehandle: 2 },
        { time: 460, x: 130, y: 118, ehandle: 1 },
      ],
    })
    expect(wards?.map(w => [w.placed, w.left])).toEqual([
      [100, 460],
      [500, 860],
    ])
  })

  it("leaves `left` null for a ward still standing at game end", () => {
    const wards = extractWards({
      obs_log: [{ time: 3200, x: 130, y: 118, ehandle: 9 }],
      obs_left_log: [],
    })
    expect(wards?.[0].left).toBeNull()
    expect(wards?.[0].by).toBeNull()
  })

  it("returns [] for a parsed player who placed nothing, not null", () => {
    // [] and null mean different things downstream; a core with no wards is
    // data, an unparsed replay is the absence of it.
    expect(extractWards({ obs_log: [], sen_log: [] })).toEqual([])
  })

  it("returns null when the replay carries no ward logs at all", () => {
    expect(extractWards({})).toBeNull()
  })

  it("sorts observers and sentries together by placement time", () => {
    const wards = extractWards({
      obs_log: [{ time: 300, x: 100, y: 100, ehandle: 1 }],
      sen_log: [{ time: 50, x: 100, y: 100, ehandle: 2 }],
    })
    expect(wards?.map(w => [w.type, w.placed])).toEqual([
      ["sen", 50],
      ["obs", 300],
    ])
  })
})

describe("extractWards against real replay data", () => {
  // Guards the whole pipeline against a change in OpenDota's payload shape.
  const match = JSON.parse(
    readFileSync("scripts/opendota-match-8669782562.json", "utf8"),
  ) as { players: Parameters<typeof extractWards>[0][] }

  it("extracts the known ward counts for match 8669782562", () => {
    const all = match.players.flatMap(p => extractWards(p) ?? [])
    expect(all.filter(w => w.type === "obs")).toHaveLength(51)
    expect(all.filter(w => w.type === "sen")).toHaveLength(95)
  })

  it("leaves exactly the wards that outlived the game unpaired", () => {
    const all = match.players.flatMap(p => extractWards(p) ?? [])
    // 51 observers placed, 48 removals logged.
    expect(all.filter(w => w.type === "obs" && w.left === null)).toHaveLength(3)
    expect(all.filter(w => w.type === "sen" && w.left === null)).toHaveLength(0)
  })

  it("never produces a negative lifespan", () => {
    const all = match.players.flatMap(p => extractWards(p) ?? [])
    const negative = all.filter(w => w.left !== null && w.left < w.placed)
    expect(negative).toEqual([])
  })

  it("gives cores empty arrays rather than null", () => {
    const counts = match.players.map(p => extractWards(p)?.length ?? -1)
    expect(counts).not.toContain(-1)
    expect(counts.filter(c => c === 0).length).toBeGreaterThan(0)
  })
})
