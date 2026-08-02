import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Provider } from "react-redux"
import { makeStore } from "../../app/store"
import { PlayerStats } from "./PlayerStats"
import type { MatchApiResponse } from "../../../types/api"
import type { MatchPlayerRow } from "../../../types/db"

const LEAGUE_ID = 19554
const SCOUTED_TEAM = 9150871 // Derailed Gaming
const OPPONENT_TEAM = 9403219 // Sharkhorse

function player(overrides: Partial<MatchPlayerRow>): MatchPlayerRow {
  return {
    player_id: 1,
    match_id: 0,
    team_id: SCOUTED_TEAM,
    player_name: "Scott",
    hero_id: 1, // Anti-Mage
    position: "POSITION_1",
    lane_outcome: null,
    lane: null,
    kills: 0,
    deaths: 0,
    assists: 0,
    last_hits: 0,
    denies: 0,
    gpm: 0,
    xpm: 0,
    hero_damage: 0,
    tower_damage: 0,
    ...overrides,
  }
}

const MATCHES: MatchApiResponse[] = [
  {
    id: 111,
    league_id: LEAGUE_ID,
    winning_team_id: SCOUTED_TEAM,
    radiant_team_id: SCOUTED_TEAM,
    dire_team_id: OPPONENT_TEAM,
    start_date_time: 2000,
    end_date_time: 4000,
    draft: [],
    players: [
      player({
        gpm: 600,
        xpm: 700,
        kills: 10,
        deaths: 0,
        assists: 10,
        hero_damage: 30000,
      }),
    ],
  },
  {
    id: 222,
    league_id: LEAGUE_ID,
    winning_team_id: OPPONENT_TEAM,
    radiant_team_id: SCOUTED_TEAM,
    dire_team_id: OPPONENT_TEAM,
    start_date_time: 1000,
    end_date_time: 3000,
    draft: [],
    players: [
      player({
        gpm: 400,
        xpm: 500,
        kills: 2,
        deaths: 10,
        assists: 4,
        hero_damage: 10000,
      }),
    ],
  },
]

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

function rosterMember(opts: { playerId: number; name: string; role?: string }) {
  return {
    league_id: LEAGUE_ID,
    team_id: SCOUTED_TEAM,
    player_id: opts.playerId,
    created_at: "",
    updated_at: "",
    role: opts.role ?? "Carry",
    name: opts.name,
    rank: "Divine",
    original_rank: null,
  }
}

function stubFetch(roster: unknown[]) {
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

      if (url.includes("api/matches")) return json(MATCHES)
      if (url.includes("api/team")) return json({})
      if (url.includes("api/roster")) return json(roster)
      throw new Error(`Unexpected fetch: ${url}`)
    }),
  )
}

function renderPlayerStats(roster: unknown[] = []) {
  stubFetch(roster)
  return render(
    <Provider store={makeStore()}>
      <PlayerStats leagueId={LEAGUE_ID} teamId={SCOUTED_TEAM} />
    </Provider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("PlayerStats", () => {
  it("shows the player's averages and record, collapsed by default", async () => {
    renderPlayerStats()

    const name = await screen.findByText("Scott")
    const row = name.closest("button")
    expect(row).not.toBeNull()

    const cells = within(row as HTMLElement)
    expect(cells.getByText("Pos 1")).toBeInTheDocument()
    expect(cells.getByText(/· 2g/)).toBeInTheDocument()
    // 1-1 record at 50%
    expect(cells.getByText("(50%)")).toBeInTheDocument()
    // gpm 500, xpm 600, k 6.0, d 5.0, a 7.0
    expect(cells.getByText("500")).toBeInTheDocument()
    expect(cells.getByText("600")).toBeInTheDocument()
    expect(cells.getByText("6.0")).toBeInTheDocument()
    expect(cells.getByText("5.0")).toBeInTheDocument()
    expect(cells.getByText("7.0")).toBeInTheDocument()
    // KDA is the ratio of totals: (12 + 14) / 10
    expect(cells.getByText("2.6")).toBeInTheDocument()
    expect(cells.getByText("20.0k")).toBeInTheDocument()

    // Per-game rows stay hidden until the card is expanded.
    expect(screen.queryByTitle("View on Dotabuff")).not.toBeInTheDocument()
  })

  it("reveals every game when the player is expanded", async () => {
    renderPlayerStats()
    const user = userEvent.setup()

    await user.click(await screen.findByText("Scott"))

    const links = await screen.findAllByTitle("View on Dotabuff")
    expect(links).toHaveLength(2)
    // Newest match first.
    expect(links[0]).toHaveAttribute(
      "href",
      "https://www.dotabuff.com/matches/111",
    )

    expect(screen.getAllByText("Anti-Mage")).toHaveLength(2)
    expect(screen.getByTitle("Win")).toBeInTheDocument()
    expect(screen.getByTitle("Loss")).toBeInTheDocument()
    // The deathless game reads 20.0 rather than dividing by zero.
    expect(screen.getByText("20.0")).toBeInTheDocument()
  })

  it("omits the stand-in heading when the roster is unknown", async () => {
    renderPlayerStats()

    await screen.findByText("Scott")
    expect(screen.queryByText("Stand-ins")).not.toBeInTheDocument()
  })

  it("lists a player who isn't on the roster under Stand-ins", async () => {
    renderPlayerStats([rosterMember({ playerId: 2, name: "Benched" })])

    expect(await screen.findByText("Stand-ins")).toBeInTheDocument()
    expect(screen.getByText("Scott")).toBeInTheDocument()
  })

  it("keeps a roster member who played no games in this league", async () => {
    // Both halves of a wrong roster have to be visible: the stand-in who played
    // (Scott) and the registered player who didn't (Benched). Hiding the latter
    // is what let a 7-game starter sit under "Stand-ins" unnoticed.
    renderPlayerStats([rosterMember({ playerId: 2, name: "Benched" })])

    expect(await screen.findByText("Benched")).toBeInTheDocument()
    expect(screen.getByText("no games this league")).toBeInTheDocument()
  })
})
