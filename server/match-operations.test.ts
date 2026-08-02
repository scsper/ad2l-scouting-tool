import { afterEach, describe, expect, it, vi } from "vitest"
import { getMatch, getPositionString } from "./match-operations.js"

// Minimal OpenDota player shape. `lhAt10` drives the lane-farm comparison;
// `gpm` / `lastHits` are full-game totals and act only as the fallback.
function player(opts: {
  slot: number
  laneRole?: number
  lhAt10?: number | null
  gpm?: number
  lastHits?: number
}) {
  const { slot, laneRole, lhAt10, gpm = 0, lastHits = 0 } = opts
  const hasTimeline = lhAt10 !== null && lhAt10 !== undefined
  return {
    hero_id: slot,
    player_slot: slot,
    lane_role: laneRole,
    kills: 0,
    deaths: 0,
    assists: 0,
    last_hits: lastHits,
    denies: 0,
    gold_per_min: gpm,
    xp_per_min: 0,
    hero_damage: 0,
    tower_damage: 0,
    ...(hasTimeline
      ? {
          times: [0, 600],
          gold_t: [0, 0],
          xp_t: [0, 0],
          lh_t: [0, lhAt10],
          dn_t: [0, 0],
        }
      : {}),
  }
}

describe("getPositionString", () => {
  it("assigns the offlaner by lane farm, not full-game farm", () => {
    // Regression: a farming support (Zeus) out-earns the offlaner (Axe) over the
    // full game, but Axe clearly held lane farm priority. Ranking on full-game
    // GPM + last hits flipped these, mislabelling p3/p4 in 9 team-games.
    const axe = player({ slot: 0, laneRole: 3, lhAt10: 49, gpm: 400, lastHits: 180 })
    const zeus = player({ slot: 1, laneRole: 3, lhAt10: 5, gpm: 520, lastHits: 210 })
    const carry = player({ slot: 2, laneRole: 1, lhAt10: 60, gpm: 700, lastHits: 400 })
    const support = player({ slot: 3, laneRole: 1, lhAt10: 4, gpm: 250, lastHits: 30 })
    const mid = player({ slot: 4, laneRole: 2, lhAt10: 45, gpm: 600, lastHits: 300 })
    const all = [axe, zeus, carry, support, mid]

    expect(getPositionString(axe, all)).toBe("POSITION_3")
    expect(getPositionString(zeus, all)).toBe("POSITION_4")
  })

  it("assigns safelane by lane farm", () => {
    const carry = player({ slot: 0, laneRole: 1, lhAt10: 55, gpm: 700, lastHits: 400 })
    const support = player({ slot: 1, laneRole: 1, lhAt10: 3, gpm: 300, lastHits: 40 })
    const all = [carry, support]

    expect(getPositionString(carry, all)).toBe("POSITION_1")
    expect(getPositionString(support, all)).toBe("POSITION_5")
  })

  it("only compares players who shared the lane", () => {
    // The mid has the highest lane farm on the team but must not affect the
    // offlane pair's ordering.
    const mid = player({ slot: 0, laneRole: 2, lhAt10: 80, gpm: 800, lastHits: 500 })
    const offlaner = player({ slot: 1, laneRole: 3, lhAt10: 30, gpm: 400, lastHits: 200 })
    const roamer = player({ slot: 2, laneRole: 3, lhAt10: 6, gpm: 450, lastHits: 220 })
    const all = [mid, offlaner, roamer]

    expect(getPositionString(mid, all)).toBe("POSITION_2")
    expect(getPositionString(offlaner, all)).toBe("POSITION_3")
    expect(getPositionString(roamer, all)).toBe("POSITION_4")
  })

  it("treats a third safelane player as a soft support", () => {
    const carry = player({ slot: 0, laneRole: 1, lhAt10: 50 })
    const hardSupport = player({ slot: 1, laneRole: 1, lhAt10: 8 })
    const extra = player({ slot: 2, laneRole: 1, lhAt10: 2 })
    const all = [carry, hardSupport, extra]

    expect(getPositionString(carry, all)).toBe("POSITION_1")
    expect(getPositionString(hardSupport, all)).toBe("POSITION_5")
    expect(getPositionString(extra, all)).toBe("POSITION_4")
  })

  it("falls back to full-game farm when the match is unparsed", () => {
    const offlaner = player({ slot: 0, laneRole: 3, lhAt10: null, gpm: 500, lastHits: 250 })
    const support = player({ slot: 1, laneRole: 3, lhAt10: null, gpm: 280, lastHits: 40 })
    const all = [offlaner, support]

    expect(getPositionString(offlaner, all)).toBe("POSITION_3")
    expect(getPositionString(support, all)).toBe("POSITION_4")
  })

  it("does not split lanes across teams", () => {
    // Radiant offlaner vs a higher-farm dire offlaner: team membership must gate
    // the comparison, otherwise the enemy core steals the p3 label.
    const radiantOfflaner = player({ slot: 0, laneRole: 3, lhAt10: 25 })
    const direOfflaner = player({ slot: 128, laneRole: 3, lhAt10: 60 })
    const all = [radiantOfflaner, direOfflaner]

    expect(getPositionString(radiantOfflaner, all)).toBe("POSITION_3")
    expect(getPositionString(direOfflaner, all)).toBe("POSITION_3")
  })

  it("returns null when lane role is unknown", () => {
    const p = player({ slot: 0, laneRole: undefined, lhAt10: 20 })
    expect(getPositionString(p, [p])).toBeNull()
  })

  it("maps mid and jungle directly", () => {
    const mid = player({ slot: 0, laneRole: 2, lhAt10: 45 })
    const jungler = player({ slot: 1, laneRole: 4, lhAt10: 10 })
    expect(getPositionString(mid, [mid, jungler])).toBe("POSITION_2")
    expect(getPositionString(jungler, [mid, jungler])).toBe("POSITION_4")
  })
})


describe("getMatch ward mapping", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubOpenDota(players: Record<string, unknown>[]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              match_id: 1,
              radiant_win: true,
              start_time: 0,
              duration: 2000,
              players,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      ),
    )
  }

  it("maps an absent ward field to null rather than zero", async () => {
    stubOpenDota([
      { ...player({ slot: 0 }), obs_placed: 4, sen_placed: 0 },
      // Unparsed replay: OpenDota omits the fields entirely.
      player({ slot: 1 }),
    ])

    const { match } = await getMatch(1)

    // A real 0 survives as 0 — that player warded nothing. A missing field
    // becomes null — we have no idea what they did. Collapsing the second into
    // the first is what silently zeroes out ward averages downstream.
    expect(match.players[0].obsPlaced).toBe(4)
    expect(match.players[0].senPlaced).toBe(0)
    expect(match.players[1].obsPlaced).toBeNull()
    expect(match.players[1].senPlaced).toBeNull()
  })
})
