import { describe, expect, it } from "vitest"
import type { DivisionPlayerRow } from "../league-aggregate/league-aggregate-api"
import {
  COLUMNS,
  MIN_GAMES,
  formatTeams,
  parseDirection,
  parsePosition,
  parseSort,
  sortRows,
  splitBySample,
} from "./division-players-utils"

function row(overrides: Partial<DivisionPlayerRow> = {}): DivisionPlayerRow {
  return {
    playerId: 1,
    name: "Someone",
    position: "POSITION_1",
    teamIds: [100],
    games: 5,
    wins: 3,
    goldAt10: 2800,
    xpAt10: 3000,
    lhAt10: 50,
    gpm: 500,
    xpm: 600,
    kda: 3,
    heroDamagePerMin: 400,
    obsPerMin: 0.1,
    senPerMin: 0.05,
    ...overrides,
  }
}

const column = (key: string) => {
  const found = COLUMNS.find(entry => entry.key === key)
  if (!found) throw new Error(`No column ${key}`)
  return found
}

describe("sortRows", () => {
  it("puts the largest first when descending", () => {
    const sorted = sortRows(
      [row({ name: "low", gpm: 400 }), row({ name: "high", gpm: 700 })],
      "gpm",
      "desc",
    )

    expect(sorted.map(entry => entry.name)).toEqual(["high", "low"])
  })

  it("reverses when ascending", () => {
    const sorted = sortRows(
      [row({ name: "low", gpm: 400 }), row({ name: "high", gpm: 700 })],
      "gpm",
      "asc",
    )

    expect(sorted.map(entry => entry.name)).toEqual(["low", "high"])
  })

  // A support with no ward data hasn't warded least. Sorting them to the top of
  // an ascending OBS/m column would say exactly that.
  it("sorts missing data last in both directions", () => {
    const rows = [
      row({ name: "unknown", obsPerMin: null }),
      row({ name: "known", obsPerMin: 0.3 }),
    ]

    expect(sortRows(rows, "obsPerMin", "desc").map(e => e.name)).toEqual([
      "known",
      "unknown",
    ])
    expect(sortRows(rows, "obsPerMin", "asc").map(e => e.name)).toEqual([
      "known",
      "unknown",
    ])
  })

  it("breaks ties by name so re-sorting doesn't shuffle the board", () => {
    const sorted = sortRows(
      [row({ name: "Zed", gpm: 500 }), row({ name: "Ana", gpm: 500 })],
      "gpm",
      "desc",
    )

    expect(sorted.map(entry => entry.name)).toEqual(["Ana", "Zed"])
  })

  it("falls back to the first column when the URL names one we don't have", () => {
    expect(() => sortRows([row()], "cleverness", "desc")).not.toThrow()
  })

  it("leaves the input array alone", () => {
    const rows = [row({ name: "a", gpm: 400 }), row({ name: "b", gpm: 700 })]
    sortRows(rows, "gpm", "desc")

    expect(rows.map(entry => entry.name)).toEqual(["a", "b"])
  })

  it("ranks by win rate rather than by wins", () => {
    const sorted = sortRows(
      [
        row({ name: "grinder", games: 10, wins: 6 }),
        row({ name: "sharp", games: 4, wins: 4 }),
      ],
      "winPct",
      "desc",
    )

    expect(sorted.map(entry => entry.name)).toEqual(["sharp", "grinder"])
  })
})

describe("splitBySample", () => {
  it("ranks only the rows at or above the floor", () => {
    const { ranked, lowSample } = splitBySample([
      row({ name: "regular", games: MIN_GAMES }),
      row({ name: "cameo", games: MIN_GAMES - 1 }),
    ])

    expect(ranked.map(entry => entry.name)).toEqual(["regular"])
    expect(lowSample.map(entry => entry.name)).toEqual(["cameo"])
  })

  // The floor hides a rank, not a player. Fifteen of S47's twenty-two carries
  // fall below it, and deleting them would claim a field the division doesn't
  // have.
  it("keeps every row somewhere", () => {
    const rows = [row({ games: 1 }), row({ games: 9 })]
    const { ranked, lowSample } = splitBySample(rows)

    expect(ranked.length + lowSample.length).toBe(rows.length)
  })
})

describe("column formatting", () => {
  it("renders a missing stat as an em dash rather than a zero", () => {
    expect(column("goldAt10").format(row({ goldAt10: null }))).toBe("—")
    expect(column("obsPerMin").format(row({ obsPerMin: null }))).toBe("—")
  })

  it("keeps a genuine zero visible as a zero", () => {
    expect(column("obsPerMin").format(row({ obsPerMin: 0 }))).toBe("0.00")
  })

  // Per minute is the comparable quantity; per ten is the readable one. At the
  // former, every core in a division renders "0.00" and the column is dead.
  it("shows ward rates per ten minutes", () => {
    expect(column("obsPerMin").format(row({ obsPerMin: 0.214 }))).toBe("2.14")
    expect(column("senPerMin").format(row({ senPerMin: 0.01 }))).toBe("0.10")
  })

  it("sorts wards on the underlying rate, which the scaling can't reorder", () => {
    const sorted = sortRows(
      [
        row({ name: "core", obsPerMin: 0.01 }),
        row({ name: "support", obsPerMin: 0.214 }),
      ],
      "obsPerMin",
      "desc",
    )

    expect(sorted.map(entry => entry.name)).toEqual(["support", "core"])
  })

  it("shows a record with its win rate", () => {
    expect(column("winPct").format(row({ games: 5, wins: 3 }))).toBe("3-2 (60%)")
  })
})

describe("URL parsing", () => {
  it("reads a position out of the short form", () => {
    expect(parsePosition("4")).toBe("POSITION_4")
  })

  it("defaults a position the URL doesn't name or names wrongly", () => {
    expect(parsePosition(null)).toBe("POSITION_1")
    expect(parsePosition("9")).toBe("POSITION_1")
    expect(parsePosition("POSITION_2")).toBe("POSITION_1")
  })

  it("keeps a sort key we have and drops one we don't", () => {
    expect(parseSort("xpAt10")).toBe("xpAt10")
    expect(parseSort("vibes")).toBe("games")
    expect(parseSort(null)).toBe("games")
  })

  it("treats anything but asc as descending", () => {
    expect(parseDirection("asc")).toBe("asc")
    expect(parseDirection("desc")).toBe("desc")
    expect(parseDirection("sideways")).toBe("desc")
    expect(parseDirection(null)).toBe("desc")
  })
})

describe("formatTeams", () => {
  const names: Record<number, string> = { 100: "Sharkhorse", 200: "For Glort" }
  const getTeamName = (teamId: number) => names[teamId] ?? "Unknown Team"

  it("names the one team a player played for", () => {
    expect(formatTeams([100], getTeamName)).toBe("Sharkhorse")
  })

  // Rather than naming whichever they played most, which would be quietly wrong
  // for a tenth of the field.
  it("counts the rest when a stand-in covered for more than one", () => {
    expect(formatTeams([100, 200], getTeamName)).toBe("Sharkhorse +1")
  })

  it("dashes a row whose match predates its teams being registered", () => {
    expect(formatTeams([], getTeamName)).toBe("—")
  })
})
