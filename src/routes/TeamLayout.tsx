import { NavLink, Navigate, Outlet, useParams, useSearchParams } from "react-router"
import { ContentArea } from "../components/ContentArea"
import { TABS, divisionSearch, type TeamScope } from "./routing"

/**
 * The tab bar, and the scope every tab below it renders against.
 *
 * Having a route boundary own the pair is the point of nesting them: a tab is
 * only ever mounted on a URL that names both ids, so none of them repeat the
 * `leagueId && teamId &&` guard the single-component version needed at each of
 * its seven render sites.
 */
export const TeamLayout = () => {
  const { leagueId: leagueIdParam, teamId: teamIdParam } = useParams()
  const [searchParams] = useSearchParams()

  const leagueId = Number(leagueIdParam)
  const teamId = Number(teamIdParam)

  if (!Number.isInteger(leagueId) || !Number.isInteger(teamId)) {
    return <Navigate to="/" replace />
  }

  const search = divisionSearch(searchParams.get("division") ?? undefined)
  const scope: TeamScope = { leagueId, teamId }

  return (
    <>
      <div className="bg-slate-800/30 border-b border-slate-700">
        <div className="container mx-auto px-4">
          <div className="flex gap-1">
            {TABS.map(tab => (
              <NavLink
                key={tab.id}
                to={`${tab.id}${search}`}
                className={({ isActive }) =>
                  `px-6 py-3 font-medium transition-all relative ${
                    isActive
                      ? "text-blue-400 bg-slate-800/50"
                      : "text-slate-400 hover:text-slate-300 hover:bg-slate-800/30"
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
        </div>
      </div>

      <ContentArea>
        <Outlet context={scope} />
      </ContentArea>
    </>
  )
}
