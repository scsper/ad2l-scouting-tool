import { useState } from "react"
import { Modal } from "../../components/Modal"
import {
  useAddRosterMemberMutation,
  useLazyGetPlayerByIdQuery,
} from "./players-api"
import { useGetTeamsByLeagueQuery } from "../league-and-team-picker/teams-api"
import { useGetLeaguesQuery } from "../league-and-team-picker/league-api"

type CreatePlayerModalProps = {
  isOpen: boolean
  onClose: () => void
  leagueId: number
  teamId: number
}

const ROLE_OPTIONS = [
  { value: "Carry", label: "Carry" },
  { value: "Mid", label: "Mid" },
  { value: "Offlane", label: "Offlane" },
  { value: "Soft Support", label: "Soft Support" },
  { value: "Hard Support", label: "Hard Support" },
]

export const CreatePlayerModal = ({
  isOpen,
  onClose,
  leagueId,
  teamId,
}: CreatePlayerModalProps) => {
  const [playerId, setPlayerId] = useState("")
  const [name, setName] = useState("")
  const [rank, setRank] = useState("")
  const [originalRank, setOriginalRank] = useState("")
  const [role, setRole] = useState("")
  const [knownPlayer, setKnownPlayer] = useState<string | null>(null)

  const [addRosterMember, { isLoading, error }] = useAddRosterMemberMutation()
  const [lookUpPlayer] = useLazyGetPlayerByIdQuery()
  const { data: teamsData } = useGetTeamsByLeagueQuery({ leagueId })
  const { data: leagues } = useGetLeaguesQuery()

  const teamName = teamsData?.[leagueId]?.[teamId]?.name ?? ""
  const leagueName = leagues?.find(league => league.id === leagueId)?.name ?? ""

  const resetForm = () => {
    setPlayerId("")
    setName("")
    setRank("")
    setOriginalRank("")
    setRole("")
    setKnownPlayer(null)
  }

  /**
   * People recur — someone dropped from one season's roster shows up as a
   * stand-in or on another team later. Recognising an existing steam id keeps
   * them as one person (and keeps their pub match history) instead of prompting
   * for a name that's already on file.
   */
  const handlePlayerIdBlur = async () => {
    const parsed = parseInt(playerId, 10)
    if (Number.isNaN(parsed)) return

    try {
      const player = await lookUpPlayer({ playerId: parsed }).unwrap()
      setName(player.name)
      setKnownPlayer(player.name)
    } catch {
      // A 404 just means they're new. Nothing to prefill.
      setKnownPlayer(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!playerId || !name || !role) {
      return
    }

    try {
      await addRosterMember({
        league_id: leagueId,
        team_id: teamId,
        player_id: parseInt(playerId, 10),
        name,
        role,
        rank: rank || null,
        original_rank: originalRank || null,
      }).unwrap()

      resetForm()
      onClose()
    } catch (err) {
      // Error is handled by RTK Query
      console.error("Failed to add roster member:", err)
    }
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add to roster">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Player ID */}
        <div>
          <label
            htmlFor="player-id"
            className="block text-sm font-medium text-slate-300 mb-2"
          >
            Player ID *
          </label>
          <input
            id="player-id"
            type="number"
            value={playerId}
            onChange={e => setPlayerId(e.target.value)}
            onBlur={handlePlayerIdBlur}
            required
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            placeholder="Enter player ID (e.g., Steam ID)"
          />
          {knownPlayer && (
            <p className="text-slate-500 text-xs mt-2">
              Known player: {knownPlayer}. Their pub match history is kept.
            </p>
          )}
        </div>

        {/* Player Name */}
        <div>
          <label
            htmlFor="player-name"
            className="block text-sm font-medium text-slate-300 mb-2"
          >
            Player Name *
          </label>
          <input
            id="player-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            placeholder="Enter player name"
          />
        </div>

        {/* Role */}
        <div>
          <label
            htmlFor="player-role"
            className="block text-sm font-medium text-slate-300 mb-2"
          >
            Role *
          </label>
          <select
            id="player-role"
            value={role}
            onChange={e => setRole(e.target.value)}
            required
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          >
            <option value="">Select a role</option>
            {ROLE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Ranks — optional: you often add someone before looking them up. */}
        <div>
          <label
            htmlFor="player-rank"
            className="block text-sm font-medium text-slate-300 mb-2"
          >
            Rank
          </label>
          <input
            id="player-rank"
            type="text"
            value={rank}
            onChange={e => setRank(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            placeholder="Rank this season (e.g., Archon V)"
          />
        </div>

        <div>
          <label
            htmlFor="player-original-rank"
            className="block text-sm font-medium text-slate-300 mb-2"
          >
            Original Rank
          </label>
          <input
            id="player-original-rank"
            type="text"
            value={originalRank}
            onChange={e => setOriginalRank(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            placeholder="Rank they registered at"
          />
          <p className="text-slate-500 text-xs mt-2">
            The rank they signed up at — what stand-in validity is judged
            against.
          </p>
        </div>

        {/* Team and league - display only. The league is the write target, so
            it needs to be visible: this adds them to one season's roster. */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Roster
          </label>
          <div className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-400">
            {teamName || "Loading..."}
            {leagueName && ` — ${leagueName}`}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="text-red-400 text-sm">
            Failed to add player to roster. Please try again.
          </div>
        )}

        {/* Buttons */}
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
            {isLoading ? "Adding..." : "Add to roster"}
          </button>
        </div>
      </form>
    </Modal>
  )
}
