import { describe, expect, it } from "vitest"
import { buildPlayerStats, getGameKda } from "./player-stats-utils"
import type { MatchApiResponse } from "../../../types/api"
import type { MatchPlayerRow, RosterEntry } from "../../../types/db"

const SCOUTED_TEAM = 100
const OPPONENT_TEAM = 200
const LEAGUE = 19554

function matchPlayer(opts: {
  playerId: number
  teamId?: number | null
  name?: string | null
  position?: string | null
  heroId?: number
  kills?: number
  deaths?: number
  assists?: number
  gpm?: number
  xpm?: number
  heroDamage?: number
}): MatchPlayerRow {
  return {
    player_id: opts.playerId,
    match_id: 0,
    // `undefined` means "use the default"; an explicit `null` must survive.
    team_id: opts.teamId === undefined ? SCOUTED_TEAM : opts.teamId,
    player_name: opts.name === undefined ? "Player" : opts.name,
    hero_id: opts.heroId ?? 1,
    position: opts.position === undefined ? "POSITION_1" : opts.position,
    lane_outcome: null,
    lane: null,
    kills: opts.kills ?? 0,
    deaths: opts.deaths ?? 0,
    assists: opts.assists ?? 0,
    last_hits: 0,
    denies: 0,
    gpm: opts.gpm ?? 0,
    xpm: opts.xpm ?? 0,
    hero_damage: opts.heroDamage ?? 0,
    tower_damage: 0,
  }
}

function match(opts: {
  id: number
  startDateTime: number
  players: MatchPlayerRow[]
  winningTeamId?: number | null
  radiantTeamId?: number | null
  direTeamId?: number | null
}): MatchApiResponse {
  return {
    id: opts.id,
    league_id: 1,
    winning_team_id: opts.winningTeamId ?? SCOUTED_TEAM,
    radiant_team_id:
      opts.radiantTeamId === undefined ? SCOUTED_TEAM : opts.radiantTeamId,
    dire_team_id:
      opts.direTeamId === undefined ? OPPONENT_TEAM : opts.direTeamId,
    start_date_time: opts.startDateTime,
    end_date_time: opts.startDateTime + 2000,
    players: opts.players,
    draft: [],
  }
}

function registered(opts: {
  id: number
  role?: string
  name?: string
}): RosterEntry {
  return {
    league_id: LEAGUE,
    team_id: SCOUTED_TEAM,
    player_id: opts.id,
    created_at: "",
    updated_at: "",
    role: opts.role ?? "Carry",
    name: opts.name ?? `Registered ${String(opts.id)}`,
    rank: "Divine",
    original_rank: null,
  }
}

describe("getGameKda", () => {
  it("treats a deathless game as one death", () => {
    expect(getGameKda(10, 0, 10)).toBe(20)
  })

  it("divides by the real death count otherwise", () => {
    expect(getGameKda(5, 4, 7)).toBe(3)
  })
})

