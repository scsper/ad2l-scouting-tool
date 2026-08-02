import { Navigate, Route, Routes, useLocation, useParams } from "react-router"
import { AggregateRoute } from "./routes/AggregateRoute"
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

export const App = () => (
  <Routes>
    <Route element={<RootLayout />}>
      <Route
        index
        element={<Navigate to={`/leagues/${String(DEFAULT_LEAGUE_ID)}`} replace />}
      />

      <Route path="leagues/:leagueId" element={<LeagueLayout />}>
        <Route index element={<LeaguePicker />} />
        <Route path="aggregate" element={<AggregateRoute />} />

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
