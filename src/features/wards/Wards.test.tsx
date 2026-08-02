import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Provider } from "react-redux"
import { makeStore } from "../../app/store"
import { Wards } from "./Wards"
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

/**
 * Node's undici `Request` rejects jsdom's `AbortSignal`, which `fetchBaseQuery`
 * passes through. This shim keeps only the fields the base query reads.
 */
class TestRequest {
  url: string
  method: string
  headers: Headers

  constructor(input: string | { url: string }, init?: RequestInit) {
    this.url = typeof input === "string" ? input : input.url
    this.method = init?.method ?? "GET"
    this.headers = new Headers(init?.headers)
  }

  clone() {
    return this
  }
}

function renderWards() {
  vi.stubGlobal("Request", TestRequest)
  vi.stubGlobal(
    "fetch",
    vi.fn((input: { url: string }) => {
      const { url } = input
      const json = (body: unknown) =>
        Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        )

      if (url.includes("api/match-wards")) return json(WARDS)
      if (url.includes("api/team"))
        return json({
          [LEAGUE_ID]: {
            [SCOUTED_TEAM]: "Derailed Gaming",
            [OPPONENT_TEAM]: "Sharkhorse",
          },
        })
      throw new Error(`Unexpected fetch: ${url}`)
    }),
  )

  return render(
    <Provider store={makeStore()}>
      <Wards leagueId={LEAGUE_ID} teamId={SCOUTED_TEAM} />
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
})
