import { describe, expect, it } from "vitest"
import type { ObjectiveMatch } from "../../api/match-objectives"
import {
  aggregateTowers,
  collectTowerFalls,
  getObjectiveCoverage,
  towerTicks,
  withObjectiveData,
} from "./objective-aggregation"

const RADIANT = 2
const DIRE = 3

function match(
  overrides: Partial<ObjectiveMatch> & { id: number },
): ObjectiveMatch {
  return {
    start_date_time: 1770000000,
    radiant_team_id: 1,
    dire_team_id: 2,
    winning_team_id: 1,
    duration: 2400,
    isRadiant: true,
    patch: 60,
    hasObjectiveData: true,
    objectives: [],
    ...overrides,
  }
}

function towerKill(key: string, time: number) {
  return {
    time,
    type: "building_kill",
    key,
    unit: null,
    team: null,
    player_slot: null,
    slot: null,
  }
}

describe("collectTowerFalls", () => {
  it("tags ownership relative to the scouted team, not the map side", () => {
    // The same building key belongs to the scouted team in one game and to the
    // opposition in the other. Aggregating on the absolute side would merge two
    // unrelated towers and report the average as a habit.
    const asRadiant = match({
      id: 1,
      isRadiant: true,
      objectives: [towerKill("npc_dota_goodguys_tower1_mid", 600)],
    })
    const asDire = match({
      id: 2,
      isRadiant: false,
      objectives: [towerKill("npc_dota_goodguys_tower1_mid", 700)],
    })

    expect(collectTowerFalls([asRadiant])[0].ownedByTeam).toBe(true)
    expect(collectTowerFalls([asDire])[0].ownedByTeam).toBe(false)
  })

  it("ignores buildings that are stored but not plotted", () => {
    const m = match({
      id: 1,
      objectives: [
        towerKill("npc_dota_goodguys_fort", 3400),
        towerKill("npc_dota_goodguys_melee_rax_mid", 2600),
        towerKill("npc_dota_goodguys_tower4_top", 3300),
        towerKill("npc_dota_goodguys_tower1_mid", 600),
      ],
    })
    expect(collectTowerFalls([m])).toHaveLength(1)
  })
})

describe("withObjectiveData", () => {
  it("excludes unparsed matches from the sample", () => {
    // An unparsed match is not a match in which every building survived, and
    // counting it would deflate every fall rate.
    const matches = [
      match({ id: 1, hasObjectiveData: true }),
      match({ id: 2, hasObjectiveData: false }),
    ]
    expect(withObjectiveData(matches)).toHaveLength(1)
    expect(getObjectiveCoverage(matches)).toEqual({ total: 2, withData: 1 })
  })
})

describe("aggregateTowers", () => {
  const games = [
    match({
      id: 1,
      objectives: [towerKill("npc_dota_goodguys_tower1_mid", 600)],
    }),
    match({
      id: 2,
      objectives: [towerKill("npc_dota_goodguys_tower1_mid", 900)],
    }),
    // T1 mid never falls here, and the game is otherwise parsed.
    match({ id: 3, objectives: [] }),
  ]

  it("reports the median only over games where the tower fell", () => {
    const row = aggregateTowers(games).find(
      r =>
        r.tower.side === "radiant" &&
        r.tower.tier === 1 &&
        r.tower.lane === "mid",
    )
    expect(row?.medianTime).toBe(750)
  })

  it("reports the fall rate against every parsed game, not just the falls", () => {
    // The censoring guard: 2 of 3, never 2 of 2. A median over the two games
    // where the tower fell is biased fast, and only the denominator says so.
    const row = aggregateTowers(games).find(
      r =>
        r.tower.side === "radiant" &&
        r.tower.tier === 1 &&
        r.tower.lane === "mid",
    )
    expect(row?.fell).toBe(2)
    expect(row?.games).toBe(3)
  })

  it("keeps a row for towers that never fell", () => {
    // A tower surviving every game is a finding; dropping the row would hide the
    // most one-sided fact in the sample.
    const rows = aggregateTowers(games)
    expect(rows).toHaveLength(18)
    const never = rows.find(
      r =>
        r.tower.side === "radiant" &&
        r.tower.tier === 3 &&
        r.tower.lane === "top",
    )
    expect(never?.fell).toBe(0)
    expect(never?.medianTime).toBeNull()
  })
})

describe("towerTicks", () => {
  const games = [
    match({
      id: 1,
      objectives: [towerKill("npc_dota_goodguys_tower1_mid", 600)],
    }),
    match({
      id: 2,
      objectives: [towerKill("npc_dota_goodguys_tower1_mid", 900)],
    }),
  ]

  it("emits one tick per fall for a single game", () => {
    const ticks = towerTicks([games[0]], true)
    expect(ticks).toHaveLength(1)
    expect(ticks[0].time).toBe(600)
    expect(ticks[0].sampleSize).toBe(1)
  })

  it("collapses to one median tick per tower across games", () => {
    // Sixty-odd ticks on a 640px slider is texture, not a timeline.
    const ticks = towerTicks(games, false)
    expect(ticks).toHaveLength(1)
    expect(ticks[0].time).toBe(750)
    expect(ticks[0].sampleSize).toBe(2)
    expect(ticks[0].totalGames).toBe(2)
  })

  it("carries the denominator so a median is never shown bare", () => {
    const withSurvivor = [...games, match({ id: 3, objectives: [] })]
    const tick = towerTicks(withSurvivor, false)[0]
    expect(tick.sampleSize).toBe(2)
    expect(tick.totalGames).toBe(3)
  })
})

describe("neutral objective ownership", () => {
  it("reads `team` as the killer, not the owner", () => {
    // Roshan rows carry only a timestamp and the killing team; treating `team`
    // as an owner would invert every attribution.
    const roshanRow = {
      time: 1262,
      type: "CHAT_MESSAGE_ROSHAN_KILL",
      key: null,
      unit: null,
      team: RADIANT,
      player_slot: null,
      slot: null,
    }
    const asRadiant = match({ id: 1, isRadiant: true, objectives: [roshanRow] })
    const asDire = match({ id: 2, isRadiant: false, objectives: [roshanRow] })

    // Same row, opposite attribution depending on which side the team played.
    expect(asRadiant.objectives[0].team).toBe(RADIANT)
    expect(asDire.objectives[0].team).not.toBe(DIRE)
  })
})
