import { describe, expect, it } from "vitest"
import { DIVISIONS, divisionsIn, isDivision } from "./divisions"

describe("divisionsIn", () => {
  it("orders by skill tier, not by the order teams happen to appear", () => {
    expect(divisionsIn(["Conqueror", "Voyager", "Warrior"])).toEqual([
      "Voyager",
      "Warrior",
      "Conqueror",
    ])
  })

  it("deduplicates — a division with eight teams is still one division", () => {
    expect(divisionsIn(["Voyager", "Voyager", "Voyager"])).toEqual(["Voyager"])
  })

  // Whether a league has divisions is derived from this being non-empty, so an
  // all-NULL league is what keeps Seasons 45-47 and every non-AD2L tournament
  // behaving exactly as they did before divisions existed.
  it("is empty for a league where no team has a division", () => {
    expect(divisionsIn([null, null, null])).toEqual([])
  })

  it("ignores NULLs mixed in with real divisions", () => {
    expect(divisionsIn(["Warrior", null, "Voyager"])).toEqual(["Voyager", "Warrior"])
  })

  // A typo would otherwise become a bracket of its own in the picker, with its
  // own aggregate. The team itself is still reachable — the picker files
  // anything unrecognised under "Unassigned".
  it("drops names outside the vocabulary rather than inventing a division", () => {
    expect(divisionsIn(["Voyagr", "Voyager"])).toEqual(["Voyager"])
  })

  it("recognizes exactly the declared vocabulary", () => {
    expect(DIVISIONS.every(isDivision)).toBe(true)
    expect(isDivision("voyager")).toBe(false)
    expect(isDivision(null)).toBe(false)
  })
})
