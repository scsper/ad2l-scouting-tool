import { useState } from "react"
import { Modal } from "../../components/Modal"
import { useCopyRosterMutation } from "./players-api"
import { useGetLeaguesQuery } from "../league-and-team-picker/league-api"

type CopyRosterModalProps = {
  isOpen: boolean
  onClose: () => void
  leagueId: number
  teamId: number
}

/**
 * Clones this team's roster from another league. Rosters mostly carry over —
 * Sharkhorse kept 3 of 5 between S46 and S47 — so a new season is "copy, then
 * swap the two who changed" rather than five fresh forms.
 *
 * Copying is deliberately explicit rather than an implicit fallback to the
 * previous league: an inherited roster you never asserted is how a starter ends
 * up mislabelled as a stand-in.
 */
export const CopyRosterModal = ({
  isOpen,
  onClose,
  leagueId,
  teamId,
}: CopyRosterModalProps) => {
  const [fromLeagueId, setFromLeagueId] = useState("")
  const [copyRoster, { isLoading, error }] = useCopyRosterMutation()
  const { data: leagues } = useGetLeaguesQuery()

  const sourceLeagues = (leagues ?? []).filter(league => league.id !== leagueId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fromLeagueId) return

    try {
      await copyRoster({
        from_league_id: parseInt(fromLeagueId, 10),
        league_id: leagueId,
        team_id: teamId,
      }).unwrap()

      setFromLeagueId("")
      onClose()
    } catch (err) {
      console.error("Failed to copy roster:", err)
    }
  }

  const handleClose = () => {
    setFromLeagueId("")
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Copy roster from…">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="copy-from-league"
            className="block text-sm font-medium text-slate-300 mb-2"
          >
            Copy from league *
          </label>
          <select
            id="copy-from-league"
            value={fromLeagueId}
            onChange={e => setFromLeagueId(e.target.value)}
            required
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          >
            <option value="">Select a league</option>
            {sourceLeagues.map(league => (
              <option key={league.id} value={league.id}>
                {league.name}
              </option>
            ))}
          </select>
          <p className="text-slate-500 text-xs mt-2">
            Copies this team's roster from that league, carrying role and both
            ranks. Players already on this roster are left alone.
          </p>
        </div>

        {error && (
          <div className="text-red-400 text-sm">
            Failed to copy roster. Please try again.
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-slate-400 hover:text-slate-300 transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Copying..." : "Copy roster"}
          </button>
        </div>
      </form>
    </Modal>
  )
}