describe("buildPlayerStats", () => {
  it("ignores players on the opposing team", () => {
    const { roster: stats } = buildPlayerStats(
      [
        match({
          id: 1,
          startDateTime: 100,
          players: [
            matchPlayer({ playerId: 1 }),
            matchPlayer({ playerId: 2, teamId: OPPONENT_TEAM }),
          ],
        }),
      ],
      SCOUTED_TEAM,
      [],
    )

    expect(stats.map(entry => entry.playerId)).toEqual([1])
  })

  it("aggregates by player_id and displays the most recent name", () => {
    const { roster: stats } = buildPlayerStats(
      [
        match({
          id: 1,
          startDateTime: 100,
          players: [matchPlayer({ playerId: 1, name: "OldName" })],
        }),
        match({
          id: 2,
          startDateTime: 500,
          players: [matchPlayer({ playerId: 1, name: "NewName" })],
        }),
      ],
      SCOUTED_TEAM,
      [],
    )

    expect(stats).toHaveLength(1)
    expect(stats[0].name).toBe("NewName")
    expect(stats[0].games).toHaveLength(2)
  })

  it("prefers a registered roster name over the in-game name", () => {
    const { roster: stats } = buildPlayerStats(
      [
        match({
          id: 1,
          startDateTime: 100,
          players: [matchPlayer({ playerId: 1, name: "InGameName" })],
        }),
      ],
      SCOUTED_TEAM,
      [registered({ id: 1, name: "RosterName" })],
    )

    expect(stats[0].name).toBe("RosterName")
  })

  it("averages KDA as a ratio of totals, not a mean of per-game ratios", () => {
    const { roster: stats } = buildPlayerStats(
      [
        match({
          id: 1,
          startDateTime: 100,
          players: [
            matchPlayer({ playerId: 1, kills: 10, deaths: 0, assists: 10 }),
          ],
        }),
        match({
          id: 2,
          startDateTime: 200,
          players: [
            matchPlayer({ playerId: 1, kills: 2, deaths: 10, assists: 4 }),
          ],
        }),
        match({
          id: 3,
          startDateTime: 300,
          players: [
            matchPlayer({ playerId: 1, kills: 5, deaths: 5, assists: 10 }),
          ],
        }),
      ],
      SCOUTED_TEAM,
      [],
    )

    // (17 kills + 24 assists) / 15 deaths = 2.733..., NOT the mean of 20/0.6/3.
    expect(stats[0].averages.kda).toBeCloseTo(41 / 15, 5)
    // Per-game values still clamp deaths to 1.
    const deathlessGame = stats[0].games.find(game => game.matchId === 1)
    expect(deathlessGame?.kda).toBe(20)
  })

  it("averages the remaining stats arithmetically", () => {
    const { roster: stats } = buildPlayerStats(
      [
        match({
          id: 1,
          startDateTime: 100,
          players: [
            matchPlayer({ playerId: 1, gpm: 600, xpm: 700, heroDamage: 30000 }),
          ],
        }),
        match({
          id: 2,
          startDateTime: 200,
          players: [
            matchPlayer({ playerId: 1, gpm: 400, xpm: 500, heroDamage: 10000 }),
          ],
        }),
      ],
      SCOUTED_TEAM,
      [],
    )

    expect(stats[0].averages.gpm).toBe(500)
    expect(stats[0].averages.xpm).toBe(600)
    expect(stats[0].averages.heroDamage).toBe(20000)
  })

  it("records wins and losses from the winning team", () => {
    const { roster: stats } = buildPlayerStats(
      [
        match({
          id: 1,
          startDateTime: 100,
          players: [matchPlayer({ playerId: 1 })],
          winningTeamId: SCOUTED_TEAM,
        }),
        match({
          id: 2,
          startDateTime: 200,
          players: [matchPlayer({ playerId: 1 })],
          winningTeamId: OPPONENT_TEAM,
        }),
      ],
      SCOUTED_TEAM,
      [],
    )

    expect(stats[0].wins).toBe(1)
    expect(stats[0].losses).toBe(1)
  })

  it("sorts games newest first", () => {
    const { roster: stats } = buildPlayerStats(
      [
        match({
          id: 1,
          startDateTime: 100,
          players: [matchPlayer({ playerId: 1 })],
        }),
        match({
          id: 2,
          startDateTime: 900,
          players: [matchPlayer({ playerId: 1 })],
        }),
      ],
      SCOUTED_TEAM,
      [],
    )

    expect(stats[0].games.map(game => game.matchId)).toEqual([2, 1])
  })

  it("resolves the opponent from either side of the match", () => {
    const { roster: stats } = buildPlayerStats(
      [
        match({
          id: 1,
          startDateTime: 100,
          players: [matchPlayer({ playerId: 1 })],
          radiantTeamId: OPPONENT_TEAM,
          direTeamId: SCOUTED_TEAM,
        }),
      ],
      SCOUTED_TEAM,
      [],
    )

    expect(stats[0].games[0].opponentTeamId).toBe(OPPONENT_TEAM)
  })

  it("reports an unknown opponent when the other side was never resolved", () => {
    const { roster: stats } = buildPlayerStats(
      [
        match({
          id: 1,
          startDateTime: 100,
          players: [matchPlayer({ playerId: 1 })],
          radiantTeamId: SCOUTED_TEAM,
          direTeamId: null,
        }),
      ],
      SCOUTED_TEAM,
      [],
    )

    expect(stats[0].games[0].opponentTeamId).toBeNull()
  })

  it("drops private profiles instead of merging them into one fake player", () => {
    // The ingest scripts write player_id 0 for every private Steam profile, so
    // two anonymous players in one match would otherwise collapse together.
    const { roster: stats } = buildPlayerStats(
      [
        match({
          id: 1,
          startDateTime: 100,
          players: [
            matchPlayer({ playerId: 1 }),
            matchPlayer({ playerId: 0, name: null, position: "POSITION_2" }),
            matchPlayer({ playerId: 0, name: null, position: "POSITION_5" }),
          ],
        }),
      ],
      SCOUTED_TEAM,
      [],
    )

    expect(stats.map(entry => entry.playerId)).toEqual([1])
  })

  it("orders players by position and labels split roles", () => {
    const positions = [
      { playerId: 5, position: "POSITION_5" },
      { playerId: 1, position: "POSITION_1" },
      { playerId: 3, position: "POSITION_3" },
    ]

    const { roster: stats } = buildPlayerStats(
      [
        match({
          id: 1,
          startDateTime: 100,
          players: [
            ...positions.map(p =>
              matchPlayer({ playerId: p.playerId, position: p.position }),
            ),
            matchPlayer({ playerId: 45, position: "POSITION_4" }),
            matchPlayer({ playerId: 99, position: null }),
          ],
        }),
        match({
          id: 2,
          startDateTime: 200,
          players: [matchPlayer({ playerId: 45, position: "POSITION_5" })],
        }),
      ],
      SCOUTED_TEAM,
      [],
    )

    expect(stats.map(entry => [entry.playerId, entry.positionLabel])).toEqual([
      [1, "Pos 1"],
      [3, "Pos 3"],
      [45, "Pos 4/5"],
      [5, "Pos 5"],
      [99, "—"],
    ])
  })

  it("breaks position ties by games played so the starter is first", () => {
    const { roster: stats } = buildPlayerStats(
      [
        match({
          id: 1,
          startDateTime: 100,
          players: [
            matchPlayer({ playerId: 1, position: "POSITION_1" }),
            matchPlayer({ playerId: 2, position: "POSITION_2" }),
          ],
        }),
        match({
          id: 2,
          startDateTime: 200,
          players: [
            matchPlayer({ playerId: 1, position: "POSITION_1" }),
            matchPlayer({ playerId: 7, position: "POSITION_2" }),
          ],
        }),
        match({
          id: 3,
          startDateTime: 300,
          players: [matchPlayer({ playerId: 7, position: "POSITION_2" })],
        }),
      ],
      SCOUTED_TEAM,
      [],
    )

    // Player 7 has two pos-2 games to player 2's one, so it sorts first.
    expect(stats.map(entry => entry.playerId)).toEqual([1, 7, 2])
  })

  it("slots an ambiguous position by the declared role without hiding the split", () => {
    // Both players split 4 and 5 evenly, so the observed data alone ties them at
    // pos 4 and the name decides — which would put Abe (the hard support) first.
    const games = [
      match({
        id: 1,
        startDateTime: 100,
        players: [
          matchPlayer({ playerId: 41, position: "POSITION_4" }),
          matchPlayer({ playerId: 42, position: "POSITION_5" }),
        ],
      }),
      match({
        id: 2,
        startDateTime: 200,
        players: [
          matchPlayer({ playerId: 41, position: "POSITION_5" }),
          matchPlayer({ playerId: 42, position: "POSITION_4" }),
        ],
      }),
    ]

    const { roster } = buildPlayerStats(games, SCOUTED_TEAM, [
      registered({ id: 41, role: "Soft Support", name: "Zed" }),
      registered({ id: 42, role: "Hard Support", name: "Abe" }),
    ])

    expect(roster.map(entry => entry.playerId)).toEqual([41, 42])
    // The label still reports the flexibility; only the ordering is decided.
    expect(roster.map(entry => entry.positionLabel)).toEqual([
      "Pos 4/5",
      "Pos 4/5",
    ])
  })
})

