import { Navigate, Route, Routes, useLocation, useParams } from "react-router"
import { StatsRoute } from "./routes/StatsRoute"
import { DivisionPlayersTab, HeroesTab } from "./routes/stats-tab-routes"
import { LeagueLayout } from "./routes/LeagueLayout"
import { LeaguePicker } from "./routes/LeaguePicker"
import { RootLayout } from "./routes/RootLayout"
import { TeamLayout } from "./routes/TeamLayout"
import {
  LanesTab,
  PlayersTab,
  PubStatsTab,
  TeamTab,
  WardsTab,
} from "./routes/tab-routes"
import { DEFAULT_LEAGUE_ID } from "./routes/routing"

/**
 * A team URL with no tab, or with one we don't have.
 *
 * The tab is the only part of a URL worth checking, because it is the only
 * part that can be checked for free — the list is a constant. A league or team
 * id can only be judged against data, and gating every render on that query
 * would put a spinner in front of the common case to tidy up the rare one, so
 * an unknown id is left to fall through to the empty states the tabs already
 * have.
 */
const RedirectToDefaultTab = () => {
  const { leagueId, teamId } = useParams()
  const { search } = useLocation()

  return (
    <Navigate
      to={`/leagues/${String(leagueId)}/teams/${String(teamId)}/team${search}`}
      replace
    />
  )
}

/**
 * The stats screen with no board named, or one we don't have.
 *
 * `/leagues/:id/stats` was the whole screen before it grew a second board, so
 * it is a URL already out in the world and has to keep landing somewhere. The
 * search string comes along because it carries the division, without which the
 * board it lands on would refuse to query.
 */
const RedirectToDefaultStatsTab = () => {
  const { leagueId } = useParams()
  const { search } = useLocation()

  return (
    <Navigate
      to={`/leagues/${String(leagueId)}/stats/heroes${search}`}
      replace
    />
  )
}

/**
 * The screen's old path, from when it was called the aggregate.
 *
 * Renaming a route breaks every link already pasted into a scrims thread, and
 * nobody goes back to edit those. The board and the query are carried through
 * so an old link lands on the exact screen it named rather than the default.
 */
const RedirectFromAggregate = () => {
  const params = useParams()
  const { search } = useLocation()
  const board = params["*"]

  return (
    <Navigate
      to={`/leagues/${String(params.leagueId)}/stats${board ? `/${board}` : ""}${search}`}
      replace
    />
  )
}

export const App = () => (
  <Routes>
    <Route element={<RootLayout />}>
      <Route
        index
        element={<Navigate to={`/leagues/${String(DEFAULT_LEAGUE_ID)}`} replace />}
      />

      <Route path="leagues/:leagueId" element={<LeagueLayout />}>
        <Route index element={<LeaguePicker />} />

        <Route path="stats" element={<StatsRoute />}>
          <Route index element={<RedirectToDefaultStatsTab />} />
          <Route path="heroes" element={<HeroesTab />} />
          <Route path="players" element={<DivisionPlayersTab />} />
          <Route path="*" element={<RedirectToDefaultStatsTab />} />
        </Route>

        <Route path="aggregate/*" element={<RedirectFromAggregate />} />

        <Route path="teams/:teamId" element={<TeamLayout />}>
          <Route index element={<RedirectToDefaultTab />} />
          <Route path="team" element={<TeamTab />} />
          <Route path="players" element={<PlayersTab />} />
          <Route path="pub-stats" element={<PubStatsTab />} />
          <Route path="lanes" element={<LanesTab />} />
          <Route path="wards" element={<WardsTab />} />
          <Route path="*" element={<RedirectToDefaultTab />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
)
