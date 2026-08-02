import { Link, NavLink, Outlet, useParams, useSearchParams } from "react-router"
import { ContentArea } from "../components/ContentArea"
import { useLeagueDivisions } from "../features/league-and-team-picker/teams-api"
import { STATS_TABS, divisionSearch, type StatsScope } from "./routing"

/**
 * Everything a division can be asked about, and the boards that answer it.
 *
 * The tab bar sits inside the content area rather than under the header, unlike
 * the team one: this screen is reached from the picker and returned from, so
 * its "← Back" belongs above the tabs it governs.
 */
export const StatsRoute = () => {
  const { leagueId: leagueIdParam } = useParams()
  const [searchParams] = useSearchParams()

  // No id check here: this only mounts under `LeagueLayout`, which has already
  // sent a non-numeric league back to the root.
  const leagueId = Number(leagueIdParam)
  const divisions = useLeagueDivisions(leagueId)

  const division = searchParams.get("division") ?? undefined
  const hasDivisions = divisions.length > 0
  const search = divisionSearch(division)
  const scope: StatsScope = { leagueId, division, hasDivisions }

  return (
    <ContentArea>
      <div className="flex items-center gap-4 mb-6">
        {/* A link to the picker rather than `navigate(-1)`: arriving here from a
            shared URL leaves no history to go back to, and stepping back from
            the first entry walks the reader off the site entirely. */}
        <Link
          to={`/leagues/${String(leagueId)}${search}`}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          ← Back
        </Link>
        <h2 className="text-lg font-semibold text-slate-200">
          {hasDivisions ? "Division" : "League"} Stats
        </h2>
      </div>

      <div className="flex gap-1 border-b border-slate-700 mb-6">
        {/* Only the division rides along. A position and sort chosen on the
            player board describe that board, and carrying them onto the heroes
            one would leave them lying in wait in the URL. */}
        {STATS_TABS.map(tab => (
          <NavLink
            key={tab.id}
            to={`${tab.id}${search}`}
            className={({ isActive }) =>
              `px-5 py-2.5 text-sm font-medium transition-all relative ${
                isActive
                  ? "text-blue-400"
                  : "text-slate-400 hover:text-slate-300"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {tab.label}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400"></div>
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>

      <Outlet context={scope} />
    </ContentArea>
  )
}
