import { describe, expect, it } from "vitest"
import {
  buildLeagueHeroStats,
  type LeagueHeroDraft,
  type LeagueHeroMatch,
  type LeagueHeroPlayer,
} from "./league-heroes.js"

const SHARKHORSE = 100
const BUTCUM = 200
const ANTI_MAGE = 1
const PUDGE = 14

function match(id: number, winner: number | null): LeagueHeroMatch {
  return { id, winning_team_id: winner }
}

function pick(
  matchId: number,
  playerId: number,
  teamId: number | null,
  heroId: number,
  position: string | null = "POSITION_1",
): LeagueHeroPlayer {
  return { match_id: matchId, player_id: playerId, team_id: teamId, hero_id: heroId, position }
}

function ban(matchId: number, teamId: number | null, heroId: number): LeagueHeroDraft {
  return { match_id: matchId, team_id: teamId, hero_id: heroId, is_pick: false }
}

describe("buildLeagueHeroStats", () => {
  it("counts a hero's picks, wins and bans", () => {
    const { heroDraftStats } = buildLeagueHeroStats(
      [match(1, SHARKHORSE), match(2, BUTCUM)],
      [ban(1, BUTCUM, ANTI_MAGE), ban(2, SHARKHORSE, ANTI_MAGE)],
      [pick(1, 7, SHARKHORSE, ANTI_MAGE), pick(2, 7, SHARKHORSE, ANTI_MAGE)],
    )

    expect(heroDraftStats[ANTI_MAGE]).toMatchObject({ picks: 2, wins: 1, bans: 2 })
  })

  // Picks come from `match_player` and bans from `match_draft`, so a hero the
  // drafts never mention still has to appear once someone played it. Seven
  // matches across the current seasons have no draft rows at all.
  it("counts a pick from a match with no draft rows", () => {
    const { heroDraftStats } = buildLeagueHeroStats(
      [match(1, SHARKHORSE)],
      [],
      [pick(1, 7, SHARKHORSE, ANTI_MAGE)],
    )

    expect(heroDraftStats[ANTI_MAGE]).toMatchObject({ picks: 1, wins: 1, bans: 0 })
  })

  // The bug this exists to prevent: `null === null` is true, so a match with no
  // recorded winner used to hand every hero in it a win for both sides.
  it("does not score a win when neither the match nor the row has a team", () => {
    const { heroDraftStats } = buildLeagueHeroStats(
      [match(1, null)],
      [],
      [pick(1, 7, null, ANTI_MAGE)],
    )

    expect(heroDraftStats[ANTI_MAGE]).toMatchObject({ picks: 1, wins: 0 })
    expect(heroDraftStats[ANTI_MAGE].pickedBy).toEqual([
      { playerId: 7, teamId: null, position: "POSITION_1", wins: 0, losses: 1 },
    ])
  })

  it("joins on match id, dropping drafts and players from outside the scope", () => {
    const { heroDraftStats } = buildLeagueHeroStats(
      [match(1, SHARKHORSE)],
      [ban(1, BUTCUM, PUDGE), ban(999, BUTCUM, PUDGE)],
      [pick(1, 7, SHARKHORSE, ANTI_MAGE), pick(999, 7, SHARKHORSE, ANTI_MAGE)],
    )

    expect(heroDraftStats[ANTI_MAGE]).toMatchObject({ picks: 1 })
    expect(heroDraftStats[PUDGE]).toMatchObject({ bans: 1 })
  })

  describe("pick breakdown", () => {
    it("splits a player's record by team and by position", () => {
      const { heroDraftStats } = buildLeagueHeroStats(
        [match(1, SHARKHORSE), match(2, BUTCUM), match(3, BUTCUM)],
        [],
        [
          pick(1, 7, SHARKHORSE, ANTI_MAGE, "POSITION_1"),
          pick(2, 7, SHARKHORSE, ANTI_MAGE, "POSITION_2"),
          // The same person standing in for the other org.
          pick(3, 7, BUTCUM, ANTI_MAGE, "POSITION_1"),
        ],
      )

      expect(heroDraftStats[ANTI_MAGE].pickedBy).toEqual([
        { playerId: 7, teamId: SHARKHORSE, position: "POSITION_1", wins: 1, losses: 0 },
        { playerId: 7, teamId: SHARKHORSE, position: "POSITION_2", wins: 0, losses: 1 },
        { playerId: 7, teamId: BUTCUM, position: "POSITION_1", wins: 1, losses: 0 },
      ])
    })

    // The tooltip is the headline shown longhand. If these ever disagree, one of
    // the two counts is lying about the same games.
    it("sums back to the headline picks and wins", () => {
      const { heroDraftStats } = buildLeagueHeroStats(
        [match(1, SHARKHORSE), match(2, BUTCUM), match(3, null)],
        [],
        [
          pick(1, 7, SHARKHORSE, ANTI_MAGE),
          pick(2, 8, SHARKHORSE, ANTI_MAGE),
          pick(3, 9, BUTCUM, ANTI_MAGE),
        ],
      )

      const stats = heroDraftStats[ANTI_MAGE]
      const records = stats.pickedBy
      expect(records.reduce((total, r) => total + r.wins + r.losses, 0)).toBe(stats.picks)
      expect(records.reduce((total, r) => total + r.wins, 0)).toBe(stats.wins)
    })

    it("sorts records by games played", () => {
      const { heroDraftStats } = buildLeagueHeroStats(
        [match(1, SHARKHORSE), match(2, SHARKHORSE)],
        [],
        [
          pick(1, 7, SHARKHORSE, ANTI_MAGE),
          pick(1, 8, BUTCUM, ANTI_MAGE),
          pick(2, 8, BUTCUM, ANTI_MAGE),
        ],
      )

      expect(heroDraftStats[ANTI_MAGE].pickedBy.map(r => r.playerId)).toEqual([8, 7])
    })
  })

  describe("ban breakdown", () => {
    it("groups bans by the team that made them, most first", () => {
      const { heroDraftStats } = buildLeagueHeroStats(
        [match(1, SHARKHORSE), match(2, SHARKHORSE)],
        [ban(1, BUTCUM, PUDGE), ban(2, BUTCUM, PUDGE), ban(1, SHARKHORSE, PUDGE)],
        [],
      )

      expect(heroDraftStats[PUDGE].bannedBy).toEqual([
        { teamId: BUTCUM, bans: 2 },
        { teamId: SHARKHORSE, bans: 1 },
      ])
    })

    it("keeps a ban whose team id is missing rather than dropping it", () => {
      const { heroDraftStats } = buildLeagueHeroStats(
        [match(1, SHARKHORSE)],
        [ban(1, null, PUDGE)],
        [],
      )

      expect(heroDraftStats[PUDGE]).toMatchObject({ bans: 1 })
      expect(heroDraftStats[PUDGE].bannedBy).toEqual([{ teamId: null, bans: 1 }])
    })
  })

  describe("picksByPosition", () => {
    it("counts a hero once per position it was played at", () => {
      const { picksByPosition } = buildLeagueHeroStats(
        [match(1, SHARKHORSE), match(2, BUTCUM)],
        [],
        [
          pick(1, 7, SHARKHORSE, ANTI_MAGE, "POSITION_1"),
          pick(2, 7, SHARKHORSE, ANTI_MAGE, "POSITION_2"),
        ],
      )

      expect(picksByPosition.POSITION_1[ANTI_MAGE]).toEqual({ picks: 1, wins: 1 })
      expect(picksByPosition.POSITION_2[ANTI_MAGE]).toEqual({ picks: 1, wins: 0 })
    })

    // 80 of 3520 rows carry no position. They belong in the league-wide count
    // and nowhere in particular, which is why the columns are narrower than the
    // boards above them.
    it("counts a row with no position league-wide but at no position", () => {
      const { picksByPosition, heroDraftStats } = buildLeagueHeroStats(
        [match(1, SHARKHORSE)],
        [],
        [pick(1, 7, SHARKHORSE, ANTI_MAGE, null)],
      )

      expect(heroDraftStats[ANTI_MAGE]).toMatchObject({ picks: 1 })
      expect(picksByPosition).toEqual({})
    })
  })
})
