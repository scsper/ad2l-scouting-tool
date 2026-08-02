import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import { useLocation } from "react-router"
import { renderWithProviders } from "../../utils/test-utils"
import { stubFetch } from "../../utils/test-fetch"
import { DivisionPlayers } from "./DivisionPlayers"
import type { DivisionPlayerRow } from "../league-aggregate/league-aggregate-api"

const LEAGUE_ID = 19554
const SHARKHORSE = 9403219
const FOR_GLORT = 10142791

function row(overrides: Partial<DivisionPlayerRow>): DivisionPlayerRow {
  return {
    playerId: 1,
    name: "Someone",
    position: "POSITION_1",
    teamIds: [SHARKHORSE],
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

const PLAYER_STATS: DivisionPlayerRow[] = [
  row({ playerId: 1, name: "Winkx", games: 19, wins: 12, gpm: 692 }),
  row({ playerId: 2, name: "neo_sporin", games: 22, wins: 12, gpm: 637 }),
  // Below the three-game floor: listed, but never ranked.
  row({ playerId: 3, name: "Jishba", games: 2, wins: 0, gpm: 900 }),
  // A stand-in who covered pos 5 for two teams, with no ward data anywhere.
  row({
    playerId: 4,
    name: "Lady Septimus",
    position: "POSITION_5",
    teamIds: [SHARKHORSE, FOR_GLORT],
    games: 13,
    wins: 7,
    obsPerMin: null,
    senPerMin: null,
  }),
]

/**
 * The query string the board wrote. `window.location` is no use here — the
 * tests run under `MemoryRouter`, which never touches it, so asserting on it
 * would pass whatever the board did.
 */
const SearchProbe = () => {
  const { search } = useLocation()
  return <span data-testid="search">{search}</span>
}

const currentSearch = () => screen.getByTestId("search").textContent

function renderBoard(initialEntry = "/") {
  stubFetch({
    "api/league-matches": {
      picksByPosition: {},
      heroDraftStats: {},
      playerStats: PLAYER_STATS,
      playerNames: {},
      teamNames: {},
    },
    "api/team": {
      [LEAGUE_ID]: {
        [SHARKHORSE]: { name: "Sharkhorse", division: "Voyager" },
        [FOR_GLORT]: { name: "For Glort", division: "Voyager" },
      },
    },
  })

  return renderWithProviders(
    <>
      <DivisionPlayers
        leagueId={LEAGUE_ID}
        division="Voyager"
        hasDivisions={true}
      />
      <SearchProbe />
    </>,
    { initialEntries: [initialEntry] },
  )
}

/** A row reads "<rank><name><team>…"; this takes the name out of the middle. */
const NAME_PATTERN = /^\d*(.+?)(?:Sharkhorse|For Glort)/

/** Every row on the board, ranked then low-sample, in the order it renders. */
const rowNames = () =>
  screen
    .getAllByRole("listitem")
    .map(item => NAME_PATTERN.exec(item.textContent)?.[1] ?? "")

/** The `<li>` a player's name sits in, for reading their cells. */
const rowFor = (name: string) => {
  const item = screen
    .getAllByRole("listitem")
    .find(candidate => candidate.textContent.includes(name))
  if (!item) throw new Error(`No row for ${name}`)
  return item
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("DivisionPlayers", () => {
  it("opens on pos 1 sorted by games, and ranks from one", async () => {
    renderBoard()

    await screen.findByText("neo_sporin")
    // 22 games ahead of 19, and Jishba's 2 are below the floor entirely.
    expect(rowNames()).toEqual(["neo_sporin", "Winkx", "Jishba"])
    expect(within(rowFor("neo_sporin")).getByText("1")).toBeInTheDocument()
  })

  // The floor hides a rank, not a player: Jishba's 900 GPM over two games would
  // otherwise sit on top of the board every time you opened it.
  it("lists a thin sample below the ranking without a rank", async () => {
    renderBoard()

    await screen.findByText("Jishba")
    expect(screen.getByText("Fewer than 3 games")).toBeInTheDocument()
    expect(within(rowFor("Jishba")).queryByText("3")).not.toBeInTheDocument()
  })

  it("reads the position and sort out of the URL", async () => {
    renderBoard("/?pos=5")

    await screen.findByText("Lady Septimus")
    expect(screen.queryByText("neo_sporin")).not.toBeInTheDocument()
  })

  it("sorts by the column the URL names", async () => {
    renderBoard("/?sort=gpm")

    await screen.findByText("Winkx")
    // 692 ahead of 637, the reverse of the games-played default.
    expect(rowNames()).toEqual(["Winkx", "neo_sporin", "Jishba"])
  })

  it("puts the sort in the URL so a board can be pasted to someone", async () => {
    const { user } = renderBoard()

    await screen.findByText("neo_sporin")
    await user.click(screen.getByTitle("Gold per minute"))

    expect(currentSearch()).toBe("?sort=gpm")
    expect(rowNames()).toEqual(["Winkx", "neo_sporin", "Jishba"])
  })

  // Otherwise the common URL carries three params that say "the defaults", and
  // the one thing worth reading in it is buried.
  it("leaves a param at its default out of the URL", async () => {
    const { user } = renderBoard("/?pos=5&sort=gpm&dir=asc")

    await screen.findByText("Lady Septimus")
    await user.click(screen.getByRole("button", { name: "Pos 1" }))

    expect(currentSearch()).toBe("?sort=gpm&dir=asc")
  })

  it("flips to ascending when the active column is clicked again", async () => {
    const { user } = renderBoard("/?sort=gpm")

    await screen.findByText("Winkx")
    await user.click(screen.getByTitle("Gold per minute"))

    expect(rowNames()).toEqual(["neo_sporin", "Winkx", "Jishba"])
  })

  it("switches boards when a position is picked", async () => {
    const { user } = renderBoard()

    await screen.findByText("neo_sporin")
    await user.click(screen.getByRole("button", { name: "Pos 5" }))

    expect(screen.getByText("Lady Septimus")).toBeInTheDocument()
    expect(screen.queryByText("neo_sporin")).not.toBeInTheDocument()
  })

  // A tenth of an AD2L season's players turn out for more than one team.
  it("counts the other teams a stand-in covered for", async () => {
    renderBoard("/?pos=5")

    await screen.findByText("Lady Septimus")
    expect(within(rowFor("Lady Septimus")).getByText("Sharkhorse +1")).toBeInTheDocument()
  })

  it("renders a stat no game carries as an em dash, not a zero", async () => {
    renderBoard("/?pos=5")

    await screen.findByText("Lady Septimus")
    expect(within(rowFor("Lady Septimus")).getAllByText("—")).toHaveLength(2)
  })

  it("shows a record with its win rate", async () => {
    renderBoard()

    await screen.findByText("neo_sporin")
    expect(within(rowFor("neo_sporin")).getByText("12-10 (55%)")).toBeInTheDocument()
  })

  // The gate the hero board already has: a ranking that averages two skill
  // tiers describes neither of them.
  it("refuses to rank until a division is picked", () => {
    stubFetch({})
    renderWithProviders(
      <DivisionPlayers
        leagueId={LEAGUE_ID}
        division={undefined}
        hasDivisions={true}
      />,
    )

    expect(
      screen.getByText("Select a division to see its players."),
    ).toBeInTheDocument()
  })
})