describe("buildPlayerStats roster split", () => {
  it("separates registered players from stand-ins", () => {
    const { roster, standIns } = buildPlayerStats(
      [
        match({
          id: 1,
          startDateTime: 100,
          players: [
            matchPlayer({ playerId: 1, position: "POSITION_1" }),
            matchPlayer({ playerId: 99, position: "POSITION_2" }),
          ],
        }),
      ],
      SCOUTED_TEAM,
      [registered({ id: 1 })],
    )

    expect(roster.map(entry => entry.playerId)).toEqual([1])
    expect(standIns.map(entry => entry.playerId)).toEqual([99])
  })

  it("orders stand-ins by games played before position", () => {
    const { standIns } = buildPlayerStats(
      [
        match({
          id: 1,
          startDateTime: 100,
          players: [
            matchPlayer({ playerId: 1, position: "POSITION_1" }),
            matchPlayer({ playerId: 97, position: "POSITION_1" }),
            matchPlayer({ playerId: 98, position: "POSITION_5" }),
          ],
        }),
        match({
          id: 2,
          startDateTime: 200,
          players: [matchPlayer({ playerId: 98, position: "POSITION_5" })],
        }),
      ],
      SCOUTED_TEAM,
      [registered({ id: 1 })],
    )

    // The pos-5 stand-in played twice, so it leads despite the pos-1 ordering
    // that governs the roster group.
    expect(standIns.map(entry => entry.playerId)).toEqual([98, 97])
  })

  it("treats everyone as roster when no players are registered", () => {
    // An unregistered team is "we don't know", not "all stand-ins" — the list
    // stays position-ordered and nothing gets mislabelled.
    const { roster, standIns } = buildPlayerStats(
      [
        match({
          id: 1,
          startDateTime: 100,
          players: [
            matchPlayer({ playerId: 5, position: "POSITION_5" }),
            matchPlayer({ playerId: 1, position: "POSITION_1" }),
          ],
        }),
      ],
      SCOUTED_TEAM,
      [],
    )

    expect(roster.map(entry => entry.playerId)).toEqual([1, 5])
    expect(standIns).toEqual([])
  })

  it("keeps roster members who played no games in this league", () => {
    // Alca is on Sharkhorse's roster but only played the previous season. Hiding
    // him hides half the evidence that the roster is wrong for this league; the
    // other half is the stand-in below who started every game.
    const { roster, standIns } = buildPlayerStats(
      [
        match({
          id: 1,
          startDateTime: 100,
          players: [matchPlayer({ playerId: 99, position: "POSITION_3" })],
        }),
      ],
      SCOUTED_TEAM,
      [
        registered({ id: 1, role: "Hard Support", name: "Alca" }),
        registered({ id: 2, role: "Carry", name: "scsper" }),
      ],
    )

    expect(roster.map(entry => entry.name)).toEqual(["scsper", "Alca"])
    expect(roster.every(entry => entry.games.length === 0)).toBe(true)
    // Position comes from the declared role, since there are no games to infer it.
    expect(roster.map(entry => entry.positionLabel)).toEqual(["Pos 1", "Pos 5"])
    expect(standIns.map(entry => entry.playerId)).toEqual([99])
  })

  it("sorts a roster member with games ahead of one without at the same position", () => {
    const { roster } = buildPlayerStats(
      [
        match({
          id: 1,
          startDateTime: 100,
          players: [matchPlayer({ playerId: 1, position: "POSITION_1" })],
        }),
      ],
      SCOUTED_TEAM,
      [
        registered({ id: 2, role: "Carry", name: "Benched" }),
        registered({ id: 1, role: "Carry", name: "Starter" }),
      ],
    )

    expect(roster.map(entry => entry.name)).toEqual(["Starter", "Benched"])
  })

  it("does not count a player registered for another league as roster", () => {
    // The whole point of scoping: buildPlayerStats only ever sees the selected
    // league's members, so a player registered elsewhere is a stand-in here.
    const { roster, standIns } = buildPlayerStats(
      [
        match({
          id: 1,
          startDateTime: 100,
          players: [
            matchPlayer({ playerId: 1, position: "POSITION_1" }),
            matchPlayer({ playerId: 2, position: "POSITION_2" }),
          ],
        }),
      ],
      SCOUTED_TEAM,
      [registered({ id: 1 })],
    )

    expect(roster.map(entry => entry.playerId)).toEqual([1])
    expect(standIns.map(entry => entry.playerId)).toEqual([2])
  })
})
