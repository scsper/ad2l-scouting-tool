import { Navigate, Route, Routes, useLocation, useParams } from "react-router"
import { StatsRoute } from "./routes/StatsRoute"
import { DivisionPlayersTab, HeroesTab } from "./routes/stats-tab-routes"
import { LeagueLayout } from "./routes/LeagueLayout"
import { LeaguePicker } from "./routes/LeaguePicker"
import { RootLayout } from "./routes/RootLayout"
import { TeamLayout } from "./routes/TeamLayout"
import {
  LanesTab,
  MovementTab,
  PlayersTab,
  PubStatsTab,
  TeamTab,
  TempoTab,
  WardsTab,
} from "./routes/tab-routes"
import {
  DEFAULT_DIVISION,
  DEFAULT_LEAGUE_ID,
  divisionSearch,
} from "./routes/routing"
import { useGetMeQuery } from "./features/access/access-api"

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

/**
 * Where `/` lands, which is no longer the same answer for everybody.
 *
 * `DEFAULT_LEAGUE_ID` is Season 47, and a user scoped to a later season holds
 * no grant for it — so the old unconditional redirect would have dropped them
 * on a league they cannot read every single time they signed in, with the
 * league dropdown as the only way out. The default is kept when it is readable,
 * because for an admin it is still the right place to start.
 */
const RedirectToLandingLeague = () => {
  const { data: me } = useGetMeQuery()

  // `.at` rather than `[0]`, which types as a `Grant` and would make the
  // fallback below look like dead code. A non-admin with no grants never gets
  // this far — `RootLayout` shows them the not-set-up screen instead — but the
  // type has no way to know that.
  const grant =
    me && !me.isAdmin && !me.grants.some(g => g.leagueId === DEFAULT_LEAGUE_ID)
      ? me.grants.at(0)
      : undefined

  // A scoped user lands in the division of their grant; everyone else lands in
  // the default one. `RootLayout` has already established that this account has
  // a grant, so an undefined grant here for a non-admin means only that
  // `api/me` failed — in which case the default is as good a guess as any and
  // the screen reports its own error.
  return (
    <Navigate
      to={`/leagues/${String(grant?.leagueId ?? DEFAULT_LEAGUE_ID)}${divisionSearch(grant ? grant.division : DEFAULT_DIVISION)}`}
      replace
    />
  )
}

export const App = () => (
  <Routes>
    <Route element={<RootLayout />}>
      <Route index element={<RedirectToLandingLeague />} />

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
          <Route path="movement" element={<MovementTab />} />
          <Route path="tempo" element={<TempoTab />} />
          <Route path="*" element={<RedirectToDefaultTab />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
)
