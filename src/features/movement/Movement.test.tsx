import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Provider } from "react-redux"
import { MemoryRouter, useLocation } from "react-router"
import { makeStore } from "../../app/store"
import { Movement } from "./Movement"
import { stubFetch } from "../../utils/test-fetch"
import {
  encodePositions,
  type SlotSamples,
} from "../../../shared/position-codec"
import type {
  MatchPositionsApiResponse,
  PositionSlot,
} from "../../../api/match-positions"

const LEAGUE_ID = 19554
const SCOUTED_TEAM = 9150871
const OPPONENT_TEAM = 9403219
const START = 1769738631

function toBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const SLOTS: Omit<PositionSlot, "slot">[] = [
  {
    heroId: 5, // Crystal Maiden
    playerId: 11,
    playerName: "Ana",
    position: "POSITION_5",
    teamId: SCOUTED_TEAM,
  },
  {
    heroId: 1, // Anti-Mage
    playerId: 12,
    playerName: "Bo",
    position: "POSITION_1",
    teamId: SCOUTED_TEAM,
  },
  {
    heroId: 8, // Juggernaut
    playerId: 21,
    playerName: "Cy",
    position: "POSITION_1",
    teamId: OPPONENT_TEAM,
  },
]

function match(id: number, seconds = 600) {
  const samples: SlotSamples[] = SLOTS.map((slot, i) => ({
    heroId: slot.heroId,
    x: Array.from({ length: seconds }, () => 80 + i * 20),
    y: Array.from({ length: seconds }, () => 80 + i * 20),
    dead: Array.from({ length: seconds }, () => false),
  }))
  const encoded = encodePositions(samples)
  return {
    id,
    start_date_time: START,
    isRadiant: true,
    opponentTeamId: OPPONENT_TEAM,
    winning_team_id: SCOUTED_TEAM,
    encoding: "delta-i16-0.1grid-gz-v1",
    firstTime: 0,
    sampleCount: seconds,
    slots: SLOTS.map((slot, i) => ({ ...slot, slot: i })),
    positions: toBase64(encoded.positions),
    lifeStates: toBase64(encoded.lifeStates),
  }
}

const POSITIONS: MatchPositionsApiResponse = {
  matches: [match(111), match(222)],
  events: [
    {
      matchId: 111,
      time: 300,
      type: "hero_death",
      slot: 0,
      target_slot: 2,
      key: "npc_dota_hero_juggernaut",
      x: 80,
      y: 80,
    },
    {
      matchId: 111,
      time: 295,
      type: "smoke",
      slot: 1,
      target_slot: null,
      key: null,
      x: 100,
      y: 100,
    },
  ],
}

const TEAMS = {
  [LEAGUE_ID]: {
    [SCOUTED_TEAM]: { name: "Blink Squad", division: "Voyager" },
    [OPPONENT_TEAM]: { name: "Quasar Dreams", division: "Voyager" },
  },
}

const ShowLocation = () => {
  const { search } = useLocation()
  return <div data-testid="search">{search}</div>
}

function renderMovement(url = "/") {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter initialEntries={[url]}>
        <Movement leagueId={LEAGUE_ID} teamId={SCOUTED_TEAM} />
        <ShowLocation />
      </MemoryRouter>
    </Provider>,
  )
}

/**
 * jsdom ships no canvas, and its `getContext` reports "not implemented" through
 * the virtual console on every render before returning null. Stubbing it keeps
 * the run readable and exercises the same degraded path a browser without a 2D
 * context would take: the heatmap image is skipped, the rest of the tab renders.
 */
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("Movement", () => {
  it("says so plainly when no replay has been parsed", async () => {
    // Distinct from an error: OpenDota cannot supply this data at all, so the
    // empty state has to point at the parse script rather than at a retry.
    stubFetch({
      "api/match-positions": { matches: [], events: [] },
      "api/team": TEAMS,
    })
    renderMovement()

    expect(
      await screen.findByText("No parsed replays for this team"),
    ).toBeInTheDocument()
    expect(screen.getByText(/parse-replays/)).toBeInTheDocument()
  })

  it("shows the game count next to the heatmap", async () => {
    // The only thing separating a two-game heatmap from a twenty-game one once
    // both are drawn.
    stubFetch({
      "api/match-positions": POSITIONS,
      "api/team": TEAMS,
    })
    renderMovement()

    expect(await screen.findByText(/2 games ·/)).toBeInTheDocument()
  })

  it("offers each player by name, position and game count", async () => {
    stubFetch({ "api/match-positions": POSITIONS, "api/team": TEAMS })
    renderMovement()

    expect(
      await screen.findByRole("option", {
        name: /Ana · Hard Support · 2 games/,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("option", { name: /Bo · Carry · 2 games/ }),
    ).toBeInTheDocument()
  })

  it("never offers an opposing player as a heatmap subject", async () => {
    stubFetch({ "api/match-positions": POSITIONS, "api/team": TEAMS })
    renderMovement()

    await screen.findByRole("option", { name: /Ana/ })
    expect(screen.queryByRole("option", { name: /Cy/ })).not.toBeInTheDocument()
  })

  it("warns when a heatmap rests on only a handful of games", async () => {
    stubFetch({
      "api/match-positions": { matches: [match(111)], events: [] },
      "api/team": TEAMS,
    })
    renderMovement()

    expect(
      await screen.findByText(/not a tendency/, { exact: false }),
    ).toBeInTheDocument()
  })

  it("writes the mode to the query string so a view can be linked to", async () => {
    stubFetch({ "api/match-positions": POSITIONS, "api/team": TEAMS })
    const user = userEvent.setup()
    renderMovement()

    await user.click(await screen.findByRole("button", { name: "playback" }))
    expect(screen.getByTestId("search")).toHaveTextContent("mode=playback")
  })

  it("names both teams' heroes in playback, not just the scouted side", async () => {
    // Movement is relative: a rotation is only legible next to where the other
    // five were standing.
    stubFetch({ "api/match-positions": POSITIONS, "api/team": TEAMS })
    renderMovement("/?mode=playback&t=300")

    const map = await screen.findByRole("img", {
      name: "Hero position playback",
    })
    // Three hero markers, each with halo + body + hit area.
    expect(map.querySelectorAll("g")).toHaveLength(
      3 /* heroes */ + 2 /* positioned events */,
    )
  })

  it("lists recent events under the playback map", async () => {
    stubFetch({ "api/match-positions": POSITIONS, "api/team": TEAMS })
    renderMovement("/?mode=playback&t=300")

    expect(await screen.findByText(/5:00 Death/)).toBeInTheDocument()
    expect(screen.getByText(/4:55 Smoke/)).toBeInTheDocument()
  })

  it("drops events once the playhead moves past their window", async () => {
    stubFetch({ "api/match-positions": POSITIONS, "api/team": TEAMS })
    renderMovement("/?mode=playback&t=400")

    expect(
      await screen.findByText("Nothing in the last 20s"),
    ).toBeInTheDocument()
  })

  it("names the opponent for the selected game", async () => {
    stubFetch({ "api/match-positions": POSITIONS, "api/team": TEAMS })
    renderMovement("/?mode=playback")

    expect(await screen.findByText("vs Quasar Dreams")).toBeInTheDocument()
  })
})
