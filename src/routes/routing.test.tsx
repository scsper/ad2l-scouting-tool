import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { MemoryRouter, useLocation } from "react-router"
import { makeStore } from "../app/store"
import { stubFetch } from "../utils/test-fetch"
import { App } from "../App"

const LEAGUE_ID = 20077
const TEAM_ID = 9150871
const DEFAULT_TEAM_ID = 9403219

// The router has to be exercised through the real shell, and the shell gates
// on Clerk. Standing in for it keeps these tests about URLs rather than auth.
vi.mock("@clerk/react", () => ({
  Show: ({ when, children }: { when: string; children: ReactNode }) => (
    <>{when === "signed-in" ? children : null}</>
  ),
  SignInButton: () => null,
  UserButton: () => null,
  // The picker mounts the write modals even while closed, and they ask for a
  // token on render. Nothing here submits, so the token is never spent.
  useAuth: () => ({ getToken: () => Promise.resolve(null) }),
}))

/** Surfaces where the router settled, including any redirect it followed. */
const PathProbe = () => {
  const { pathname, search } = useLocation()
  return (
    <>
      <span data-testid="path">{pathname}</span>
      <span data-testid="search">{search}</span>
    </>
  )
}

type Me = {
  isAdmin: boolean
  grants: { leagueId: number; division: string }[]
  hasAccess: boolean
}

function renderAt(
  path: string,
  me: Me = { isAdmin: true, grants: [], hasAccess: true },
) {
  stubFetch({
    // The shell now blocks on this before rendering any route: it decides
    // whether the account is provisioned, and where `/` lands.
    "api/me": me,
    // Ahead of "api/league", which is a prefix of it and would answer first.
    "api/league-matches": {
      picksByPosition: {},
      heroDraftStats: {},
      playerStats: [],
      playerNames: {},
      teamNames: {},
    },
    "api/league": [{ id: LEAGUE_ID, name: "AD2L Season 48" }],
    "api/team": {
      [LEAGUE_ID]: {
        [TEAM_ID]: { name: "Derailed Gaming", division: "Voyager" },
        [DEFAULT_TEAM_ID]: { name: "Sharkhorse", division: "Challenger" },
      },
    },
    "api/matches": [],
  })

  return render(
    <Provider store={makeStore()}>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <PathProbe />
      </MemoryRouter>
    </Provider>,
  )
}

/** The tab a `NavLink` has marked as current. */
const activeTab = () =>
  screen
    .getAllByRole("link")
    .find(link => link.getAttribute("aria-current") === "page")?.textContent

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Where the router settled, read off the probe the shell renders. */
const currentPath = () => screen.getByTestId("path").textContent

// A redirect now lands a tick after the screen it starts from paints: the
// shell blocks on `api/me` before mounting any route, so the app no longer
// mounts in a single commit. Hence `waitFor` around the path assertions below
// rather than reading it straight after the link appears.

/** The query string a redirect kept or dropped. */
const currentSearch = () => screen.getByTestId("search").textContent

