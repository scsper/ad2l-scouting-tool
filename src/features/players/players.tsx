import { useState } from "react";
import { CreatePlayerModal } from "./CreatePlayerModal";
import { useGetPlayersByTeamQuery, useDeletePlayerMutation } from "./players-api";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import type { PlayerRow } from "../../../types/db";

type PlayersProps = {
  leagueId: number;
  teamId: number;
}

export const Players = ({ leagueId, teamId }: PlayersProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [playerToDelete, setPlayerToDelete] = useState<PlayerRow | null>(null);
  const { data: players = [], isLoading, error } = useGetPlayersByTeamQuery({ teamId });
  const [deletePlayer, { isLoading: isDeleting }] = useDeletePlayerMutation();

  const handleDeleteClick = (player: PlayerRow) => {
    setPlayerToDelete(player);
  };

  const handleConfirmDelete = async () => {
    if (!playerToDelete) return;

    try {
      await deletePlayer({ playerId: playerToDelete.id }).unwrap();
      setPlayerToDelete(null);
    } catch (err) {
      console.error("Failed to delete player:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Add Player button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-200">Players</h2>
          <p className="text-slate-400 text-sm mt-1">Manage team players</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Player
        </button>
      </div>

      {/* Players List */}
      {isLoading ? (
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-12 text-center">
          <div className="text-slate-400 text-lg font-medium">Loading...</div>
        </div>
      ) : error ? (
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-12 text-center">
          <div className="text-red-400 text-lg font-medium">Error loading players</div>
        </div>
      ) : players.length === 0 ? (
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-12 text-center">
          <div className="text-slate-400 text-lg font-medium">No Players Yet</div>
          <div className="text-slate-500 text-sm mt-2">Click "Add Player" to create your first player</div>
        </div>
      ) : (
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-900/50 border-b border-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Rank
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {players.map((player) => (
                <tr key={player.id} className="hover:bg-slate-900/30 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                    {player.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">
                    {player.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                    {player.role}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                    {player.rank}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                    <button
                      onClick={() => handleDeleteClick(player)}
                      className="text-red-400 hover:text-red-300 transition-colors"
                      title="Delete player"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Player Modal */}
      <CreatePlayerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        leagueId={leagueId}
        teamId={teamId}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!playerToDelete}
        onClose={() => setPlayerToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Player"
        message={`Are you sure you want to delete ${playerToDelete?.name}? This action cannot be undone.`}
        confirmText="Delete"
        isLoading={isDeleting}
      />
    </div>
  );
};
