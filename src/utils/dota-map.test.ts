import { describe, expect, it } from "vitest"
import {
  ALL_TOWERS,
  laneForRole,
  laneRoleOf,
  ROSHAN_PITS,
  TORMENTOR_SPOTS,
  parseTowerKey,
  roshanPitAt,
  tormentorSpotAt,
  towerPosition,
} from "./dota-map"

describe("parseTowerKey", () => {
  it("reads side, tier and lane from an OpenDota building key", () => {
    expect(parseTowerKey("npc_dota_goodguys_tower1_bot")).toEqual({
      side: "radiant",
      tier: 1,
      lane: "bot",
    })
    expect(parseTowerKey("npc_dota_badguys_tower3_mid")).toEqual({
      side: "dire",
      tier: 3,
      lane: "mid",
    })
  })

  it("rejects buildings that are stored but never plotted", () => {
    // T4s sit on top of each other in the base and fall after the game is
    // decided; barracks and the fort are not towers at all.
    expect(parseTowerKey("npc_dota_goodguys_tower4_top")).toBeNull()
    expect(parseTowerKey("npc_dota_goodguys_melee_rax_mid")).toBeNull()
    expect(parseTowerKey("npc_dota_goodguys_fort")).toBeNull()
  })

  it("rejects the numeric key first blood puts in the same field", () => {
    // CHAT_MESSAGE_FIRSTBLOOD stores the victim's slot in `key`, so a naive
    // reader would treat "9" as a building.
    expect(parseTowerKey("9")).toBeNull()
    expect(parseTowerKey(null)).toBeNull()
  })
})

describe("tower geometry", () => {
  it("covers eighteen towers, both sides", () => {
    expect(ALL_TOWERS).toHaveLength(18)
    expect(ALL_TOWERS.filter(t => t.side === "radiant")).toHaveLength(9)
  })

  it("places every tower inside the minimap", () => {
    for (const tower of ALL_TOWERS) {
      const { x, y } = towerPosition(tower)
      expect(x).toBeGreaterThan(0)
      expect(x).toBeLessThan(1)
      expect(y).toBeGreaterThan(0)
      expect(y).toBeLessThan(1)
    }
  })

  it("puts Radiant's base towers nearer the bottom-left corner", () => {
    // Guards against a side flip: Radiant is bottom-left on this minimap, so its
    // T3s must sit closer to that corner than Dire's.
    const radiantT3 = ALL_TOWERS.filter(
      t => t.side === "radiant" && t.tier === 3,
    ).map(towerPosition)
    const direT3 = ALL_TOWERS.filter(
      t => t.side === "dire" && t.tier === 3,
    ).map(towerPosition)

    const dist = (p: { x: number; y: number }) => Math.hypot(p.x, 1 - p.y)
    expect(Math.max(...radiantT3.map(dist))).toBeLessThan(
      Math.min(...direT3.map(dist)),
    )
  })
})

const PATCH_741 = 60
const PATCH_740 = 59

describe("roshanPitAt", () => {
  it("starts south and alternates every five minutes", () => {
    expect(roshanPitAt(0, PATCH_741)).toBe("south")
    expect(roshanPitAt(299, PATCH_741)).toBe("south")
    expect(roshanPitAt(300, PATCH_741)).toBe("north")
    expect(roshanPitAt(599, PATCH_741)).toBe("north")
    expect(roshanPitAt(600, PATCH_741)).toBe("south")
    expect(roshanPitAt(900, PATCH_741)).toBe("north")
  })

  it("evaluates the clock at death, not at spawn", () => {
    // The sample match's second Roshan died at 33:30. Its spawn window (29:02 to
    // 32:02) straddles the 30:00 boundary, so a spawn-clock rule could not
    // resolve the pit at all; a death-clock rule answers unambiguously.
    expect(roshanPitAt(2010, PATCH_741)).toBe("south")
  })

  it("handles pre-horn seconds without folding them onto the first period", () => {
    // Floor, not truncate: -1 second is period -1, not period 0.
    expect(roshanPitAt(-19, PATCH_741)).toBe("north")
  })

  it("refuses to guess on patches the rule was not confirmed for", () => {
    // Half this database predates 7.41. Drawing the wrong pit on those games is
    // worse than drawing nothing.
    expect(roshanPitAt(600, PATCH_740)).toBeNull()
    expect(roshanPitAt(600, null)).toBeNull()
  })
})

describe("lane roles", () => {
  it("reads top as Radiant's off lane and Dire's safe lane", () => {
    // The whole reason the tempo table normalises: one lane, two meanings.
    expect(laneRoleOf("radiant", "top")).toBe("off")
    expect(laneRoleOf("dire", "top")).toBe("safe")
    expect(laneRoleOf("radiant", "bot")).toBe("safe")
    expect(laneRoleOf("dire", "bot")).toBe("off")
    expect(laneRoleOf("radiant", "mid")).toBe("mid")
    expect(laneRoleOf("dire", "mid")).toBe("mid")
  })

  it("round-trips through laneForRole", () => {
    // The inverse is used to read side-keyed league figures back out by role,
    // so a drift between the two tables would silently compare the wrong towers.
    for (const side of ["radiant", "dire"] as const) {
      for (const lane of ["top", "mid", "bot"] as const) {
        expect(laneForRole(side, laneRoleOf(side, lane))).toBe(lane)
      }
    }
  })
})

describe("pit coordinates", () => {
  it("puts the south pit at the upper-left lava pit, not the lower-right one", () => {
    // Deliberately counter-intuitive and settled by data, not by the map art:
    // matching each Roshan kill against where the killing team had just warded
    // agreed 99% with this labelling and 1% with the reverse. The obvious
    // "fix" is to swap these back, so the finding is pinned here.
    expect(ROSHAN_PITS.south.x).toBeLessThan(0.5)
    expect(ROSHAN_PITS.north.x).toBeGreaterThan(0.5)
  })

  it("keeps the Tormentor spots opposite the pits along the river axis", () => {
    // The river runs upper-left to lower-right, so position along it is x + y.
    // Roshan south is at the low end, so the Tormentor paired with it — north —
    // has to be at the high end, or "always opposite" stops being true.
    const along = (p: { x: number; y: number }) => p.x + p.y
    expect(along(ROSHAN_PITS.south)).toBeLessThan(along(ROSHAN_PITS.north))
    expect(along(TORMENTOR_SPOTS.north)).toBeGreaterThan(
      along(TORMENTOR_SPOTS.south),
    )
  })
})

describe("tormentorSpotAt", () => {
  it("is always opposite Roshan", () => {
    for (const time of [0, 250, 300, 610, 1262, 2010, 3056]) {
      expect(tormentorSpotAt(time, PATCH_741)).not.toBe(
        roshanPitAt(time, PATCH_741),
      )
    }
  })

  it("starts north, mirroring Roshan's southern start", () => {
    expect(tormentorSpotAt(0, PATCH_741)).toBe("north")
  })

  it("is null wherever Roshan's pit is unknown", () => {
    expect(tormentorSpotAt(600, PATCH_740)).toBeNull()
  })
})
