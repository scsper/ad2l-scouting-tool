import { describe, expect, it } from "vitest"
import {
  buildDivisionPlayerRows,
  type DivisionMatch,
  type DivisionPlayer,
} from "./division-players.js"

const HOUR = 3600

function match(
  id: number,
  winner: number | null,
  { start = 1000, minutes = 40 }: { start?: number; minutes?: number } = {},
): DivisionMatch {
  return {
    id,
    radiant_team_id: 100,
    dire_team_id: 200,
    winning_team_id: winner,
    start_date_time: start,
    end_date_time: start + minutes * 60,
  }
}

function player(
  matchId: number,
  playerId: number,
  position: string,
  overrides: Partial<DivisionPlayer> = {},
): DivisionPlayer {
  return {
    match_id: matchId,
    player_id: playerId,
    player_name: "Someone",
    team_id: 100,
    position,
    gpm: 500,
    xpm: 600,
    kills: 5,
    deaths: 2,
    assists: 10,
    hero_damage: 20000,
    obs_placed: 4,
    sen_placed: 2,
    gold_at_10: 2800,
    xp_at_10: 3000,
    lh_at_10: 50,
    ...overrides,
  }
}

/** The single row for one player at one position, for tests that expect one. */
const only = (rows: ReturnType<typeof buildDivisionPlayerRows>) => {
  expect(rows).toHaveLength(1)
  return rows[0]
}

