import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Provider } from "react-redux"
import { MemoryRouter, useLocation } from "react-router"
import { makeStore } from "../../app/store"
import { Wards } from "./Wards"
import { stubFetch } from "../../utils/test-fetch"
import type { MatchWardsApiResponse } from "../../../api/match-wards"
import type { MatchObjectivesApiResponse } from "../../../api/match-objectives"

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
 * A second Radiant game and a Dire one.
 *
 * Most tests want the single-game fixture, but anything about the chip row —
 * or about aggregating — needs more than one game on a side, because a lone
 * selected game is now single-game mode.
 */
const MULTI_WARDS: MatchWardsApiResponse = {
  matches: [
    WARDS.matches[0],
    {
      ...WARDS.matches[0],
      id: 222,
      start_date_time: START + 86400,
      winning_team_id: OPPONENT_TEAM,
      players: [
        {
          ...WARDS.matches[0].players[0],
          wards: [
            { type: "obs", x: 170, y: 150, placed: 100, left: 460, by: null },
          ],
        },
      ],
    },
    {
      ...WARDS.matches[0],
      id: 333,
      start_date_time: START + 172800,
      radiant_team_id: OPPONENT_TEAM,
      dire_team_id: SCOUTED_TEAM,
      isRadiant: false,
    },
    // Never parsed, so it can only ever be a disabled chip.
    {
      ...WARDS.matches[0],
      id: 444,
      start_date_time: START + 259200,
      hasWardData: false,
      players: [{ ...WARDS.matches[0].players[0], wards: null }],
    },
  ],
}

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

// Patch 60 is 7.41, the only patch the Roshan pit rule is confirmed for.
const OBJECTIVES: MatchObjectivesApiResponse = {
  matches: [
    {
      id: 111,
      start_date_time: START,
      radiant_team_id: SCOUTED_TEAM,
      dire_team_id: OPPONENT_TEAM,
      winning_team_id: SCOUTED_TEAM,
      duration: 2400,
      isRadiant: true,
      patch: 60,
      hasObjectiveData: true,
      objectives: [
        // Theirs (Radiant, the scouted side) and the enemy's, so the
        // team-relative split is exercised rather than assumed.
        towerKill("npc_dota_goodguys_tower1_mid", 600),
        towerKill("npc_dota_badguys_tower1_top", 900),
        {
          time: 1262,
          type: "CHAT_MESSAGE_ROSHAN_KILL",
          key: null,
          unit: null,
          team: 2,
          player_slot: null,
          slot: null,
        },
      ],
    },
  ],
  leagueBaseline: [],
}

/** Surfaces the query string so a test can read back what the filters wrote. */
const LocationProbe = () => {
  const { search } = useLocation()
  return <span data-testid="search">{search}</span>
}

