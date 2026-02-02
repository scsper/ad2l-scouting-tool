import { useState } from "react";
import { CreatePlayerModal } from "./CreatePlayerModal";

type PlayersProps = {
  leagueId: number;
  teamId: number;
}

export const Players = ({ leagueId, teamId }: PlayersProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

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

      {/* Players List - Placeholder for now */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-12 text-center">
        <div className="text-slate-400 text-lg font-medium">No Players Yet</div>
        <div className="text-slate-500 text-sm mt-2">Click "Add Player" to create your first player</div>
      </div>

      {/* Create Player Modal */}
      <CreatePlayerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        leagueId={leagueId}
        teamId={teamId}
      />
    </div>
  );
};
