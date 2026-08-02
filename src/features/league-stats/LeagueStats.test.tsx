import { afterEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { renderWithProviders } from "../../utils/test-utils"
import { stubFetch } from "../../utils/test-fetch"
import { LeagueStats } from "./LeagueStats"

const LEAGUE_ID = 19554
const SHARKHORSE = 9403219
const BUTCUM = 8750033
const ANTI_MAGE = "1"
const PUDGE = "14"

function renderBoards() {
  stubFetch({
    "api/league-matches": {
      picksByPosition: {
        POSITION_1: { [ANTI_MAGE]: { picks: 2, wins: 1 } },
      },
      heroDraftStats: {
        [ANTI_MAGE]: {
          picks: 2,
          bans: 1,
          wins: 1,
          pickedBy: [
            { playerId: 7, teamId: SHARKHORSE, position: "POSITION_1", wins: 1, losses: 0 },
            { playerId: 8, teamId: BUTCUM, position: "POSITION_1", wins: 0, losses: 1 },
          ],
          bannedBy: [{ teamId: BUTCUM, bans: 1 }],
        },
        [PUDGE]: { picks: 0, bans: 3, wins: 0, pickedBy: [], bannedBy: [{ teamId: SHARKHORSE, bans: 3 }] },
      },
      playerStats: [],
      playerNames: { "7": "scsper", "8": "lil feed" },
      teamNames: { [SHARKHORSE]: "Sharkhorse", [BUTCUM]: "BUTCUM" },
    },
  })

  return renderWithProviders(
    <LeagueStats leagueId={LEAGUE_ID} division="Voyager" hasDivisions={true} />,
  )
}

/**
 * The hover text of every row naming a hero. A hero appears on several boards
 * at once — picks, bans, contested, and its position column — and each board
 * explains its own number, so these assert which title landed where.
 */
const titlesFor = (hero: string) =>
  screen
    .getAllByRole("listitem")
    .filter(item => item.textContent.startsWith(hero))
    .map(item => item.title)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("LeagueStats", () => {
  it("names the players behind a pick count", async () => {
    renderBoards()
    await screen.findAllByText("Anti-Mage")

    expect(titlesFor("Anti-Mage")).toContain(
      [
        "Anti-Mage",
        "",
        "Picked 2×, 1-1 (50%)",
        "  scsper (Sharkhorse) 1-0 · Carry",
        "  lil feed (BUTCUM) 0-1 · Carry",
      ].join("\n"),
    )
  })

  it("names the teams behind a ban count", async () => {
    renderBoards()
    await screen.findAllByText("Pudge")

    expect(titlesFor("Pudge")).toContain(["Pudge", "", "Banned 3×", "  Sharkhorse 3"].join("\n"))
  })

  it("accounts for both halves of a contest count", async () => {
    renderBoards()
    await screen.findAllByText("Anti-Mage")

    expect(titlesFor("Anti-Mage")).toContain(
      [
        "Anti-Mage",
        "",
        "Picked 2×, 1-1 (50%)",
        "  scsper (Sharkhorse) 1-0 · Carry",
        "  lil feed (BUTCUM) 0-1 · Carry",
        "",
        "Banned 1×",
        "  BUTCUM 1",
      ].join("\n"),
    )
  })

  // The position card's number is a subset of the league-wide one, so its
  // tooltip has to be too — otherwise the pos 1 column explains pos 5 games.
  it("scopes a position card's tooltip to that position", async () => {
    renderBoards()
    await screen.findAllByText("Anti-Mage")

    expect(titlesFor("Anti-Mage")).toContain(
      [
        "Anti-Mage — Carry",
        "",
        "Picked 2×, 1-1 (50%)",
        "  scsper (Sharkhorse) 1-0",
        "  lil feed (BUTCUM) 0-1",
      ].join("\n"),
    )
  })
})
