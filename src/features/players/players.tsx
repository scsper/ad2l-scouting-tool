import { useState, useEffect } from "react"
import { CreatePlayerModal } from "./CreatePlayerModal"
import {
  useGetRosterQuery,
  useRemoveRosterMemberMutation,
  useFetchPlayerPubMatchesMutation,
} from "./players-api"
import { ConfirmDialog } from "../../components/ConfirmDialog"
import { CopyRosterModal } from "./CopyRosterModal"
import { PlayerPubMatchStats } from "./PlayerPubMatchStats"
import { useGetMatchesQuery } from "../matches/matches-api"
import { useGetLeaguesQuery } from "../league-and-team-picker/league-api"
import type { RosterEntry } from "../../../types/db"
import { roleToPositions } from "../../../shared/roles"

type PlayersProps = {
  leagueId: number
  teamId: number
}

export const Players = ({ leagueId, teamId }: PlayersProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<RosterEntry | null>(null)
  const {
    data: roster = [],
    isLoading,
    error,
  } = useGetRosterQuery({ leagueId, teamId })
  const [collapsedPlayerIds, setCollapsedPlayerIds] = useState<Set<number>>(
    new Set(roster.map(m => m.player_id)),
  )
  const { data: matchesData } = useGetMatchesQuery({ leagueId, teamId })
  const { data: leagues } = useGetLeaguesQuery()
  const [removeRosterMember, { isLoading: isRemoving }] =
    useRemoveRosterMemberMutation()
  const [fetchPlayerPubMatches] = useFetchPlayerPubMatchesMutation()
  const [fetchingPlayerIds, setFetchingPlayerIds] = useState<Set<number>>(
    new Set(),
  )

  const leagueName =
    leagues?.find(league => league.id === leagueId)?.name ?? "this league"

  // Initialize collapsed state with all player IDs when the roster loads
  // Only add new players to collapsed set, don't reset existing state
  useEffect(() => {
    if (roster.length > 0) {
      setCollapsedPlayerIds(prev => {
        const newSet = new Set(prev)
        roster.forEach(m => {
          if (!prev.has(m.player_id) && prev.size > 0) {
            // Only auto-collapse newly added players
            newSet.add(m.player_id)
          } else if (prev.size === 0) {
            // Initial load - collapse all
            newSet.add(m.player_id)
          }
        })
        return newSet
      })
    }
  }, [roster])

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

  const byRole = (a: RosterEntry, b: RosterEntry) =>
    (roleOrder[a.role] ?? 999) - (roleOrder[b.role] ?? 999)

  // Kept as two lists rather than one sorted list with a badge. The role sort is
  // what makes the top block readable as "this is the team" without counting; a
  // stand-in Carry filed under the real Carry destroys that, and a season's
  // worth of subs turns five rows into eight.
  const members = roster.filter(member => !member.is_stand_in).sort(byRole)
  const standIns = roster.filter(member => member.is_stand_in).sort(byRole)

  const handleRemoveClick = (member: RosterEntry) => {
    setMemberToRemove(member)
  }

  const handleConfirmRemove = async () => {
    if (!memberToRemove) return

    try {
      await removeRosterMember({
        leagueId,
        teamId,
        playerId: memberToRemove.player_id,
      }).unwrap()
      setMemberToRemove(null)
    } catch (err) {
      console.error("Failed to remove roster member:", err)
    }
  }

  const handleRefreshPlayerData = async (member: RosterEntry) => {
    setFetchingPlayerIds(prev => new Set(prev).add(member.player_id))
    try {
      const positions = roleToPositions(member.role)
      await fetchPlayerPubMatches({
        playerId: member.player_id,
        positions: positions.length > 0 ? positions : undefined,
      }).unwrap()
    } catch (err) {
      console.error("Failed to fetch player pub matches:", err)
    } finally {
      setFetchingPlayerIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(member.player_id)
        return newSet
      })
    }
  }

  const renderRosterCards = (entries: RosterEntry[]) => (
    <div className="grid gap-4">
      {entries.map(member => (
        <div key={member.player_id} className="space-y-0">
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg hover:bg-slate-900/30 transition-colors">
            <div className="p-6 flex items-center justify-between">
              <div
                className="flex-1 grid grid-cols-4 gap-6 cursor-pointer"
                onClick={() => togglePlayerExpanded(member.player_id)}
              >
                <div>
                  <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
                    Name
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-medium text-slate-200">
                      {member.name}
                    </div>
                    <div className="flex items-center gap-1">
                      <a
                        href={`https://www.dotabuff.com/players/${member.player_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        title="View on Dotabuff"
                      >
                        DB
                      </a>
                      <span className="text-slate-600">|</span>
                      <a
                        href={`https://www.stratz.com/players/${member.player_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        title="View on Stratz"
                      >
                        STZ
                      </a>
                      <span className="text-slate-600">|</span>
                      <a
                        href={`https://www.opendota.com/players/${member.player_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        title="View on OpenDota"
                      >
                        OD
                      </a>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
                    Role
                  </div>
                  <div className="text-lg text-slate-300">{member.role}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
                    Rank
                  </div>
                  <div className="text-lg text-slate-300">
                    {member.rank ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
                    Original Rank
                  </div>
                  <div className="text-lg text-slate-300">
                    {member.original_rank ?? "—"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-6">
                <button
                  onClick={() => handleRefreshPlayerData(member)}
                  disabled={fetchingPlayerIds.has(member.player_id)}
                  className="text-blue-400 hover:text-blue-300 disabled:text-blue-400/50 disabled:cursor-not-allowed transition-colors"
                  title="Refresh player data"
                >
                  <svg
                    className={`w-5 h-5 ${
                      fetchingPlayerIds.has(member.player_id)
                        ? "animate-spin"
                        : ""
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
                  onClick={() => togglePlayerExpanded(member.player_id)}
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                  title={
                    isPlayerExpanded(member.player_id)
                      ? "Hide hero stats"
                      : "Show hero stats"
                  }
                >
                  <svg
                    className={`w-5 h-5 transition-transform ${
                      isPlayerExpanded(member.player_id) ? "rotate-180" : ""
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
                  onClick={() => handleRemoveClick(member)}
                  className="text-red-400 hover:text-red-300 transition-colors"
                  title="Remove from roster"
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
          {isPlayerExpanded(member.player_id) && (
            <div className="mt-0">
              <PlayerPubMatchStats
                playerId={member.player_id}
                playerRole={member.role}
                matchesData={matchesData}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header with Add Player button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-200">Players</h2>
          {/* The league is the write target, not just a filter: adding someone
              here puts them on this team's roster for this league only. */}
          <p className="text-slate-400 text-sm mt-1">
            Roster for{" "}
            <span className="text-slate-200 font-medium">{leagueName}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCopyModalOpen(true)}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md transition-colors"
          >
            Copy roster from…
          </button>
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
      </div>

      {/* Players List */}
      {isLoading ? (
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-12 text-center">
          <div className="text-slate-400 text-lg font-medium">Loading...</div>
        </div>
      ) : error ? (
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-12 text-center">
          <div className="text-red-400 text-lg font-medium">
            Error loading roster
          </div>
        </div>
      ) : (
        <>
          {/* Keyed on members, not the whole roster: a team with only a stand-in
              declared still has no roster, and the prompt to go fix that should
              stay up rather than be satisfied by a sub. */}
          {members.length === 0 ? (
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-12 text-center">
              <div className="text-slate-400 text-lg font-medium">
                No roster registered for {leagueName}
              </div>
              <div className="text-slate-500 text-sm mt-2">
                Rosters mostly carry over between seasons — copy last season's
                and swap whoever changed.
              </div>
              <button
                onClick={() => setIsCopyModalOpen(true)}
                className="mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors"
              >
                Copy roster from…
              </button>
            </div>
          ) : (
            renderRosterCards(members)
          )}

          {standIns.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                Stand-ins
              </h3>
              {renderRosterCards(standIns)}
            </div>
          )}
        </>
      )}

      {/* Add to roster modal */}
      <CreatePlayerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        leagueId={leagueId}
        teamId={teamId}
      />

      {/* Copy roster from another league */}
      <CopyRosterModal
        isOpen={isCopyModalOpen}
        onClose={() => setIsCopyModalOpen(false)}
        leagueId={leagueId}
        teamId={teamId}
      />

      {/* Remove confirmation */}
      <ConfirmDialog
        isOpen={!!memberToRemove}
        onClose={() => setMemberToRemove(null)}
        onConfirm={handleConfirmRemove}
        title="Remove from roster"
        message={`Remove ${memberToRemove?.name ?? ""} from this team's ${leagueName} roster? Their player record and pub match history are kept.`}
        confirmText="Remove"
        isLoading={isRemoving}
      />
    </div>
  )
}
