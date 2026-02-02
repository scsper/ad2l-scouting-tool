import { useState } from "react";
import { Modal } from "../../components/Modal";
import { useCreatePlayerMutation } from "./players-api";
import { useGetTeamsByLeagueQuery } from "../league-and-team-picker/teams-api";

type CreatePlayerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  leagueId: number;
  teamId: number;
}

const ROLE_OPTIONS = [
  { value: "Carry", label: "Carry" },
  { value: "Mid", label: "Mid" },
  { value: "Offlane", label: "Offlane" },
  { value: "Soft Support", label: "Soft Support" },
  { value: "Hard Support", label: "Hard Support" },
];

export const CreatePlayerModal = ({ isOpen, onClose, leagueId, teamId }: CreatePlayerModalProps) => {
  const [playerId, setPlayerId] = useState("");
  const [name, setName] = useState("");
  const [rank, setRank] = useState("");
  const [role, setRole] = useState("");

  const [createPlayer, { isLoading, error }] = useCreatePlayerMutation();
  const { data: teamsData } = useGetTeamsByLeagueQuery({ leagueId });

  const teamName = teamsData?.[leagueId]?.[teamId] || "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!playerId || !name || !rank || !role) {
      return;
    }

    try {
      await createPlayer({
        id: parseInt(playerId, 10),
        name,
        rank,
        role,
        team_id: teamId,
      }).unwrap();
      
      // Reset form and close modal on success
      setPlayerId("");
      setName("");
      setRank("");
      setRole("");
      onClose();
    } catch (err) {
      // Error is handled by RTK Query
      console.error("Failed to create player:", err);
    }
  };

  const handleClose = () => {
    // Reset form on close
    setPlayerId("");
    setName("");
    setRank("");
    setRole("");
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create Player">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Player ID */}
        <div>
          <label htmlFor="player-id" className="block text-sm font-medium text-slate-300 mb-2">
            Player ID *
          </label>
          <input
            id="player-id"
            type="number"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            required
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            placeholder="Enter player ID (e.g., Steam ID)"
          />
        </div>

        {/* Player Name */}
        <div>
          <label htmlFor="player-name" className="block text-sm font-medium text-slate-300 mb-2">
            Player Name *
          </label>
          <input
            id="player-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            placeholder="Enter player name"
          />
        </div>

        {/* Rank */}
        <div>
          <label htmlFor="player-rank" className="block text-sm font-medium text-slate-300 mb-2">
            Rank *
          </label>
          <input
            id="player-rank"
            type="text"
            value={rank}
            onChange={(e) => setRank(e.target.value)}
            required
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            placeholder="Enter rank (e.g., Immortal, 5000 MMR)"
          />
        </div>

        {/* Role */}
        <div>
          <label htmlFor="player-role" className="block text-sm font-medium text-slate-300 mb-2">
            Role *
          </label>
          <select
            id="player-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          >
            <option value="">Select a role</option>
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Team - Display only */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Team
          </label>
          <div className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-400">
            {teamName || "Loading..."}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="text-red-400 text-sm">
            Failed to create player. Please try again.
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
            {isLoading ? "Creating..." : "Create Player"}
          </button>
        </div>
      </form>
    </Modal>
  );
};
