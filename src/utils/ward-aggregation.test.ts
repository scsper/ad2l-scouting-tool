import { describe, expect, it } from "vitest"
import type { WardRecord } from "../../types/db"
import type { WardMatch } from "../features/wards/wards-api"
import {
  collectWards,
  filterBySide,
  formatGameTime,
  getCoverage,
  getDefaultTime,
  getTimeBounds,
  labelMatches,
  majoritySide,
  wardsAliveAt,
} from "./ward-aggregation"

const ward = (over: Partial<WardRecord> = {}): WardRecord => ({
  type: "obs",
  x: 130,
  y: 118,
  placed: 100,
  left: 460,
  by: null,
  ...over,
})

const match = (over: Partial<WardMatch> = {}): WardMatch => ({
  id: 1,
  start_date_time: 1769738631,
  radiant_team_id: 10,
  dire_team_id: 20,
  winning_team_id: 10,
  duration: 3424,
  isRadiant: true,
  hasWardData: true,
  players: [
    {
      player_id: 1,
      player_name: "sup",
      hero_id: 5,
      position: "POSITION_5",
      team_id: 10,
      wards: [ward()],
    },
  ],
  ...over,
})

describe("filterBySide", () => {
  it("splits by side", () => {
    const matches = [
      match({ id: 1, isRadiant: true }),
      match({ id: 2, isRadiant: false }),
      match({ id: 3, isRadiant: true }),
    ]
    expect(filterBySide(matches, "radiant").map(m => m.id)).toEqual([1, 3])
    expect(filterBySide(matches, "dire").map(m => m.id)).toEqual([2])
  })
})

describe("majoritySide", () => {
  it("opens on the side with the bigger sample", () => {
    expect(
      majoritySide([
        match({ id: 1, isRadiant: false }),
        match({ id: 2, isRadiant: false }),
        match({ id: 3, isRadiant: true }),
      ]),
    ).toBe("dire")
  })

  it("counts only games that have ward data", () => {
    // Four Dire games would win on raw count, but three were never parsed, so
    // opening on Dire would open on an empty map.
    expect(
      majoritySide([
        match({ id: 1, isRadiant: false, hasWardData: true }),
        match({ id: 2, isRadiant: false, hasWardData: false }),
        match({ id: 3, isRadiant: false, hasWardData: false }),
        match({ id: 4, isRadiant: false, hasWardData: false }),
        match({ id: 5, isRadiant: true, hasWardData: true }),
        match({ id: 6, isRadiant: true, hasWardData: true }),
      ]),
    ).toBe("radiant")
  })

  it("breaks ties toward radiant so the opening view is stable", () => {
    expect(
      majoritySide([
        match({ id: 1, isRadiant: true }),
        match({ id: 2, isRadiant: false }),
      ]),
    ).toBe("radiant")
    expect(majoritySide([])).toBe("radiant")
  })
})

describe("labelMatches", () => {
  const base = (m: WardMatch) => `day ${String(m.winning_team_id)}`

  it("numbers same-day rematches by the order they were played", () => {
    // A Bo2 against one opponent on one day is the normal league week, and two
    // identical chips are useless in a row meant for telling games apart.
    const labels = labelMatches(
      [
        match({ id: 2, start_date_time: 200, winning_team_id: 10 }),
        match({ id: 1, start_date_time: 100, winning_team_id: 10 }),
      ],
      base,
    )
    expect(labels.get(1)).toBe("day 10 (g1)")
    expect(labels.get(2)).toBe("day 10 (g2)")
  })

  it("leaves an unambiguous label alone", () => {
    const labels = labelMatches(
      [
        match({ id: 1, winning_team_id: 10 }),
        match({ id: 2, winning_team_id: 20 }),
      ],
      base,
    )
    expect(labels.get(1)).toBe("day 10")
    expect(labels.get(2)).toBe("day 20")
  })
})

describe("getCoverage", () => {
  it("excludes matches with no ward data from the denominator", () => {
    // The hand-entered Sharkhorse games can never have wards; counting them as
    // "zero wards placed" would understate every tendency.
    const coverage = getCoverage([
      match({ id: 1, hasWardData: true }),
      match({ id: 2, hasWardData: true }),
      match({ id: 3, hasWardData: false }),
    ])
    expect(coverage).toEqual({ total: 3, withData: 2 })
  })

  it("reports zeroes for an empty set rather than throwing", () => {
    expect(getCoverage([])).toEqual({ total: 0, withData: 0 })
  })
})

