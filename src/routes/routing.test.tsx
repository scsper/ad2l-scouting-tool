import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { MemoryRouter, useLocation } from "react-router"
import { makeStore } from "../app/store"
import { stubFetch } from "../utils/test-fetch"
import { App } from "../App"

const LEAGUE_ID = 19554
const TEAM_ID = 9150871

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
  const { pathname } = useLocation()
  return <span data-testid="path">{pathname}</span>
}

function renderAt(path: string) {
  stubFetch({
    "api/league": [{ id: LEAGUE_ID, name: "AD2L Season 47" }],
    "api/team": {
      [LEAGUE_ID]: {
        [TEAM_ID]: { name: "Derailed Gaming", division: "Voyager" },
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

describe("routes", () => {
  it("sends the root at the default season", async () => {
    renderAt("/")

    expect(await screen.findByText("Select a team to continue")).toBeInTheDocument()
    expect(currentPath()).toBe(`/leagues/${String(LEAGUE_ID)}`)
  })

  it("sends a URL it cannot place back to the root", async () => {
    renderAt("/scouting/derailed")

    await screen.findByText("Select a team to continue")
    expect(currentPath()).toBe(`/leagues/${String(LEAGUE_ID)}`)
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
    expect(activeTab()).toBe("Team")
  })

  it("falls back to the team tab when the URL names one we don't have", async () => {
    renderAt(`/leagues/${String(LEAGUE_ID)}/teams/${String(TEAM_ID)}/heroes`)

    await screen.findByRole("link", { name: "Team" })
    expect(activeTab()).toBe("Team")
  })

  it("carries the division across a move from the aggregate into a team", async () => {
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