describe("buildDivisionPlayerRows", () => {
  describe("lane records", () => {
    it.each([
      [1001, { wins: 1, draws: 0, losses: 0 }],
      [3000, { wins: 1, draws: 0, losses: 0 }],
      [1000, { wins: 0, draws: 1, losses: 0 }],
      [-1000, { wins: 0, draws: 1, losses: 0 }],
      [-1001, { wins: 0, draws: 0, losses: 1 }],
      [-3000, { wins: 0, draws: 0, losses: 1 }],
    ])("scores a mid lane with %i combined advantage", (advantage, record) => {
      const rows = buildDivisionPlayerRows(
        [match(1, 200)],
        [
          player(1, 7, "POSITION_2", {
            gold_at_10: 3000,
            xp_at_10: 3000 + advantage,
          }),
          player(1, 8, "POSITION_2", { team_id: 200, gold_at_10: 3000 }),
        ],
      )
      expect(rows[0].laneRecord).toEqual(record)
      expect(rows[1].laneRecord).toEqual({
        wins: record.losses,
        draws: record.draws,
        losses: record.wins,
      })
    })

    it("shares side-lane results with supports and reverses the opposing lane", () => {
      const rows = buildDivisionPlayerRows(
        [match(1, 200)],
        [
          player(1, 1, "POSITION_1"),
          player(1, 5, "POSITION_5", { gold_at_10: 4500 }),
          player(1, 13, "POSITION_3", { team_id: 200 }),
          player(1, 14, "POSITION_4", { team_id: 200 }),
          player(1, 3, "POSITION_3"),
          player(1, 4, "POSITION_4"),
          player(1, 11, "POSITION_1", { team_id: 200, xp_at_10: 6000 }),
          player(1, 15, "POSITION_5", { team_id: 200 }),
        ],
      )
      expect(rows.map(row => [row.playerId, row.laneRecord])).toEqual([
        [1, { wins: 1, draws: 0, losses: 0 }],
        [5, { wins: 1, draws: 0, losses: 0 }],
        [13, { wins: 0, draws: 0, losses: 1 }],
        [14, { wins: 0, draws: 0, losses: 1 }],
        [3, { wins: 0, draws: 0, losses: 1 }],
        [4, { wins: 0, draws: 0, losses: 1 }],
        [11, { wins: 1, draws: 0, losses: 0 }],
        [15, { wins: 1, draws: 0, losses: 0 }],
      ])
    })

    it.each([{ gold_at_10: null }, { xp_at_10: undefined }])(
      "excludes a lane when one participant lacks ten-minute data: %j",
      missing => {
        const rows = buildDivisionPlayerRows(
          [match(1, 100)],
          [
            player(1, 1, "POSITION_1"),
            player(1, 5, "POSITION_5"),
            player(1, 13, "POSITION_3", { team_id: 200 }),
            player(1, 14, "POSITION_4", { team_id: 200, ...missing }),
          ],
        )
        expect(rows.every(row => row.games === 1)).toBe(true)
        expect(
          rows.every(row => Object.values(row.laneRecord).every(n => n === 0)),
        ).toBe(true)
      },
    )

    it("excludes incomplete lanes without discarding another lane's result", () => {
      const rows = buildDivisionPlayerRows(
        [match(1, 100)],
        [
          player(1, 1, "POSITION_1"),
          player(1, 13, "POSITION_3", { team_id: 200 }),
          player(1, 14, "POSITION_4", { team_id: 200 }),
          player(1, 2, "POSITION_2"),
          player(1, 12, "POSITION_2", { team_id: 200 }),
        ],
      )
      expect(rows[0].laneRecord).toEqual({ wins: 0, draws: 0, losses: 0 })
      expect(rows[3].laneRecord).toEqual({ wins: 0, draws: 1, losses: 0 })
    })

    it("counts real zeroes and anonymous opponents while excluding other divisions", () => {
      const row = only(
        buildDivisionPlayerRows(
          [match(1, 100)],
          [
            player(1, 7, "POSITION_2", { gold_at_10: 0, xp_at_10: 0 }),
            player(1, 0, "POSITION_2", {
              team_id: 200,
              gold_at_10: 0,
              xp_at_10: 0,
            }),
            player(999, 7, "POSITION_2"),
            player(999, 0, "POSITION_2", { team_id: 200 }),
          ],
        ),
      )
      expect(row.laneRecord).toEqual({ wins: 0, draws: 1, losses: 0 })
    })

    it("keeps separate position records when a player changes sides and roles", () => {
      const rows = buildDivisionPlayerRows(
        [match(1, 100), match(2, 200), match(3, 100)],
        [
          player(1, 7, "POSITION_2", { xp_at_10: 5000 }),
          player(1, 0, "POSITION_2", { team_id: 200 }),
          player(2, 7, "POSITION_2", { team_id: 200 }),
          player(2, 0, "POSITION_2", { xp_at_10: 5000 }),
          player(3, 7, "POSITION_1"),
          player(3, 0, "POSITION_5"),
          player(3, 0, "POSITION_3", { team_id: 200 }),
          player(3, 0, "POSITION_4", { team_id: 200 }),
        ],
      )
      expect(rows.map(row => [row.position, row.laneRecord])).toEqual([
        ["POSITION_2", { wins: 1, draws: 0, losses: 1 }],
        ["POSITION_1", { wins: 0, draws: 1, losses: 0 }],
      ])
    })
  })

  // The whole reason the row is keyed on (player, position). Averaging his pos 4
  // game into his pos 1 record would rank him against carries on a number that
  // is partly a support's.
  it("splits a flex player into one row per position", () => {
    const rows = buildDivisionPlayerRows(
      [match(1, 100), match(2, 100)],
      [
        player(1, 7, "POSITION_1", { gpm: 700 }),
        player(2, 7, "POSITION_4", { gpm: 300 }),
      ],
    )

    expect(rows).toHaveLength(2)
    expect(rows.map(row => [row.position, row.games, row.gpm])).toEqual([
      ["POSITION_1", 1, 700],
      ["POSITION_4", 1, 300],
    ])
  })

  // A stand-in who covered the same role for two teams is one player having one
  // kind of game, not two half-samples — and splitting him would drop both
  // halves below the board's minimum-games floor.
  it("pools a stand-in's games at one position across both teams", () => {
    const row = only(
      buildDivisionPlayerRows(
        [match(1, 100), match(2, 999)],
        [
          player(1, 7, "POSITION_4", { team_id: 100 }),
          player(2, 7, "POSITION_4", { team_id: 200 }),
        ],
      ),
    )

    expect(row.games).toBe(2)
    expect(row.teamIds.sort((a, b) => a - b)).toEqual([100, 200])
    expect(row.wins).toBe(1)
  })

  it("names a player by the handle they wore most recently", () => {
    const row = only(
      buildDivisionPlayerRows(
        [match(1, 100, { start: HOUR }), match(2, 100, { start: 2 * HOUR })],
        [
          player(2, 7, "POSITION_2", { player_name: "cyanide" }),
          player(1, 7, "POSITION_2", { player_name: "just a dream" }),
        ],
      ),
    )

    expect(row.name).toBe("cyanide")
  })

  it("falls back to the player id when no game carries a name", () => {
    const row = only(
      buildDivisionPlayerRows(
        [match(1, 100)],
        [player(1, 7, "POSITION_2", { player_name: null })],
      ),
    )

    expect(row.name).toBe("7")
  })

  // The two hand-entered S47 matches were rebuilt from post-game screenshots,
  // which show no lane or ward numbers. Averaging those in as zeroes would
  // invent a laner who got nothing in ten minutes.
  it("averages a lane stat over only the games that carry it", () => {
    const row = only(
      buildDivisionPlayerRows(
        [match(1, 100), match(2, 100)],
        [
          player(1, 7, "POSITION_1", { gold_at_10: 3000 }),
          player(2, 7, "POSITION_1", { gold_at_10: null }),
        ],
      ),
    )

    expect(row.games).toBe(2)
    expect(row.goldAt10).toBe(3000)
  })

  it("reports a stat no game carries as null rather than zero", () => {
    const row = only(
      buildDivisionPlayerRows(
        [match(1, 100)],
        [player(1, 7, "POSITION_5", { obs_placed: null, sen_placed: null })],
      ),
    )

    expect(row.obsPerGame).toBeNull()
    expect(row.senPerGame).toBeNull()
  })

  // A real zero is an observation: a carry who warded nothing warded nothing.
  it("keeps a genuine zero out of the null case", () => {
    const row = only(
      buildDivisionPlayerRows(
        [match(1, 100, { minutes: 40 })],
        [player(1, 7, "POSITION_1", { obs_placed: 0 })],
      ),
    )

    expect(row.obsPerGame).toBe(0)
  })

  // Wards are counted per game, so the longer game's support does read higher.
  // That is the trade the column makes for showing a number a scout recognises;
  // the `@10` columns are what's there when game length matters.
  it("averages wards placed per game", () => {
    const row = only(
      buildDivisionPlayerRows(
        [match(1, 100, { minutes: 25 }), match(2, 100, { minutes: 50 })],
        [
          player(1, 7, "POSITION_5", { obs_placed: 5 }),
          player(2, 7, "POSITION_5", { obs_placed: 10 }),
        ],
      ),
    )

    expect(row.obsPerGame).toBeCloseTo(7.5)
  })

  // Ward counts don't need the match clock, so a game whose timestamps we can't
  // use still contributes them — unlike the hero-damage rate.
  it("counts wards from a game with an unusable duration", () => {
    const row = only(
      buildDivisionPlayerRows(
        [match(1, 100, { minutes: 0 })],
        [player(1, 7, "POSITION_5", { obs_placed: 6 })],
      ),
    )

    expect(row.obsPerGame).toBe(6)
    expect(row.heroDamagePerMin).toBeNull()
  })

  // Averaging the per-game rates, rather than dividing summed damage by summed
  // minutes, is what keeps a long game from outweighing a short one in a stat
  // that exists to be independent of length.
  it("averages per-game rates rather than weighting by game length", () => {
    const row = only(
      buildDivisionPlayerRows(
        [match(1, 100, { minutes: 10 }), match(2, 100, { minutes: 100 })],
        [
          player(1, 7, "POSITION_3", { hero_damage: 10_000 }),
          player(2, 7, "POSITION_3", { hero_damage: 10_000 }),
        ],
      ),
    )

    // Per-game: 1000/min and 100/min, so 550. Pooled totals would give 181.8.
    expect(row.heroDamagePerMin).toBeCloseTo(550)
  })

  // An infinity sorts to the top of every board it appears on.
  it("ignores a game whose clock says it took no time", () => {
    const row = only(
      buildDivisionPlayerRows(
        [match(1, 100, { minutes: 0 }), match(2, 100, { minutes: 40 })],
        [
          player(1, 7, "POSITION_1", { hero_damage: 20_000 }),
          player(2, 7, "POSITION_1", { hero_damage: 20_000 }),
        ],
      ),
    )

    expect(row.games).toBe(2)
    expect(row.heroDamagePerMin).toBeCloseTo(500)
  })

  it("takes KDA as the ratio of totals, not the mean of per-game ratios", () => {
    const row = only(
      buildDivisionPlayerRows(
        [match(1, 100), match(2, 100)],
        [
          player(1, 7, "POSITION_2", { kills: 10, deaths: 0, assists: 0 }),
          player(2, 7, "POSITION_2", { kills: 0, deaths: 10, assists: 0 }),
        ],
      ),
    )

    // 10 kills over 10 deaths. Averaging the per-game ratios would read 5.0.
    expect(row.kda).toBe(1)
  })

  it("counts a deathless record without dividing by zero", () => {
    const row = only(
      buildDivisionPlayerRows(
        [match(1, 100)],
        [player(1, 7, "POSITION_1", { kills: 10, deaths: 0, assists: 10 })],
      ),
    )

    expect(row.kda).toBe(20)
  })

  // Private Steam profiles all land on player 0, so one row would be several
  // people's games averaged into an imaginary player.
  it("drops anonymous players", () => {
    expect(
      buildDivisionPlayerRows([match(1, 100)], [player(1, 0, "POSITION_1")]),
    ).toEqual([])
  })

  // 12% of S45's rows look like this. They can't be filed under a position, and
  // a sixth "unknown" board would rank people against no one.
  it("drops a game with no position", () => {
    const rows = buildDivisionPlayerRows(
      [match(1, 100), match(2, 100)],
      [
        player(1, 7, "POSITION_1"),
        { ...player(2, 7, "POSITION_1"), position: null },
      ],
    )

    expect(only(rows).games).toBe(1)
  })

  // The caller filters matches by division and then passes the unfiltered player
  // rows; anything whose match was dropped has to be dropped here too, or a
  // Conqueror scrim lands in Voyager's rankings.
  it("ignores a player row whose match isn't in the division", () => {
    expect(
      buildDivisionPlayerRows([match(1, 100)], [player(999, 7, "POSITION_1")]),
    ).toEqual([])
  })

  it("counts a win only for the team that won", () => {
    const rows = buildDivisionPlayerRows(
      [match(1, 100)],
      [
        player(1, 7, "POSITION_1", { team_id: 100 }),
        player(1, 8, "POSITION_1", { team_id: 200 }),
      ],
    )

    expect(rows.map(row => [row.playerId, row.wins])).toEqual([
      [7, 1],
      [8, 0],
    ])
  })

  // A match parsed before its teams were registered has null team ids, and null
  // must never match a null winner into a phantom win.
  it("gives no win to a player with no team", () => {
    const row = only(
      buildDivisionPlayerRows(
        [match(1, null)],
        [player(1, 7, "POSITION_1", { team_id: null })],
      ),
    )

    expect(row.wins).toBe(0)
    expect(row.teamIds).toEqual([])
  })
})
