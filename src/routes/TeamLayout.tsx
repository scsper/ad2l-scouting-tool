import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { NavLink, Navigate, Outlet, useLocation, useParams, useSearchParams } from "react-router"
import { ContentArea } from "../components/ContentArea"
import { useChromeSlot } from "../components/StickyChrome"
import { useGetTeamsByLeagueQuery } from "../features/league-and-team-picker/teams-api"
import type { LeagueTeamEntry } from "../features/league-and-team-picker/teams-api"
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
    <OutOfScopeGate leagueId={leagueId} teamId={teamId}>
      {teamTabs(search, scope)}
    </OutOfScopeGate>
  )
}

/**
 * One screen for a team the caller may not see, instead of seven error boxes.
 *
 * A link pasted into a scrims thread outlives the division it was about, so a
 * scoped user will click one sooner or later. Without this, each of the seven
 * tabs fires its own request, gets its own 403, and renders its own red "please
 * try again" — which reads as an outage rather than a permission.
 *
 * The check costs nothing extra: `api/team` is already filtered server-side and
 * already fetched by the header, so a team id missing from that response is by
 * definition one this account cannot open. This is a convenience only. The
 * boundary is the 403 the API returns regardless of what renders here.
 */
const OutOfScopeGate = ({
  leagueId,
  teamId,
  children,
}: {
  leagueId: number
  teamId: number
  children: React.ReactNode
}) => {
  const { data: teams, isSuccess } = useGetTeamsByLeagueQuery({ leagueId })

  // Typed wider than the `Record` says on purpose: a league with no teams, or a
  // team the server filtered out, is a missing key rather than a present
  // `undefined`, and that is exactly the case being checked for here.
  const inLeague: Record<number, LeagueTeamEntry> | undefined = teams?.[leagueId]
  const team: LeagueTeamEntry | undefined = inLeague?.[teamId]

  if (isSuccess && !team) {
    return (
      <ContentArea>
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <p className="text-slate-300 text-lg font-medium">
            This team isn&apos;t in your division
          </p>
          <p className="text-slate-400 text-sm">
            Pick a team from the dropdown above to keep scouting.
          </p>
        </div>
      </ContentArea>
    )
  }

  return <>{children}</>
}

const teamTabs = (search: string, scope: TeamScope) => (
    <>
      <TeamTabs search={search} />

      <ContentArea>
        <Outlet context={scope} />
      </ContentArea>
    </>
)

/**
 * The seven tabs, which do not fit on a phone.
 *
 * At `px-6 py-3` the strip is around 780px wide, so on a 390px screen `Movement`
 * and `Tempo` were simply off the right edge with nothing to say they existed.
 * It scrolls now, with a fade at the edge to admit there is more and the active
 * tab pulled into view — which matters most for the case that has no other cue:
 * a shared link that opens straight onto `Tempo`.
 *
 * It renders into the chrome slot so it hides and returns with the header
 * rather than independently. See `StickyChrome` for why that is a portal.
 */
const TeamTabs = ({ search }: { search: string }) => {
  const slot = useChromeSlot()
  const { pathname } = useLocation()
  const activeRef = useRef<HTMLAnchorElement>(null)
  const activeTab = TABS.find(tab => pathname.endsWith(`/${tab.id}`))?.id

  useEffect(() => {
    // `block: "nearest"` so pulling a tab into view horizontally cannot also
    // scroll the page vertically out from under whatever you were reading.
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest" })
  }, [activeTab])

  const strip = (
    <div className="relative bg-slate-800/30 border-b border-slate-700">
      <div className="container mx-auto px-3 sm:px-4">
        <div className="flex gap-1 overflow-x-auto md:overflow-visible snap-x scroll-px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map(tab => (
            <NavLink
              key={tab.id}
              ref={tab.id === activeTab ? activeRef : null}
              to={`${tab.id}${search}`}
              className={({ isActive }) =>
                `px-3 py-2.5 text-sm sm:px-6 sm:py-3 sm:text-base font-medium transition-all relative shrink-0 snap-start whitespace-nowrap ${
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
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-slate-900/90 to-transparent md:hidden" />
    </div>
  )

  // Inline for the one render before the slot ref resolves. That position is
  // where the portal puts it anyway, so nothing moves.
  return slot ? createPortal(strip, slot) : strip
}
