import { Link, useParams, useSearchParams } from "react-router"
import { ContentArea } from "../components/ContentArea"
import { LeagueAggregate } from "../features/league-aggregate/LeagueAggregate"
import { useLeagueDivisions } from "../features/league-and-team-picker/teams-api"
import { divisionSearch } from "./routing"

export const AggregateRoute = () => {
  const { leagueId: leagueIdParam } = useParams()
  const [searchParams] = useSearchParams()

  const leagueId = Number(leagueIdParam)
  const division = searchParams.get("division") ?? undefined
  const divisions = useLeagueDivisions(leagueId)

  return (
    <ContentArea>
      <div className="flex items-center gap-4 mb-6">
        {/* A link to the picker rather than `navigate(-1)`: arriving here from a
            shared URL leaves no history to go back to, and stepping back from
            the first entry walks the reader off the site entirely. */}
        <Link
          to={`/leagues/${String(leagueId)}${divisionSearch(division)}`}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          ← Back
        </Link>
        <h2 className="text-lg font-semibold text-slate-200">
          {divisions.length > 0 ? "Division" : "League"} Aggregate Data
        </h2>
      </div>
      <LeagueAggregate
        leagueId={leagueId}
        division={division}
        hasDivisions={divisions.length > 0}
      />
    </ContentArea>
  )
}
