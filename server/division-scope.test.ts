import { describe, expect, it } from "vitest"
import { matchesWithinDivision } from "./division-scope.js"

function match(id: number, radiant: number | null, dire: number | null) {
  return { id, radiant_team_id: radiant, dire_team_id: dire }
}

describe("matchesWithinDivision", () => {
  const voyager = new Set([1, 2, 3])

  it("keeps a game both teams played in the division", () => {
    expect(matchesWithinDivision([match(10, 1, 2)], voyager)).toEqual([match(10, 1, 2)])
  })

  // The bug this exists to prevent: a Conqueror team registered so you can scout
  // it for a scrim brings its own league games with it, and without this their
  // drafts land in Voyager's contest rate.
  it("drops a game between two teams from another division", () => {
    expect(matchesWithinDivision([match(10, 8, 9)], voyager)).toEqual([])
  })

  it("drops a game with only one team in the division", () => {
    expect(matchesWithinDivision([match(10, 1, 9)], voyager)).toEqual([])
    expect(matchesWithinDivision([match(11, 9, 1)], voyager)).toEqual([])
  })

  // Teams added without a division are in no division's team set, so their games
  // count toward no aggregate — the same strict rule, not a special case.
  it("drops a game whose teams have no division", () => {
    expect(matchesWithinDivision([match(10, 1, 2)], new Set())).toEqual([])
  })

  // A match parsed before its teams were registered has null team ids. `has`
  // would never match null anyway, but leaving it implicit invites someone to
  // "simplify" the null checks away later.
  it("drops a game with missing team ids", () => {
    expect(matchesWithinDivision([match(10, null, 2), match(11, 1, null)], voyager)).toEqual([])
  })
})
