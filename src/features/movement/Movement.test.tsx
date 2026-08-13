import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
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

/**
 * Ten slots, because a match has ten and the slot number carries meaning:
 * 0-4 are Radiant and 5-9 are Dire, always. The fixture used to have three,
 * with the opponent at slot 2 — a state that cannot occur, and one that hid
 * whether allegiance was being read correctly.
 *
 * The unnamed slots deliberately carry `teamId: null`, which is what a match
 * whose `match_player` rows were only partly written actually looks like. They
 * still have to render on the right side, from the slot number alone.
 */
const FILLER_HERO_IDS = [11, 13, 15, 17, 19, 21, 23]

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
  ...FILLER_HERO_IDS.slice(0, 3).map(heroId => ({
    heroId,
    playerId: null,
    playerName: null,
    position: null,
    teamId: null,
  })),
  {
    heroId: 8, // Juggernaut — Dire side, so slot 5
    playerId: 21,
    playerName: "Cy",
    position: "POSITION_1",
    teamId: OPPONENT_TEAM,
  },
  ...FILLER_HERO_IDS.slice(3).map(heroId => ({
    heroId,
    playerId: null,
    playerName: null,
    position: null,
    teamId: null,
  })),
]

function match(id: number, seconds = 600, isRadiant = true) {
  const samples: SlotSamples[] = SLOTS.map((slot, i) => ({
    heroId: slot.heroId,
    // Kept inside the 64..191 grid so nothing is silently clamped onto an edge.
    x: Array.from({ length: seconds }, () => 80 + i * 10),
    y: Array.from({ length: seconds }, () => 80 + i * 10),
    dead: Array.from({ length: seconds }, () => false),
  }))
  const encoded = encodePositions(samples)
  return {
    id,
    start_date_time: START,
    isRadiant,
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
  // Two Radiant, one Dire: majority is Radiant, and the Dire sample is thin.
  matches: [match(111), match(222), match(333, 600, false)],
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

/**
 * A game with the furniture on it: both teams warding, a deward, a tower down
 * and a Roshan. Kept separate from POSITIONS so the older tests keep their
 * quiet fixture.
 *
 * Times are chosen to sit outside the twenty-second marker window at t=300, so
 * these exercise the standing-state layers rather than the transient ones.
 */
const RICH: MatchPositionsApiResponse = {
  // Twenty minutes, so Roshan's eleven-minute respawn window is reachable on
  // the slider. At the default ten it is not, and the marker can only ever be
  // observed in its first state.
  matches: [match(111, 1200)],
  events: [
    // Scouted side (slot 0) places an observer that is still up at t=300.
    {
      matchId: 111,
      time: 100,
      type: "obs",
      slot: 0,
      target_slot: null,
      key: "npc_dota_hero_crystal_maiden",
      x: 120,
      y: 80,
    },
    // Enemy side (slot 5) places a sentry, also still up.
    {
      matchId: 111,
      time: 120,
      type: "sen",
      slot: 5,
      target_slot: null,
      key: "npc_dota_hero_juggernaut",
      x: 140,
      y: 90,
    },
    // An observer that was dewarded before t=300, so it must NOT be drawn.
    {
      matchId: 111,
      time: 110,
      type: "obs",
      slot: 1,
      target_slot: null,
      key: null,
      x: 160,
      y: 100,
    },
    {
      matchId: 111,
      time: 200,
      type: "obs_left",
      slot: 5,
      target_slot: null,
      key: "npc_dota_hero_juggernaut",
      x: 160,
      y: 100,
    },
    {
      matchId: 111,
      time: 180,
      type: "building_kill",
      slot: null,
      target_slot: null,
      key: "npc_dota_goodguys_tower1_mid",
      x: null,
      y: null,
    },
    {
      matchId: 111,
      time: 250,
      type: "roshan",
      slot: 0,
      target_slot: null,
      key: "team=2",
      x: 150,
      y: 140,
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

/**
 * A hand-cranked `requestAnimationFrame`, so playback runs on test time.
 *
 * Install it only once the tab has finished loading, and drive everything after
 * that with `fireEvent` rather than `userEvent`. Testing Library's async helpers
 * sit on real frames, so a stub that fires only when this test says so
 * deadlocks every `findBy*` and every awaited click for as long as it is
 * installed.
 *
 * Half-second frames rather than sixtieths: the loop's own guard discards
 * anything longer, and this is the coarsest step it will still honour, so a run
 * costs a handful of frames instead of hundreds.
 *
 * `cancelAnimationFrame` really drops the callback. A no-op would let the frame
 * already in flight when playback stops fire anyway, and every pause test would
 * be watching the playhead take one more step than the component asked for.
 */
function stubFrames() {
  const pending = new Map<number, FrameRequestCallback>()
  let handle = 0
  let now = 0

  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    handle += 1
    pending.set(handle, cb)
    return handle
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => pending.delete(id))

  return (frames: number) => {
    for (let i = 0; i < frames; i++) {
      const due = [...pending.values()]
      pending.clear()
      now += 500
      act(() => {
        for (const cb of due) cb(now)
      })
    }
  }
}

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

    expect(await screen.findByText(/2 games as radiant/)).toBeInTheDocument()
  })

  it("offers each player by name, position and game count", async () => {
    stubFetch({ "api/match-positions": POSITIONS, "api/team": TEAMS })
    renderMovement()

    expect(
      await screen.findByRole("option", {
        name: /Ana · Hard Support · 2R \/ 1D/,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("option", { name: /Bo · Carry · 2R \/ 1D/ }),
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

    await screen.findByRole("img", { name: "Hero position playback" })

    // Named, not counted. The old assertion counted every <g> on the map, which
    // said nothing about whose heroes were drawn and broke the moment the map
    // gained a second kind of mark.
    expect(screen.getByRole("img", { name: "Crystal Maiden" })).toBeVisible()
    expect(screen.getByRole("img", { name: "Anti-Mage" })).toBeVisible()
    expect(screen.getByRole("img", { name: "Juggernaut" })).toBeVisible()
  })

  it("outlines the scouted team in blue and the opponent in red", async () => {
    // The convention, asserted on the map itself. It was the other way round
    // until this layer was rebuilt, and a team you are studying reading as the
    // threat colour is backwards.
    stubFetch({ "api/match-positions": POSITIONS, "api/team": TEAMS })
    renderMovement("/?mode=playback&t=300")

    const ana = await screen.findByRole("img", { name: "Crystal Maiden" })
    const enemy = screen.getByRole("img", { name: "Juggernaut" })

    expect(ana.querySelector('circle[stroke="#60a5fa"]')).not.toBeNull()
    expect(enemy.querySelector('circle[stroke="#f87171"]')).not.toBeNull()
  })

  it("keeps the legend on the same colours the map is drawn with", async () => {
    // The regression this exists for: the swatches were Tailwind classes while
    // the map read constants, so a colour flip left the legend confidently
    // labelling the map with the old key. Nothing failed; it just lied.
    stubFetch({ "api/match-positions": POSITIONS, "api/team": TEAMS })
    renderMovement("/?mode=playback&t=300")

    expect(
      await screen.findByRole("img", { name: "Blink Squad outline" }),
    ).toHaveStyle({ borderColor: "#60a5fa" })
    expect(screen.getByRole("img", { name: "Opponent outline" })).toHaveStyle({
      borderColor: "#f87171",
    })
  })

  it("draws both teams' wards, which no other tab can show", async () => {
    // The Wards tab reads `match_player.wards`, populated only for the scouted
    // team. Enemy vision has never been visible anywhere in this app.
    stubFetch({ "api/match-positions": RICH, "api/team": TEAMS })
    renderMovement("/?mode=playback&t=300")

    expect(
      await screen.findByRole("img", { name: "Observer · theirs" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("img", { name: "Sentry · enemy" }),
    ).toBeInTheDocument()
  })

  it("takes a dewarded ward off the map at the moment it died", async () => {
    stubFetch({ "api/match-positions": RICH, "api/team": TEAMS })
    const { unmount } = renderMovement("/?mode=playback&t=150")

    // Up at 2:30, with both the surviving observer and the doomed one.
    expect(
      await screen.findAllByRole("img", { name: "Observer · theirs" }),
    ).toHaveLength(2)

    unmount()
    renderMovement("/?mode=playback&t=300")
    expect(
      await screen.findAllByRole("img", { name: "Observer · theirs" }),
    ).toHaveLength(1)
  })

  it("marks Roshan where he actually died, not at a deduced pit", async () => {
    stubFetch({ "api/match-positions": RICH, "api/team": TEAMS })
    renderMovement("/?mode=playback&t=300")

    expect(
      await screen.findByRole("img", { name: "Roshan killed" }),
    ).toBeInTheDocument()
  })

  it("fades the Roshan marker through the window where he may be back", async () => {
    // Killed at 250, so 8:00 later — 730 — the claim "he is down" stops being
    // one we can make. Snapping the marker off at a single moment would assert
    // a precision the game does not have.
    stubFetch({ "api/match-positions": RICH, "api/team": TEAMS })
    renderMovement("/?mode=playback&t=800")

    const rosh = await screen.findByRole("img", { name: "Roshan killed" })
    expect(rosh.querySelector("circle[stroke-dasharray]")).not.toBeNull()
  })

  it("clears the Roshan marker once he has certainly respawned", async () => {
    // Otherwise a long game ends up carrying stale markers, each asserting
    // something that stopped being true many minutes earlier.
    stubFetch({ "api/match-positions": RICH, "api/team": TEAMS })
    renderMovement("/?mode=playback&t=920")

    await screen.findByRole("img", { name: "Crystal Maiden" })
    expect(
      screen.queryByRole("img", { name: "Roshan killed" }),
    ).not.toBeInTheDocument()
  })

  it("shows a tower as destroyed once its building kill has passed", async () => {
    stubFetch({ "api/match-positions": RICH, "api/team": TEAMS })
    const { unmount } = renderMovement("/?mode=playback&t=100")

    expect(
      await screen.findByRole("img", { name: "T1 Mid (theirs) · standing" }),
    ).toBeInTheDocument()

    unmount()
    renderMovement("/?mode=playback&t=300")
    expect(
      await screen.findByRole("img", { name: "T1 Mid (theirs) · destroyed" }),
    ).toBeInTheDocument()
  })

  it("defaults sentries on, unlike the aggregate ward map", async () => {
    // Live state means two to four sentries on screen, not sixty across eight
    // games — and the deward read is the best thing this map offers.
    stubFetch({ "api/match-positions": RICH, "api/team": TEAMS })
    renderMovement("/?mode=playback&t=300")

    expect(
      await screen.findByRole("img", { name: "Sentry · enemy" }),
    ).toBeInTheDocument()
  })

  it("hides a ward layer when its toggle is off in the URL", async () => {
    stubFetch({ "api/match-positions": RICH, "api/team": TEAMS })
    renderMovement("/?mode=playback&t=300&sen=0")

    await screen.findByRole("img", { name: "Observer · theirs" })
    expect(
      screen.queryByRole("img", { name: "Sentry · enemy" }),
    ).not.toBeInTheDocument()
  })

  it("writes a layer toggle to the query string, omitting the default", async () => {
    stubFetch({ "api/match-positions": RICH, "api/team": TEAMS })
    const user = userEvent.setup()
    renderMovement("/?mode=playback&t=300")

    await user.click(await screen.findByRole("checkbox", { name: /Sen/ }))
    expect(screen.getByTestId("search")).toHaveTextContent("sen=0")

    await user.click(screen.getByRole("checkbox", { name: /Sen/ }))
    expect(screen.getByTestId("search")).not.toHaveTextContent("sen=")
  })

  it("falls back to a plain dot when a hero has no icon file", async () => {
    // A hero shipped after the last run of `fetch-hero-icons` has no PNG. The
    // mark has to degrade rather than leave a hole where a hero is standing.
    stubFetch({ "api/match-positions": POSITIONS, "api/team": TEAMS })
    renderMovement("/?mode=playback&t=300")

    const ana = await screen.findByRole("img", { name: "Crystal Maiden" })
    const icon = ana.querySelector("image")
    expect(icon).not.toBeNull()

    fireEvent.error(icon as Element)

    expect(ana.querySelector("image")).toBeNull()
    expect(ana.querySelector('circle[fill="#60a5fa"]')).not.toBeNull()
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

  it("plays the game forward and links to where it stopped", async () => {
    stubFetch({ "api/match-positions": POSITIONS, "api/team": TEAMS })
    renderMovement("/?mode=playback&t=300")

    await screen.findByRole("img", { name: "Hero position playback" })
    expect(screen.getByText(/^Positions at/)).toHaveTextContent(
      "Positions at 5:00",
    )

    const pump = stubFrames()
    fireEvent.click(screen.getByRole("button", { name: "4x" }))
    fireEvent.click(screen.getByRole("button", { name: "Play" }))
    // The first frame is worth nothing — there is no earlier timestamp to
    // measure it against — so five half-seconds at 4x buy the ten seconds.
    pump(6)
    expect(screen.getByText(/^Positions at/)).toHaveTextContent(
      "Positions at 5:10",
    )

    // Nothing reaches the URL until it stops, because an automated sweep at the
    // scrub debounce's rate would exhaust the browser's history allowance.
    expect(screen.getByTestId("search")).toHaveTextContent("t=300")
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    expect(screen.getByTestId("search")).toHaveTextContent("t=310")
  })

  it("stops playing the moment you take the slider yourself", async () => {
    // You grabbed the handle to look at something. A playhead that keeps
    // crawling out from under the cursor is fighting you for the same state.
    stubFetch({ "api/match-positions": POSITIONS, "api/team": TEAMS })
    renderMovement("/?mode=playback&t=300")

    await screen.findByRole("img", { name: "Hero position playback" })
    const pump = stubFrames()
    fireEvent.click(screen.getByRole("button", { name: "4x" }))
    fireEvent.click(screen.getByRole("button", { name: "Play" }))
    pump(3)

    fireEvent.change(screen.getByLabelText("Game time"), {
      target: { value: "420" },
    })
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument()

    pump(5)
    expect(screen.getByText(/^Positions at/)).toHaveTextContent(
      "Positions at 7:00",
    )
  })

  it("parks at the end of the game and restarts from the top", async () => {
    stubFetch({ "api/match-positions": POSITIONS, "api/team": TEAMS })
    renderMovement("/?mode=playback&t=598")

    await screen.findByRole("img", { name: "Hero position playback" })
    const pump = stubFrames()
    fireEvent.click(screen.getByRole("button", { name: "4x" }))
    fireEvent.click(screen.getByRole("button", { name: "Play" }))
    pump(4)

    // Stopped, not looped, and the moment it ended on is linkable.
    expect(screen.getByText(/^Positions at/)).toHaveTextContent(
      "Positions at 9:59",
    )
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument()
    expect(screen.getByTestId("search")).toHaveTextContent("t=599")

    // Play is never a dead button: pressed at the end, it goes back to the top.
    fireEvent.click(screen.getByRole("button", { name: "Play" }))
    expect(screen.getByText(/^Positions at/)).toHaveTextContent(
      "Positions at 0:00",
    )
  })

  it("opens on the team's majority side rather than pooling both", async () => {
    // Pooling was the defect: a player's radiant and dire heatmaps agree at
    // cosine 0.318 against a same-side floor of 0.704, so a combined view keeps
    // 45% of the agreement a real one shows.
    stubFetch({ "api/match-positions": POSITIONS, "api/team": TEAMS })
    renderMovement()

    expect(await screen.findByText(/2 as radiant/)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "As radiant" }),
    ).toBeInTheDocument()
    // The side control offers exactly two choices; there is no pooled third.
    expect(
      screen
        .getAllByRole("button")
        .filter(b => b.textContent.startsWith("As "))
        .map(b => b.textContent),
    ).toEqual(["As radiant", "As dire"])
  })

  it("counts only the selected side's games in the caption", async () => {
    stubFetch({ "api/match-positions": POSITIONS, "api/team": TEAMS })
    const user = userEvent.setup()
    renderMovement()

    expect(await screen.findByText(/2 games as radiant/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "As dire" }))
    expect(await screen.findByText(/1 game as dire/)).toBeInTheDocument()
  })

  it("grades the sample instead of warning at an arbitrary threshold", async () => {
    stubFetch({ "api/match-positions": POSITIONS, "api/team": TEAMS })
    renderMovement()

    // Two games is the band that reads as "no better than the bug".
    expect(await screen.findByText("2 games")).toBeInTheDocument()
    expect(
      screen.getByText(/as unreliable as pooling both sides/),
    ).toBeInTheDocument()
  })

  it("keeps side out of playback, which pools nothing", async () => {
    stubFetch({ "api/match-positions": POSITIONS, "api/team": TEAMS })
    renderMovement("/?mode=playback")

    await screen.findByRole("img", { name: "Hero position playback" })
    expect(screen.queryByRole("button", { name: "As radiant" })).toBeNull()
    // All three games stay reachable regardless of side.
    expect(screen.getAllByRole("option").length).toBe(3)
  })

  it("shows a player with no games on this side rather than hiding them", async () => {
    stubFetch({
      "api/match-positions": { matches: [match(111)], events: [] },
      "api/team": TEAMS,
    })
    const user = userEvent.setup()
    renderMovement()

    await user.click(await screen.findByRole("button", { name: "As dire" }))
    const option = screen.getByRole("option", { name: /Ana/ })
    expect(option).toHaveTextContent("1R / 0D")
    expect(option).toBeDisabled()
  })

  it("empties the map rather than silently swapping who you are looking at", async () => {
    // Re-selecting whoever does have games here would leave you reading one
    // player's map while believing it is another's.
    stubFetch({
      "api/match-positions": { matches: [match(111)], events: [] },
      "api/team": TEAMS,
    })
    const user = userEvent.setup()
    renderMovement()

    await user.click(await screen.findByRole("button", { name: "As dire" }))
    expect(
      await screen.findByText(/played no games as dire/),
    ).toBeInTheDocument()
    expect(screen.getByText(/on the other side/)).toBeInTheDocument()
  })

  it("names the opponent for the selected game", async () => {
    stubFetch({ "api/match-positions": POSITIONS, "api/team": TEAMS })
    renderMovement("/?mode=playback")

    expect(await screen.findByText("vs Quasar Dreams")).toBeInTheDocument()
  })
})
