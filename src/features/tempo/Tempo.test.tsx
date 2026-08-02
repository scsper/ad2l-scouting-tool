import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { Provider } from "react-redux"
import { MemoryRouter } from "react-router"
import { makeStore } from "../../app/store"
import { Tempo } from "./Tempo"
import { stubFetch } from "../../utils/test-fetch"
import type { MatchObjectivesApiResponse } from "../../../api/match-objectives"

const LEAGUE_ID = 19554
const SCOUTED_TEAM = 9150871
const OPPONENT_TEAM = 9403219

function towerKill(key: string, time: number) {
  return {
    time,
    type: "building_kill",
    key,
    unit: null,
    team: null,
    player_slot: null,
    slot: null,
  }
}

function game(id: number, objectives: ReturnType<typeof towerKill>[]) {
  return {
    id,
    start_date_time: 1769738631,
    radiant_team_id: SCOUTED_TEAM,
    dire_team_id: OPPONENT_TEAM,
    winning_team_id: SCOUTED_TEAM,
    duration: 2400,
    isRadiant: true,
    patch: 60,
    hasObjectiveData: true,
    objectives,
  }
}

// Their T1 mid falls at 10:00 and 12:00; in the third game it survives. A
// median over the two falls is 11:00, and only the 2-of-3 denominator says the
// figure describes two thirds of the sample.
const OBJECTIVES: MatchObjectivesApiResponse = {
  matches: [
    game(1, [towerKill("npc_dota_goodguys_tower1_mid", 600)]),
    game(2, [towerKill("npc_dota_goodguys_tower1_mid", 720)]),
    game(3, []),
  ],
  leagueBaseline: [
    {
      tier: 1,
      lane: "mid",
      side: "radiant",
      fell: 100,
      parsed_matches: 120,
      median_time: 780,
      p25_time: 700,
      p75_time: 900,
    },
  ],
}

function renderTempo(payload: MatchObjectivesApiResponse = OBJECTIVES) {
  stubFetch({
    "api/match-objectives": payload,
    "api/team": {
      [LEAGUE_ID]: {
        [SCOUTED_TEAM]: { name: "Derailed Gaming", division: "Voyager" },
        [OPPONENT_TEAM]: { name: "Sharkhorse", division: "Voyager" },
      },
    },
  })

  return render(
    <Provider store={makeStore()}>
      <MemoryRouter>
        <Tempo leagueId={LEAGUE_ID} teamId={SCOUTED_TEAM} />
      </MemoryRouter>
    </Provider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Tempo", () => {
  it("never shows a median without the fall rate that qualifies it", async () => {
    renderTempo()

    const table = (await screen.findByText("Their towers")).closest("div")
    const row = within(table as HTMLElement)
      .getByText("T1 Mid")
      .closest("tr")

    // Median of 10:00 and 12:00, over three parsed games.
    expect(within(row as HTMLElement).getByText("11:00")).toBeInTheDocument()
    expect(within(row as HTMLElement).getByText("2/3")).toBeInTheDocument()
  })

  it("compares against the league median for the same tower", async () => {
    renderTempo()

    const table = (await screen.findByText("Their towers")).closest("div")
    const row = within(table as HTMLElement)
      .getByText("T1 Mid")
      .closest("tr")

    // League median 13:00 against their 11:00 — they lose it two minutes early.
    expect(within(row as HTMLElement).getByText("13:00")).toBeInTheDocument()
    expect(within(row as HTMLElement).getByText("−2:00")).toBeInTheDocument()
  })

  it("splits their buildings from the ones they take", async () => {
    renderTempo()

    expect(await screen.findByText("Their towers")).toBeInTheDocument()
    expect(screen.getByText("Towers they take")).toBeInTheDocument()
  })

  it("says so rather than ranking on too few games", async () => {
    renderTempo({
      matches: [game(1, [towerKill("npc_dota_goodguys_tower1_mid", 600)])],
      leagueBaseline: OBJECTIVES.leagueBaseline,
    })

    expect(await screen.findByText(/Fewer than 4 games/)).toBeInTheDocument()
  })

  it("keeps unparsed games out of the denominator", async () => {
    renderTempo({
      matches: [
        game(1, [towerKill("npc_dota_goodguys_tower1_mid", 600)]),
        { ...game(2, []), hasObjectiveData: false },
      ],
      leagueBaseline: OBJECTIVES.leagueBaseline,
    })

    // Two matches, one parsed: the rate is 1/1, not 1/2. An unparsed game is not
    // a game in which the tower survived.
    const table = (await screen.findByText("Their towers")).closest("div")
    const row = within(table as HTMLElement)
      .getByText("T1 Mid")
      .closest("tr")
    expect(within(row as HTMLElement).getByText("1/1")).toBeInTheDocument()
    expect(screen.getByText(/1 without/)).toBeInTheDocument()
  })

  it("shows all nine towers in both tables, even for a team that switched sides", async () => {
    // The reported symptom: a partial grid. It appeared when the same building
    // was the team's in one game and the opposition's in another, which is the
    // normal case for any team with more than a couple of games.
    renderTempo({
      matches: [
        {
          ...game(1, [towerKill("npc_dota_goodguys_tower3_top", 2000)]),
          isRadiant: true,
        },
        {
          ...game(2, [towerKill("npc_dota_goodguys_tower3_top", 2400)]),
          isRadiant: false,
        },
      ],
      leagueBaseline: OBJECTIVES.leagueBaseline,
    })

    for (const title of ["Their towers", "Towers they take"]) {
      const table = (await screen.findByText(title)).closest("div")
      for (const tier of [1, 2, 3]) {
        for (const lane of ["Top", "Mid", "Bot"]) {
          expect(
            within(table as HTMLElement).getByText(`T${String(tier)} ${lane}`),
          ).toBeInTheDocument()
        }
      }
    }
  })

  it("explains itself when there is no objective data at all", async () => {
    renderTempo({ matches: [], leagueBaseline: [] })

    expect(
      await screen.findByText("No objective data for this team"),
    ).toBeInTheDocument()
  })
})
