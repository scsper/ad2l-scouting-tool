import { useState } from "react"
import { useAuth } from "@clerk/react"
import { Modal } from "../../components/Modal"
import { DIVISIONS } from "../../../shared/divisions"
import { useAddTeamToLeagueMutation, useGetTeamsByLeagueQuery } from "./teams-api"
import { useGetLeaguesQuery } from "./league-api"

type AddTeamModalProps = {
  isOpen: boolean
  onClose: () => void
  leagueId: number
}

/** The human-readable reason out of a FetchBaseQueryError. */
function errorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null) return "Unexpected error"

  const data = (error as { data?: unknown }).data
  if (typeof data === "object" && data !== null && "error" in data) {
    const message = (data as { error: unknown }).error
    if (typeof message === "string") return message
  }

  const status = (error as { status?: unknown }).status
  if (status === "FETCH_ERROR") return "Network error"
  if (typeof status === "number") return `Request failed (${String(status)})`
  return "Request failed"
}

/**
 * Register a team in this league under a division, or change the division of one
 * already registered.
 *
 * Teams are added lazily — one scrim opponent at a time, whenever you need to
 * scout outside your own bracket — so this runs far too often to live in a
 * script you have to check out the repo to edit. It doubles as the only way to
 * correct a division, which is why the route upserts.
 */
export const AddTeamModal = ({ isOpen, onClose, leagueId }: AddTeamModalProps) => {
  const [teamId, setTeamId] = useState("")
  const [name, setName] = useState("")
  const [division, setDivision] = useState("")

  const { getToken } = useAuth()
  const [addTeamToLeague, { isLoading, error }] = useAddTeamToLeagueMutation()
  const { data: teamsData } = useGetTeamsByLeagueQuery({ leagueId })
  const { data: leagues } = useGetLeaguesQuery()

  const leagueName = leagues?.find(league => league.id === leagueId)?.name ?? ""

  // A team already in this league is a division edit, not a new registration.
  // Say so, and stop asking for a name we already have.
  const parsedTeamId = parseInt(teamId, 10)
  const existing = Number.isNaN(parsedTeamId)
    ? undefined
    : teamsData?.[leagueId]?.[parsedTeamId]

  const resetForm = () => {
    setTeamId("")
    setName("")
    setDivision("")
  }

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault()

    if (Number.isNaN(parsedTeamId) || !division) return
    if (!existing && !name) return

    try {
      await addTeamToLeague({
        league_id: leagueId,
        team_id: parsedTeamId,
        division,
        name: existing ? undefined : name,
        token: await getToken(),
      }).unwrap()

      resetForm()
      onClose()
    } catch (err) {
      // Error is rendered from the mutation's own state.
      console.error("Failed to add team to league:", err)
    }
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add team to league">
      <form onSubmit={e => { void handleSubmit(e); }} className="space-y-4">
        <p className="text-slate-400 text-sm">
          Adding to <span className="text-slate-200">{leagueName}</span>
        </p>

        <div>
          <label htmlFor="team-id" className="block text-sm font-medium text-slate-300 mb-2">
            Team ID *
          </label>
          <input
            id="team-id"
            type="number"
            value={teamId}
            onChange={e => { setTeamId(e.target.value); }}
            required
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            placeholder="Dota team ID (e.g., 9403219)"
          />
          {existing && (
            <p className="text-slate-500 text-xs mt-2">
              {existing.name} is already in this league
              {existing.division ? ` under ${existing.division}` : " with no division"}. Submitting
              moves them.
            </p>
          )}
        </div>

        {!existing && (
          <div>
            <label htmlFor="team-name" className="block text-sm font-medium text-slate-300 mb-2">
              Team Name *
            </label>
            <input
              id="team-name"
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); }}
              required
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              placeholder="Team name"
            />
            <p className="text-slate-500 text-xs mt-2">
              OpenDota only lists pro teams, so AD2L names have to be typed in.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="team-division" className="block text-sm font-medium text-slate-300 mb-2">
            Division *
          </label>
          <select
            id="team-division"
            value={division}
            onChange={e => { setDivision(e.target.value); }}
            required
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          >
            <option value="">-- Select a division --</option>
            {DIVISIONS.map(divisionName => (
              <option key={divisionName} value={divisionName}>
                {divisionName}
              </option>
            ))}
          </select>
        </div>

        {error != null && <div className="text-red-400 text-sm">{errorMessage(error)}</div>}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-md text-slate-300 hover:text-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {isLoading ? "Adding..." : "Add team"}
          </button>
        </div>
      </form>
    </Modal>
  )
}
