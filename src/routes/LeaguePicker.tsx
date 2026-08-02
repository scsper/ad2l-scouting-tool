import { useState } from "react"
import { Link, useParams, useSearchParams } from "react-router"
import { ContentArea } from "../components/ContentArea"
import { AddTeamModal } from "../features/league-and-team-picker/AddTeamModal"
import { useLeagueDivisions } from "../features/league-and-team-picker/teams-api"
import { ParseMatchesModal } from "../features/parse-matches/ParseMatchesModal"
import { divisionSearch } from "./routing"

/**
 * What a league looks like before you have picked a team.
 *
 * The two modals live here rather than in the shell because this is the only
 * screen that opens them, and neither is addressable: a link to an empty form
 * is not something anyone shares.
 */
export const LeaguePicker = () => {
  const { leagueId: leagueIdParam } = useParams()
  const [searchParams] = useSearchParams()
  const [isParseModalOpen, setIsParseModalOpen] = useState(false)
  const [isAddTeamModalOpen, setIsAddTeamModalOpen] = useState(false)

  const leagueId = Number(leagueIdParam)
  const divisions = useLeagueDivisions(leagueId)
  const statsLabel = divisions.length > 0 ? "Division" : "League"
  const search = divisionSearch(searchParams.get("division") ?? undefined)

  return (
    <ContentArea>
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <span className="text-slate-400 text-lg">Select a team to continue</span>
        <div className="flex gap-3">
          <Link
            to={`/leagues/${String(leagueId)}/stats${search}`}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors border border-slate-600"
          >
            {statsLabel} stats
          </Link>
          <button
            onClick={() => {
              setIsParseModalOpen(true)
            }}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors border border-slate-600"
          >
            Parse matches
          </button>
          <button
            onClick={() => {
              setIsAddTeamModalOpen(true)
            }}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors border border-slate-600"
          >
            Add team
          </button>
        </div>
      </div>

      <ParseMatchesModal
        isOpen={isParseModalOpen}
        onClose={() => {
          setIsParseModalOpen(false)
        }}
      />

      <AddTeamModal
        isOpen={isAddTeamModalOpen}
        onClose={() => {
          setIsAddTeamModalOpen(false)
        }}
        leagueId={leagueId}
      />
    </ContentArea>
  )
}
