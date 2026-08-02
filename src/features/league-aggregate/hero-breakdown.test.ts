import { describe, expect, it } from "vitest"
import type { LeagueHeroDraftStats } from "../../../api/league-matches"
import {
  bannedByTitle,
  contestedByTitle,
  pickedByPositionTitle,
  pickedByTitle,
  type HeroNameLookup,
} from "./hero-breakdown"

const SHARKHORSE = 100
const BUTCUM = 200

const names: HeroNameLookup = {
  playerNames: { "7": "scsper", "8": "Maroso" },
  teamNames: { [SHARKHORSE]: "Sharkhorse", [BUTCUM]: "BUTCUM" },
}

function stats(overrides: Partial<LeagueHeroDraftStats> = {}): LeagueHeroDraftStats {
  return { picks: 0, bans: 0, wins: 0, pickedBy: [], bannedBy: [], ...overrides }
}

describe("pickedByTitle", () => {
  it("names every player, their team, their record and their positions", () => {
    const title = pickedByTitle(
      "Anti-Mage",
      stats({
        picks: 4,
        wins: 3,
        pickedBy: [
          { playerId: 7, teamId: SHARKHORSE, position: "POSITION_1", wins: 2, losses: 0 },
          { playerId: 8, teamId: BUTCUM, position: "POSITION_2", wins: 1, losses: 1 },
        ],
      }),
      names,
    )

    expect(title).toBe(
      [
        "Anti-Mage",
        "",
        "Picked 4×, 3-1 (75%)",
        "  scsper (Sharkhorse) 2-0 · Carry",
        "  Maroso (BUTCUM) 1-1 · Mid",
      ].join("\n"),
    )
  })

  // The server splits a player's records by position; a tooltip that repeated a
  // name once per position would read as several different players.
  it("folds one player's positions into a single line", () => {
    const title = pickedByTitle(
      "Anti-Mage",
      stats({
        picks: 3,
        wins: 2,
        pickedBy: [
          { playerId: 7, teamId: SHARKHORSE, position: "POSITION_1", wins: 2, losses: 0 },
          { playerId: 7, teamId: SHARKHORSE, position: "POSITION_2", wins: 0, losses: 1 },
        ],
      }),
      names,
    )

    expect(title).toContain("  scsper (Sharkhorse) 2-1 · Carry, Mid")
  })

  // A stand-in who covered for two orgs is two lines, because the team is part
  // of what the line is claiming.
  it("keeps one player's two teams on separate lines", () => {
    const title = pickedByTitle(
      "Anti-Mage",
      stats({
        picks: 2,
        wins: 1,
        pickedBy: [
          { playerId: 7, teamId: SHARKHORSE, position: "POSITION_1", wins: 1, losses: 0 },
          { playerId: 7, teamId: BUTCUM, position: "POSITION_1", wins: 0, losses: 1 },
        ],
      }),
      names,
    )

    expect(title).toContain("  scsper (Sharkhorse) 1-0 · Carry")
    expect(title).toContain("  scsper (BUTCUM) 0-1 · Carry")
  })

  // Ten of the teams that appear in matches have never been registered, so an
  // unnamed id is routine — and the id is what you'd search for to fix it.
  it("falls back to ids nobody has named", () => {
    const title = pickedByTitle(
      "Anti-Mage",
      stats({
        picks: 1,
        pickedBy: [{ playerId: 99, teamId: 9047818, position: null, wins: 0, losses: 1 }],
      }),
      names,
    )

    expect(title).toContain("  Player 99 (Team 9047818) 0-1 · no position")
  })

  it("says so when a hero was only ever banned", () => {
    expect(pickedByTitle("Anti-Mage", stats({ bans: 3 }), names)).toContain("Picked by: nobody")
  })
})

describe("pickedByPositionTitle", () => {
  it("counts only the records at that position", () => {
    const title = pickedByPositionTitle(
      "Anti-Mage",
      stats({
        picks: 3,
        wins: 2,
        pickedBy: [
          { playerId: 7, teamId: SHARKHORSE, position: "POSITION_1", wins: 2, losses: 0 },
          { playerId: 8, teamId: BUTCUM, position: "POSITION_2", wins: 0, losses: 1 },
        ],
      }),
      names,
      "POSITION_1",
    )

    expect(title).toBe(
      ["Anti-Mage — Carry", "", "Picked 2×, 2-0 (100%)", "  scsper (Sharkhorse) 2-0"].join("\n"),
    )
  })
})

describe("bannedByTitle", () => {
  it("names each banning team and how often", () => {
    const title = bannedByTitle(
      "Pudge",
      stats({
        bans: 3,
        bannedBy: [
          { teamId: BUTCUM, bans: 2 },
          { teamId: SHARKHORSE, bans: 1 },
        ],
      }),
      names,
    )

    expect(title).toBe(
      ["Pudge", "", "Banned 3×", "  BUTCUM 2", "  Sharkhorse 1"].join("\n"),
    )
  })

  it("says so when a hero was never banned", () => {
    expect(bannedByTitle("Pudge", stats({ picks: 2 }), names)).toContain("Banned by: nobody")
  })
})

describe("contestedByTitle", () => {
  // The contest number is picks plus bans, so the tooltip has to account for
  // both halves or it explains less than the row it sits on.
  it("shows both halves of the number", () => {
    const title = contestedByTitle(
      "Anti-Mage",
      stats({
        picks: 1,
        wins: 1,
        bans: 2,
        pickedBy: [{ playerId: 7, teamId: SHARKHORSE, position: "POSITION_1", wins: 1, losses: 0 }],
        bannedBy: [{ teamId: BUTCUM, bans: 2 }],
      }),
      names,
    )

    expect(title).toBe(
      [
        "Anti-Mage",
        "",
        "Picked 1×, 1-0 (100%)",
        "  scsper (Sharkhorse) 1-0 · Carry",
        "",
        "Banned 2×",
        "  BUTCUM 2",
      ].join("\n"),
    )
  })
})