describe("routes", () => {
  it("sends the root at the default team in the default season", async () => {
    renderAt("/")

    await waitFor(() => {
      expect(currentPath()).toBe(
        `/leagues/${String(LEAGUE_ID)}/teams/${String(DEFAULT_TEAM_ID)}/team`,
      )
    })
    expect(currentSearch()).toBe("?division=Challenger")
  })

  it("sends a URL it cannot place back to the root", async () => {
    renderAt("/scouting/derailed")

    await waitFor(() => {
      expect(currentPath()).toBe(
        `/leagues/${String(LEAGUE_ID)}/teams/${String(DEFAULT_TEAM_ID)}/team`,
      )
    })
  })

  // A grant is keyed on a division, so the default team is only the right
  // landing for accounts that can read Challenger.
  it("stops a user granted another division at the league picker", async () => {
    renderAt("/", {
      isAdmin: false,
      grants: [{ leagueId: LEAGUE_ID, division: "Warrior" }],
      hasAccess: true,
    })

    expect(
      await screen.findByText("Select a team to continue"),
    ).toBeInTheDocument()
    expect(currentPath()).toBe(`/leagues/${String(LEAGUE_ID)}`)
  })

  it("sends a user scoped to another season to that season", async () => {
    renderAt("/", {
      isAdmin: false,
      grants: [{ leagueId: 19554, division: "Voyager" }],
      hasAccess: true,
    })

    await waitFor(() => {
      expect(currentPath()).toBe("/leagues/19554")
    })
  })

  it("opens the tab a deep link names, with no prior state", async () => {
    renderAt(`/leagues/${String(LEAGUE_ID)}/teams/${String(TEAM_ID)}/lanes`)

    expect(await screen.findByRole("link", { name: "Lanes" })).toHaveAttribute(
      "aria-current",
      "page",
    )
  })

  it("falls back to the team tab when the URL names no tab", async () => {
    renderAt(`/leagues/${String(LEAGUE_ID)}/teams/${String(TEAM_ID)}`)

    await screen.findByRole("link", { name: "Team" })
    await waitFor(() => {
      expect(activeTab()).toBe("Team")
    })
  })

  it("falls back to the team tab when the URL names one we don't have", async () => {
    renderAt(`/leagues/${String(LEAGUE_ID)}/teams/${String(TEAM_ID)}/heroes`)

    await screen.findByRole("link", { name: "Team" })
    await waitFor(() => {
      expect(activeTab()).toBe("Team")
    })
  })

  // `/leagues/:id/stats` was the whole screen before it grew a second
  // board, so it is a URL already out in the world.
  it("sends the bare stats URL to the hero board", async () => {
    renderAt(`/leagues/${String(LEAGUE_ID)}/stats`)

    await screen.findByRole("link", { name: "Heroes" })
    await waitFor(() => {
      expect(currentPath()).toBe(`/leagues/${String(LEAGUE_ID)}/stats/heroes`)
    })
  })

  it("sends a stats board we don't have to the hero board", async () => {
    renderAt(`/leagues/${String(LEAGUE_ID)}/stats/wards`)

    await screen.findByRole("link", { name: "Heroes" })
    await waitFor(() => {
      expect(currentPath()).toBe(`/leagues/${String(LEAGUE_ID)}/stats/heroes`)
    })
  })

  // The screen was `/aggregate` until it was renamed, and those links are
  // already pasted into scrims threads nobody will go back and edit.
  it("sends the old aggregate path to the same board on the new one", async () => {
    renderAt(`/leagues/${String(LEAGUE_ID)}/aggregate/players?division=Voyager`)

    await screen.findByRole("link", { name: "Players" })
    await waitFor(() => {
      expect(currentPath()).toBe(`/leagues/${String(LEAGUE_ID)}/stats/players`)
    })
    expect(currentSearch()).toBe("?division=Voyager")
  })

  it("sends the bare old aggregate path to the hero board", async () => {
    renderAt(`/leagues/${String(LEAGUE_ID)}/aggregate`)

    await screen.findByRole("link", { name: "Heroes" })
    await waitFor(() => {
      expect(currentPath()).toBe(`/leagues/${String(LEAGUE_ID)}/stats/heroes`)
    })
  })

  it("opens the player board a deep link names", async () => {
    renderAt(`/leagues/${String(LEAGUE_ID)}/stats/players`)

    expect(await screen.findByRole("link", { name: "Players" })).toHaveAttribute(
      "aria-current",
      "page",
    )
  })

  // Without it the board it lands on would refuse to query, which is the one
  // redirect that could lose you the screen you were sent.
  it("keeps the division when redirecting a bare stats URL", async () => {
    renderAt(`/leagues/${String(LEAGUE_ID)}/stats?division=Voyager`)

    await screen.findByRole("link", { name: "Heroes" })
    expect(currentSearch()).toBe("?division=Voyager")
  })

  // The division outlives the screen that set it; a position and sort describe
  // one board and must not lie in wait on the other.
  it("carries the division between stats boards but not the sort", async () => {
    renderAt(
      `/leagues/${String(LEAGUE_ID)}/stats/players?division=Voyager&pos=4&sort=xpAt10`,
    )

    const heroes = await screen.findByRole("link", { name: "Heroes" })
    expect(heroes).toHaveAttribute(
      "href",
      `/leagues/${String(LEAGUE_ID)}/stats/heroes?division=Voyager`,
    )
  })

  it("carries the division across a move from the stats screen into a team", async () => {
    renderAt(
      `/leagues/${String(LEAGUE_ID)}/teams/${String(TEAM_ID)}/wards?division=Voyager`,
    )

    const wards = await screen.findByRole("link", { name: "Wards" })
    expect(wards).toHaveAttribute(
      "href",
      `/leagues/${String(LEAGUE_ID)}/teams/${String(TEAM_ID)}/wards?division=Voyager`,
    )
  })
})
