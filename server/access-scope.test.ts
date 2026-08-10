import { describe, expect, it } from "vitest"
import {
  ADMIN_SCOPE,
  canReadAggregate,
  canReadDivision,
  canReadLeague,
  grantedDivisions,
  hasAnyAccess,
  teamsVisibleTo,
  visibleLeagueIds,
} from "./access-scope.js"
import type { AccessScope } from "./access-scope.js"

const S48 = 19555
const S47 = 19554

function scoped(...grants: [number, string][]): AccessScope {
  return {
    isAdmin: false,
    grants: grants.map(([leagueId, division]) => ({ leagueId, division })),
  }
}

const warrior = scoped([S48, "Warrior"])
const nobody: AccessScope = { isAdmin: false, grants: [] }

describe("hasAnyAccess", () => {
  it("is true for an admin and for anyone holding a grant", () => {
    expect(hasAnyAccess(ADMIN_SCOPE)).toBe(true)
    expect(hasAnyAccess(warrior)).toBe(true)
  })

  // The state of a brand-new account in the window between the captain signing
  // up and the grant script being run. It has to be distinguishable from a
  // failed request, because it is the first screen they ever see.
  it("is false for a signed-in user with nothing", () => {
    expect(hasAnyAccess(nobody)).toBe(false)
  })
})

describe("canReadLeague", () => {
  it("admits an admin to any league", () => {
    expect(canReadLeague(ADMIN_SCOPE, S47)).toBe(true)
  })

  it("admits a scoped user only to a league they hold a grant in", () => {
    expect(canReadLeague(warrior, S48)).toBe(true)
    expect(canReadLeague(warrior, S47)).toBe(false)
  })

  // The whole reason this is closed by default. Season 47 and the Scrims league
  // have no divisions at all, so a division filter over them filters nothing —
  // an open default would hand them over entire.
  it("keeps a scoped user out of the division-less leagues", () => {
    for (const leagueId of [111, 18604, 19137, 19554]) {
      expect(canReadLeague(warrior, leagueId)).toBe(false)
    }
  })
})

describe("canReadDivision", () => {
  it("admits an admin to anything, including unassigned teams", () => {
    expect(canReadDivision(ADMIN_SCOPE, S48, "Conqueror")).toBe(true)
    expect(canReadDivision(ADMIN_SCOPE, S48, null)).toBe(true)
  })

  it("admits a scoped user to their own division only", () => {
    expect(canReadDivision(warrior, S48, "Warrior")).toBe(true)
    expect(canReadDivision(warrior, S48, "Conqueror")).toBe(false)
  })

  // A grant is (league, division), not a division name that travels. Holding
  // Warrior in Season 48 says nothing about Warrior in Season 49.
  it("does not let a division name leak across leagues", () => {
    expect(canReadDivision(warrior, 19556, "Warrior")).toBe(false)
  })

  // NULL means "no division recorded", which is not a bracket anyone was
  // granted. This is the case that makes a forgotten division on a new team
  // invisible to exactly the people who need it — deliberate, and the reason
  // the team dropdown labels the Unassigned group as a to-do.
  it("hides teams with no division from a scoped user", () => {
    expect(canReadDivision(warrior, S48, null)).toBe(false)
  })

  it("lets one user hold two divisions", () => {
    const both = scoped([S48, "Warrior"], [S48, "Conqueror"])
    expect(canReadDivision(both, S48, "Warrior")).toBe(true)
    expect(canReadDivision(both, S48, "Conqueror")).toBe(true)
    expect(canReadDivision(both, S48, "Voyager")).toBe(false)
  })

  // A bracket AD2L renamed between seasons. The grant matches no team, so it
  // grants nothing — no special case needed, but worth pinning so nobody
  // "fixes" it into a fuzzy match later.
  it("grants nothing for a division name outside the vocabulary", () => {
    expect(canReadDivision(scoped([S48, "Voyaguer"]), S48, "Voyager")).toBe(
      false,
    )
  })
})

describe("grantedDivisions", () => {
  it("returns vocabulary order, not insertion or alphabetical order", () => {
    const many = scoped([S48, "Conqueror"], [S48, "Voyager"], [S48, "Warrior"])
    expect(grantedDivisions(many, S48)).toEqual([
      "Voyager",
      "Warrior",
      "Conqueror",
    ])
  })

  it("ignores grants in other leagues", () => {
    const mixed = scoped([S48, "Warrior"], [S47, "Voyager"])
    expect(grantedDivisions(mixed, S48)).toEqual(["Warrior"])
  })

  // An admin's real list depends on which teams exist, which this cannot know.
  it("is empty for an admin", () => {
    expect(grantedDivisions(ADMIN_SCOPE, S48)).toEqual([])
  })

  it("keeps an unrecognised bracket rather than dropping it", () => {
    expect(grantedDivisions(scoped([S48, "Ascendant"]), S48)).toEqual([
      "Ascendant",
    ])
  })
})

describe("visibleLeagueIds", () => {
  it("deduplicates a user holding two divisions in one league", () => {
    const both = scoped([S48, "Warrior"], [S48, "Conqueror"])
    expect(visibleLeagueIds(both)).toEqual([S48])
  })
})

describe("teamsVisibleTo", () => {
  const teams = [
    { team_id: 1, division: "Warrior" },
    { team_id: 2, division: "Conqueror" },
    { team_id: 3, division: null },
  ]

  it("gives an admin every team, unassigned included", () => {
    expect(teamsVisibleTo(ADMIN_SCOPE, S48, teams)).toEqual(teams)
  })

  it("gives a scoped user only their own division", () => {
    expect(teamsVisibleTo(warrior, S48, teams)).toEqual([
      { team_id: 1, division: "Warrior" },
    ])
  })

  // What the header's division dropdown is derived from. An empty result is how
  // a granted-but-unseeded league renders, which is the state every league in
  // the database is in today.
  it("gives a scoped user nothing when no team has been assigned a division", () => {
    expect(teamsVisibleTo(warrior, S48, [{ division: null }])).toEqual([])
  })
})

describe("canReadAggregate", () => {
  it("lets an admin ask for a whole league", () => {
    expect(canReadAggregate(ADMIN_SCOPE, S48, undefined)).toBe(true)
  })

  it("lets a scoped user ask for their own division", () => {
    expect(canReadAggregate(warrior, S48, "Warrior")).toBe(true)
  })

  // The claim this route has always taken from the client. Dropping the param
  // used to mean "every match in the league" — for a scoped user that is both
  // the leak and the statistical mistake matchesWithinDivision prevents.
  it("refuses a scoped user who omits the division", () => {
    expect(canReadAggregate(warrior, S48, undefined)).toBe(false)
  })

  it("refuses a division the caller was not granted", () => {
    expect(canReadAggregate(warrior, S48, "Conqueror")).toBe(false)
  })
})