describe("collectWards", () => {
  it("carries player context through so hover can attribute a ward", () => {
    const [placed] = collectWards([match()])
    expect(placed.matchId).toBe(1)
    expect(placed.playerName).toBe("sup")
    expect(placed.position).toBe("POSITION_5")
  })

  it("treats a null wards column as no wards rather than crashing", () => {
    const m = match({
      players: [
        {
          player_id: 1,
          player_name: "core",
          hero_id: 5,
          position: "POSITION_1",
          team_id: 10,
          wards: null,
        },
      ],
    })
    expect(collectWards([m])).toEqual([])
  })
})

describe("wardsAliveAt", () => {
  const wards = collectWards([
    match({
      players: [
        {
          player_id: 1,
          player_name: "sup",
          hero_id: 5,
          position: "POSITION_5",
          team_id: 10,
          wards: [
            ward({ type: "obs", placed: 100, left: 460 }),
            ward({ type: "sen", placed: 200, left: 620 }),
          ],
        },
      ],
    }),
  ])

  it("shows only wards standing at the given time", () => {
    expect(wardsAliveAt(wards, 50, { obs: true, sen: true })).toHaveLength(0)
    expect(wardsAliveAt(wards, 150, { obs: true, sen: true })).toHaveLength(1)
    expect(wardsAliveAt(wards, 300, { obs: true, sen: true })).toHaveLength(2)
    expect(wardsAliveAt(wards, 500, { obs: true, sen: true })).toHaveLength(1)
    expect(wardsAliveAt(wards, 700, { obs: true, sen: true })).toHaveLength(0)
  })

  it("respects the type toggles", () => {
    expect(wardsAliveAt(wards, 300, { obs: true, sen: false })).toHaveLength(1)
    expect(wardsAliveAt(wards, 300, { obs: false, sen: true })).toHaveLength(1)
    expect(wardsAliveAt(wards, 300, { obs: false, sen: false })).toHaveLength(0)
  })
})

describe("getTimeBounds", () => {
  it("reaches back to pre-horn placements", () => {
    const m = match({
      players: [
        {
          player_id: 1,
          player_name: "sup",
          hero_id: 5,
          position: "POSITION_5",
          team_id: 10,
          wards: [ward({ placed: -75, left: 285 })],
        },
      ],
    })
    expect(getTimeBounds([m]).min).toBe(-75)
  })

  it("spans the longest match in the set", () => {
    expect(
      getTimeBounds([match({ duration: 1800 }), match({ duration: 3424 })]).max,
    ).toBe(3424)
  })

  it("never returns an empty range", () => {
    const bounds = getTimeBounds([])
    expect(bounds.max).toBeGreaterThan(bounds.min)
  })
})

describe("getDefaultTime", () => {
  const withWards = (wards: WardRecord[]) =>
    collectWards([
      match({
        players: [
          {
            player_id: 1,
            player_name: "sup",
            hero_id: 5,
            position: "POSITION_5",
            team_id: 10,
            wards,
          },
        ],
      }),
    ])

  it("lands where the most wards are standing, not on an empty map", () => {
    // Regression: a fixed 2:00 default showed a single ward when the team
    // warded late, making the whole tab look broken on open.
    const wards = withWards([
      ward({ placed: 300, left: 660 }),
      ward({ placed: 310, left: 670 }),
      ward({ placed: 320, left: 680 }),
    ])
    const t = getDefaultTime(
      wards,
      { obs: true, sen: true },
      { min: 0, max: 3424 },
    )
    expect(wardsAliveAt(wards, t, { obs: true, sen: true })).toHaveLength(3)
  })

  it("stays inside the laning window even when late vision is denser", () => {
    const wards = withWards([
      ward({ placed: 100, left: 460 }),
      ward({ placed: 1800, left: 2160 }),
      ward({ placed: 1810, left: 2170 }),
      ward({ placed: 1820, left: 2180 }),
    ])
    const t = getDefaultTime(
      wards,
      { obs: true, sen: true },
      { min: 0, max: 3424 },
    )
    expect(t).toBeLessThanOrEqual(600)
  })

  it("returns a time inside the bounds when there are no wards", () => {
    const t = getDefaultTime([], { obs: true, sen: true }, { min: 0, max: 100 })
    expect(t).toBeGreaterThanOrEqual(0)
    expect(t).toBeLessThanOrEqual(100)
  })
})

describe("formatGameTime", () => {
  it("formats game clock", () => {
    expect(formatGameTime(0)).toBe("0:00")
    expect(formatGameTime(65)).toBe("1:05")
    expect(formatGameTime(3424)).toBe("57:04")
  })

  it("formats pre-horn times as negative", () => {
    expect(formatGameTime(-75)).toBe("-1:15")
  })
})