function renderWards(initialEntry = "/", wards: MatchWardsApiResponse = WARDS) {
  stubFetch({
    "api/match-wards": wards,
    "api/match-objectives": OBJECTIVES,
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
    renderWards()
    const user = userEvent.setup()

    const map = await screen.findByLabelText("Ward placement map")
    const dot = map.querySelector("g")
    expect(dot).not.toBeNull()

    await user.hover(dot as Element)

    // Placed 100 seconds in.
    expect(screen.getByText("Observer placed at 1:40")).toBeInTheDocument()
    // The role only lives here now that the dot's colour means ward type.
    expect(
      screen.getByText("Scott (Hard Support) - Crystal Maiden"),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        `${new Date(START * 1000).toLocaleDateString()} - vs Sharkhorse`,
      ),
    ).toBeInTheDocument()

    await user.unhover(dot as Element)
    // Keyed on the tooltip's own heading rather than the opponent, which the
    // game chips also name.
    expect(screen.queryByText(/Observer placed at/)).not.toBeInTheDocument()
  })

  it("omits the role when the placer's position was never deduced", async () => {
    renderWards("/", {
      matches: [
        {
          ...WARDS.matches[0],
          players: [{ ...WARDS.matches[0].players[0], position: null }],
        },
      ],
    })
    const user = userEvent.setup()

    const map = await screen.findByLabelText("Ward placement map")
    await user.hover(map.querySelector("g") as Element)

    // No parenthetical, and no stand-in for the missing role: an unattributed
    // ward is drawn like any other now, so the tooltip stays quiet too.
    expect(screen.getByText("Scott - Crystal Maiden")).toBeInTheDocument()
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

  it("marks each tower's fall time on the slider, named team-relative", async () => {
    renderWards("/?match=111")

    await screen.findByLabelText("Ward placement map")

    // The same tier and lane on opposite sides read as theirs versus enemy,
    // because the scouted team switches map side between games.
    expect(screen.getByLabelText("T1 Mid (theirs) · 10:00")).toBeInTheDocument()
    expect(screen.getByLabelText("T1 Top (enemy) · 15:00")).toBeInTheDocument()
  })

  it("seeks the slider to a tower's fall when its tick is clicked", async () => {
    renderWards("/?match=111")
    const user = userEvent.setup()

    await screen.findByLabelText("Ward placement map")
    await user.click(screen.getByLabelText("T1 Mid (theirs) · 10:00"))

    expect(screen.getByTestId("search")).toHaveTextContent("t=600")
    expect(screen.getByText("10:00")).toBeInTheDocument()
  })

  it("shows Roshan with the pit deduced from the death clock", async () => {
    renderWards("/?match=111&t=1300")
    const user = userEvent.setup()

    await screen.findByLabelText("Ward placement map")

    // 21:02 is period 4 (floor(1262/300)), an even one, so Roshan is south and
    // the Tormentor — always opposite — is north.
    expect(screen.getByLabelText("Roshan · south pit")).toBeInTheDocument()

    const tick = screen.getByLabelText(/Roshan · taken by them · 21:02/)
    await user.click(tick)
    expect(screen.getByTestId("search")).toHaveTextContent("t=1262")
  })

  it("draws no Roshan marker on patches the pit rule is not confirmed for", async () => {
    // Half this database predates 7.41; a confidently wrong pit is worse than
    // no pit at all.
    stubFetch({
      "api/match-wards": WARDS,
      "api/match-objectives": {
        ...OBJECTIVES,
        matches: [{ ...OBJECTIVES.matches[0], patch: 59 }],
      },
      "api/team": {
        [LEAGUE_ID]: {
          [SCOUTED_TEAM]: { name: "Derailed Gaming", division: "Voyager" },
          [OPPONENT_TEAM]: { name: "Sharkhorse", division: "Voyager" },
        },
      },
    })

    render(
      <Provider store={makeStore()}>
        <MemoryRouter initialEntries={["/?match=111&t=1300"]}>
          <Wards leagueId={LEAGUE_ID} teamId={SCOUTED_TEAM} />
          <LocationProbe />
        </MemoryRouter>
      </Provider>,
    )

    await screen.findByLabelText("Ward placement map")

    // The timing still shows; only the deduced position is withheld.
    expect(
      screen.getByLabelText(/Roshan · taken by them · 21:02/),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText(/Roshan · .* pit/)).not.toBeInTheDocument()
  })

  it("flips a tower from standing to destroyed as the slider passes its fall", async () => {
    const { unmount } = renderWards("/?match=111&t=300")
    await screen.findByLabelText("Ward placement map")

    // Their T1 mid falls at 10:00, so at 5:00 it is still up.
    expect(
      screen.getByLabelText("T1 Mid (theirs) · standing"),
    ).toBeInTheDocument()
    unmount()

    renderWards("/?match=111&t=900")
    await screen.findByLabelText("Ward placement map")

    expect(
      screen.getByLabelText("T1 Mid (theirs) · destroyed"),
    ).toBeInTheDocument()
    // The enemy's T1 top falls at 15:00, so at 15:00 it is down too, and the
    // two are told apart by ownership rather than by map side.
    expect(
      screen.getByLabelText("T1 Top (enemy) · destroyed"),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText("T3 Mid (theirs) · standing"),
    ).toBeInTheDocument()
  })

  it("collapses to medians and drops the map layer across games", async () => {
    renderWards("/", MULTI_WARDS)

    await screen.findByLabelText("Ward placement map")

    // Only one of the two selected games has objective data, so the median is
    // that game's time — the point is the label carries the denominator rather
    // than showing a bare figure.
    expect(
      screen.getByLabelText("T1 Mid (theirs) · median 10:00 · fell in 1 of 1"),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Narrow to a single game to see them on the map/),
    ).toBeInTheDocument()
  })

  it("aggregates every game named in the query string", async () => {
    renderWards("/?match=111,222", MULTI_WARDS)

    const map = await screen.findByLabelText("Ward placement map")

    expect(screen.getByTitle("Match 111")).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByTitle("Match 222")).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    // Both games' wards are up at the shared default time, and no tower layer
    // is drawn, so every group on the map is a ward.
    expect(map.querySelectorAll("g")).toHaveLength(2)
  })

  it("drops a game from the aggregate when its chip is switched off", async () => {
    renderWards("/?match=111,222", MULTI_WARDS)
    const user = userEvent.setup()

    const map = await screen.findByLabelText("Ward placement map")
    await user.click(screen.getByTitle("Match 222"))

    expect(screen.getByTestId("search")).toHaveTextContent("match=111")
    expect(screen.getByTitle("Match 222")).toHaveAttribute(
      "aria-pressed",
      "false",
    )
    // Down to one game, so the tower layer returns alongside the single ward.
    expect(map.querySelector("g")).not.toBeNull()
    expect(
      screen.getByLabelText("T1 Mid (theirs) · standing"),
    ).toBeInTheDocument()
  })

  it("holds the clock still when a game is toggled", async () => {
    // The whole point of toggling is comparing the same moment across two sets;
    // snapping back to each set's own laning peak would answer a different
    // question every click.
    renderWards("/?match=111,222&t=300", MULTI_WARDS)
    const user = userEvent.setup()

    await screen.findByLabelText("Ward placement map")
    expect(screen.getByText("5:00")).toBeInTheDocument()

    await user.click(screen.getByTitle("Match 222"))

    expect(screen.getByTestId("search")).toHaveTextContent("t=300")
    expect(screen.getByText("5:00")).toBeInTheDocument()
  })

  it("holds the clock still when the side is flipped", async () => {
    renderWards("/?t=300", MULTI_WARDS)
    const user = userEvent.setup()

    await screen.findByLabelText("Ward placement map")
    await user.click(screen.getByRole("button", { name: "As dire" }))

    expect(screen.getByTestId("search")).toHaveTextContent("t=300")
    expect(screen.getByText("5:00")).toBeInTheDocument()
    // The selection resets across the flip: Radiant and Dire games are
    // disjoint, so nothing carries over.
    expect(screen.getByTitle("Match 333")).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.queryByTitle("Match 111")).not.toBeInTheDocument()
  })

  it("opens on the side with the most parsed games", async () => {
    // Two Radiant games with ward data against one Dire.
    renderWards("/", MULTI_WARDS)

    await screen.findByLabelText("Ward placement map")

    expect(screen.getByTitle("Match 111")).toBeInTheDocument()
    expect(screen.queryByTitle("Match 333")).not.toBeInTheDocument()
  })

  it("falls back to that side for a link saved when 'all' existed", async () => {
    renderWards("/?side=all", MULTI_WARDS)

    await screen.findByLabelText("Ward placement map")

    expect(screen.getByTitle("Match 111")).toBeInTheDocument()
    expect(screen.queryByTitle("Match 333")).not.toBeInTheDocument()
  })

  it("shows an unparsed game as a chip that cannot be switched on", async () => {
    // Hiding it would make the count here disagree with the match list, and
    // leave you unsure whether the sample is small or just incomplete.
    renderWards("/", MULTI_WARDS)

    await screen.findByLabelText("Ward placement map")

    const chip = screen.getByTitle(/Match 444/)
    expect(chip).toHaveTextContent("no data")
    expect(chip.tagName).toBe("SPAN")
  })

  it("empties the map when the selection is cleared", async () => {
    renderWards("/", MULTI_WARDS)
    const user = userEvent.setup()

    await screen.findByLabelText("Ward placement map")
    await user.click(screen.getByRole("button", { name: "Clear" }))

    expect(screen.getByText("No games selected")).toBeInTheDocument()
    expect(
      screen.queryByLabelText("Ward placement map"),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Select all" }))
    expect(
      await screen.findByLabelText("Ward placement map"),
    ).toBeInTheDocument()
  })

  it("hides the tower layer when it is switched off", async () => {
    renderWards("/?match=111&towers=0")

    await screen.findByLabelText("Ward placement map")

    expect(screen.queryByLabelText(/T1 Mid \(theirs\)/)).not.toBeInTheDocument()
  })
})
