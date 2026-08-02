import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Provider } from "react-redux"
import { MemoryRouter, useLocation } from "react-router"
import { makeStore } from "../../app/store"
import { Wards } from "./Wards"
import { stubFetch } from "../../utils/test-fetch"
import type { MatchWardsApiResponse } from "../../../api/match-wards"

const LEAGUE_ID = 19554
const SCOUTED_TEAM = 9150871
const OPPONENT_TEAM = 9403219

// 2026-01-30 in UTC; asserted through toLocaleDateString so the expectation
// tracks whatever locale the test runner uses.
const START = 1769738631

const WARDS: MatchWardsApiResponse = {
  matches: [
    {
      id: 111,
      start_date_time: START,
      radiant_team_id: SCOUTED_TEAM,
      dire_team_id: OPPONENT_TEAM,
      winning_team_id: SCOUTED_TEAM,
      duration: 2400,
      isRadiant: true,
      hasWardData: true,
      players: [
        {
          player_id: 1,
          player_name: "Scott",
          hero_id: 5, // Crystal Maiden
          position: "POSITION_5",
          team_id: SCOUTED_TEAM,
          wards: [
            { type: "obs", x: 130, y: 118, placed: 100, left: 460, by: null },
          ],
        },
      ],
    },
  ],
}

/** Surfaces the query string so a test can read back what the filters wrote. */
const LocationProbe = () => {
  const { search } = useLocation()
  return <span data-testid="search">{search}</span>
}

function renderWards(initialEntry = "/") {
  stubFetch({
    "api/match-wards": WARDS,
    "api/team": {
      [LEAGUE_ID]: {
        [SCOUTED_TEAM]: { name: "Derailed Gaming", division: "Voyager" },
        [OPPONENT_TEAM]: { name: "Sharkhorse", division: "Voyager" },
      },
    },
  })

  return render(
    <Provider store={makeStore()}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Wards leagueId={LEAGUE_ID} teamId={SCOUTED_TEAM} />
        <LocationProbe />
      </MemoryRouter>
    </Provider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Wards", () => {
  it("names the game, the opponent and the placer when a ward is hovered", async () => {
    const { container } = renderWards()
    const user = userEvent.setup()

    const map = await screen.findByLabelText("Ward placement map")
    const dot = map.querySelector("g")
    expect(dot).not.toBeNull()

    await user.hover(dot as Element)

    // Placed 100 seconds in.
    expect(screen.getByText("Observer placed at 1:40")).toBeInTheDocument()
    expect(screen.getByText("Scott - Crystal Maiden")).toBeInTheDocument()
    expect(
      screen.getByText(
        `${new Date(START * 1000).toLocaleDateString()} - vs Sharkhorse`,
      ),
    ).toBeInTheDocument()

    await user.unhover(dot as Element)
    expect(container.textContent).not.toContain("vs Sharkhorse")
  })

  it("writes a filter to the query string so the view can be linked to", async () => {
    renderWards()
    const user = userEvent.setup()

    await screen.findByLabelText("Ward placement map")
    await user.click(screen.getByLabelText(/Sentries/))

    expect(screen.getByTestId("search")).toHaveTextContent("sen=1")
  })

  it("takes its filters from the query string on a cold load", async () => {
    renderWards("/?sen=1&obs=0")

    await screen.findByLabelText("Ward placement map")

    expect(screen.getByLabelText(/Sentries/)).toBeChecked()
    expect(screen.getByLabelText(/Observers/)).not.toBeChecked()
  })
})
