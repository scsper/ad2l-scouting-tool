import { useState, useEffect } from "react"
import { CreatePlayerModal } from "./CreatePlayerModal"
import {
  useGetPlayersByTeamQuery,
  useDeletePlayerMutation,
  useFetchPlayerPubMatchesMutation,
} from "./players-api"
import { ConfirmDialog } from "../../components/ConfirmDialog"
import { PlayerPubMatchStats } from "./PlayerPubMatchStats"
import { useGetMatchesQuery } from "../matches/matches-api"
import type { PlayerRow } from "../../../types/db"

type PlayersProps = {
  leagueId: number
  teamId: number
}

export const Players = ({ leagueId, teamId }: PlayersProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [playerToDelete, setPlayerToDelete] = useState<PlayerRow | null>(null)
  const {
    data: players = [],
    isLoading,
    error,
  } = useGetPlayersByTeamQuery({ teamId })
  const [collapsedPlayerIds, setCollapsedPlayerIds] = useState<Set<number>>(
    new Set(players.map(p => p.id)),
  )
  const { data: matchesData } = useGetMatchesQuery({ leagueId, teamId })
  const [deletePlayer, { isLoading: isDeleting }] = useDeletePlayerMutation()
  const [fetchPlayerPubMatches] = useFetchPlayerPubMatchesMutation()
  const [fetchingPlayerIds, setFetchingPlayerIds] = useState<Set<number>>(
    new Set(),
  )

  // Initialize collapsed state with all player IDs when players load
  // Only add new players to collapsed set, don't reset existing state
  useEffect(() => {
    if (players.length > 0) {
      setCollapsedPlayerIds(prev => {
        const newSet = new Set(prev)
        players.forEach(p => {
          if (!prev.has(p.id) && prev.size > 0) {
            // Only auto-collapse newly added players
            newSet.add(p.id)
          } else if (prev.size === 0) {
            // Initial load - collapse all
            newSet.add(p.id)
          }
        })
        return newSet
      })
    }
  }, [players])

  const togglePlayerExpanded = (playerId: number) => {
    setCollapsedPlayerIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(playerId)) {
        newSet.delete(playerId)
      } else {
        newSet.add(playerId)
      }
      return newSet
    })
  }

  const isPlayerExpanded = (playerId: number) =>
    !collapsedPlayerIds.has(playerId)

  // Sort players by role order: Carry, Mid, Offlane, Soft Support, Hard Support
  const roleOrder: Record<string, number> = {
    Carry: 1,
    Mid: 2,
    Offlane: 3,
    "Soft Support": 4,
    "Hard Support": 5,
  }

  const sortedPlayers = [...players].sort((a, b) => {
    const orderA = roleOrder[a.role] ?? 999
    const orderB = roleOrder[b.role] ?? 999
    return orderA - orderB
  })

  const handleDeleteClick = (player: PlayerRow) => {
    setPlayerToDelete(player)
  }

  const handleConfirmDelete = async () => {
    if (!playerToDelete) return

    try {
      await deletePlayer({ playerId: playerToDelete.id }).unwrap()
      setPlayerToDelete(null)
    } catch (err) {
      console.error("Failed to delete player:", err)
    }
  }

  // Map player roles to Stratz position IDs
  function roleToPositions(role: string): string[] {
    switch (role) {
      case "Carry":
        return ["POSITION_1"]
      case "Mid":
        return ["POSITION_2"]
      case "Offlane":
        return ["POSITION_3"]
      case "Soft Support":
      case "Hard Support":
        return ["POSITION_4", "POSITION_5"]
      default:
        return []
    }
  }

  const handleRefreshPlayerData = async (player: PlayerRow) => {
    setFetchingPlayerIds(prev => new Set(prev).add(player.id))
    try {
      const positions = roleToPositions(player.role)
      await fetchPlayerPubMatches({
        playerId: player.id,
        positions: positions.length > 0 ? positions : undefined,
      }).unwrap()
    } catch (err) {
      console.error("Failed to fetch player pub matches:", err)
    } finally {
      setFetchingPlayerIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(player.id)
        return newSet
      })
    }
  }

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
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
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
          <div className="text-red-400 text-lg font-medium">
            Error loading players
          </div>
        </div>
      ) : players.length === 0 ? (
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-12 text-center">
          <div className="text-slate-400 text-lg font-medium">
            No Players Yet
          </div>
          <div className="text-slate-500 text-sm mt-2">
            Click "Add Player" to create your first player
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {sortedPlayers.map(player => (
            <div key={player.id} className="space-y-0">
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg hover:bg-slate-900/30 transition-colors">
                <div className="p-6 flex items-center justify-between">
                  <div
                    className="flex-1 grid grid-cols-3 gap-6 cursor-pointer"
                    onClick={() => togglePlayerExpanded(player.id)}
                  >
                    <div>
                      <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
                        Name
                      </div>
                      <div className="text-lg font-medium text-slate-200">
                        {player.name}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
                        Role
                      </div>
                      <div className="text-lg text-slate-300">
                        {player.role}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
                        Rank
                      </div>
                      <div className="text-lg text-slate-300">
                        {player.rank}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-6">
                    <button
                      onClick={() => handleRefreshPlayerData(player)}
                      disabled={fetchingPlayerIds.has(player.id)}
                      className="text-blue-400 hover:text-blue-300 disabled:text-blue-400/50 disabled:cursor-not-allowed transition-colors"
                      title="Refresh player data"
                    >
                      <svg
                        className={`w-5 h-5 ${
                          fetchingPlayerIds.has(player.id) ? "animate-spin" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => togglePlayerExpanded(player.id)}
                      className="text-blue-400 hover:text-blue-300 transition-colors"
                      title={
                        isPlayerExpanded(player.id)
                          ? "Hide hero stats"
                          : "Show hero stats"
                      }
                    >
                      <svg
                        className={`w-5 h-5 transition-transform ${
                          isPlayerExpanded(player.id) ? "rotate-180" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteClick(player)}
                      className="text-red-400 hover:text-red-300 transition-colors"
                      title="Delete player"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              {isPlayerExpanded(player.id) && (
                <div className="mt-0">
                  <PlayerPubMatchStats
                    playerId={player.id}
                    playerRole={player.role}
                    matchesData={matchesData}
                  />
                </div>
              )}
            </div>
          ))}
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
  )
}
