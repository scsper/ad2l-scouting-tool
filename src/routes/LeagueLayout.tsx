import { Navigate, Outlet, useMatch, useNavigate, useParams, useSearchParams } from "react-router"
import { LeagueAndTeamHeader } from "../features/league-and-team-picker/league-and-team-header"
import { StickyChrome } from "../components/StickyChrome"
import { divisionSearch } from "./routing"

/**
 * Everything below a league: the picker header, plus whichever of the league's
 * screens the URL names.
 *
 * The header lives here rather than in the shell because it needs the team the
 * URL is pointing at, and that id belongs to a route two levels down. Reading
 * it back out with `useMatch` keeps the header a single instance that survives
 * navigation between tabs, instead of one per screen that remounts on a click.
 */
export const LeagueLayout = () => {
  const { leagueId: leagueIdParam } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const teamMatch = useMatch("/leagues/:leagueId/teams/:teamId/*")

  const leagueId = Number(leagueIdParam)

  // A non-numeric league id can't address anything, and the check costs no
  // data — unlike "does this league exist", which would gate every render on a
  // query to answer. See the URL validation note in the router.
  if (!Number.isInteger(leagueId)) {
    return <Navigate to="/" replace />
  }

  const division = searchParams.get("division") ?? undefined
  const teamId = teamMatch ? Number(teamMatch.params.teamId) : undefined
  // Keep whichever tab is open when the team changes underneath it.
  const tab = teamMatch?.params["*"] ?? ""

  const teamPath = (nextLeagueId: number, nextTeamId: number, search: string) =>
    `/leagues/${String(nextLeagueId)}/teams/${String(nextTeamId)}/${tab || "team"}${search}`

  return (
    <>
      <StickyChrome>
      <LeagueAndTeamHeader
        leagueId={leagueId}
        teamId={teamId}
        division={division}
        onSelectLeague={(nextLeagueId, keepTeamId) => {
          // Divisions are per-season, so the old league's pick means nothing
          // here even when the name carries over — it is dropped rather than
          // carried, which is why this builds the URL without `division`.
          void navigate(
            keepTeamId === undefined
              ? `/leagues/${String(nextLeagueId)}`
              : teamPath(nextLeagueId, keepTeamId, ""),
          )
        }}
        onSelectTeam={nextTeamId => {
          void navigate(teamPath(leagueId, nextTeamId, divisionSearch(division)))
        }}
        onSelectDivision={nextDivision => {
          // Replace, not push: picking a division adjusts what a screen shows
          // rather than moving you to another one, and back should still take
          // you to the screen you came from.
          setSearchParams(
            prev => {
              const next = new URLSearchParams(prev)
              if (nextDivision) {
                next.set("division", nextDivision)
              } else {
                next.delete("division")
              }
              return next
            },
            { replace: true },
          )
        }}
      />
      </StickyChrome>

      <Outlet />
    </>
  )
}
