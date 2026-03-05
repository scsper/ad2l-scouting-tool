import { useGetMatchesQuery } from "../matches/matches-api"
import { useGetTeamsByLeagueQuery } from "../league-and-team-picker/teams-api"
import { getHero } from "../../utils/get-hero"
import {
  analyzeLaneMatchups,
  getSafeLaneDuoMatchup,
  type LaneMatchup,
  type DuoLaneMatchup,
} from "../../utils/lane-analysis"
import type { MatchPlayerRow } from "../../../types/db"

export const Lanes = ({
  leagueId,
  teamId,
}: {
  leagueId: number
  teamId: number
}) => {
  const { data: matchesData, isLoading, isError } = useGetMatchesQuery({
    leagueId,
    teamId,
  })
  const { data: teamsData, isLoading: isLoadingTeams } =
    useGetTeamsByLeagueQuery({ leagueId })

  if (isLoading || isLoadingTeams) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-6">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
          <span className="text-slate-400">Loading lane data...</span>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-red-500/30 shadow-lg p-6">
        <div className="text-red-400">Error loading matches. Please try again.</div>
      </div>
    )
  }

  if (!matchesData?.matches?.length) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg p-12 text-center">
        <div className="text-slate-400 text-lg font-medium">No matches found</div>
        <div className="text-slate-500 text-sm mt-2">
          Select a league and team to see lane analysis
        </div>
      </div>
    )
  }

  const teamName = (tid: number | null) =>
    tid && teamsData?.[leagueId]?.[tid] != null
      ? teamsData[leagueId][tid]
      : "Unknown Team"

  return (
    <div className="space-y-6">
      {matchesData.matches.map((match) => {
        const scoutedPlayers = match.players.filter((p) => p.team_id === teamId)
        const opponentPlayers = match.players.filter((p) => p.team_id !== teamId)
        const scoutedTeamId = scoutedPlayers[0]?.team_id ?? null
        const otherTeamId = opponentPlayers[0]?.team_id ?? null
        const scoutedTeamName = teamName(scoutedTeamId)
        const otherTeamName = teamName(otherTeamId)
        const scoutedTeamWon = match.winning_team_id === scoutedTeamId
        const matchDate = new Date(match.start_date_time * 1000).toLocaleDateString(
          "en-US",
          { year: "numeric", month: "long", day: "numeric" }
        )

        const matchups = analyzeLaneMatchups(
          match.radiant_team_id === scoutedTeamId ? scoutedPlayers : opponentPlayers,
          match.radiant_team_id === scoutedTeamId ? opponentPlayers : scoutedPlayers
        )
        // Swap so "our" team is always first (scouted team on left)
        const matchupsForDisplay: LaneMatchup[] =
          match.radiant_team_id === scoutedTeamId
            ? matchups
            : matchups.map((m) => ({
                ...m,
                radiantPlayer: m.direPlayer,
                direPlayer: m.radiantPlayer,
                winner:
                  m.winner === "radiant"
                    ? "dire"
                    : m.winner === "dire"
                      ? "radiant"
                      : "even",
                advantage: {
                  goldAdvantage: -m.advantage.goldAdvantage,
                  xpAdvantage: -m.advantage.xpAdvantage,
                  csAdvantage: -m.advantage.csAdvantage,
                },
              }))

        // Safe lane 2v2: our carry+hs vs their off+ss (single card)
        const safeLaneDuo = getSafeLaneDuoMatchup(scoutedPlayers, opponentPlayers)
        // Off lane 2v2: our off+ss vs their carry+hs (getSafeLaneDuo with args swapped gives their carry+hs vs our off+ss; we display our off first)
        const offLaneDuoRaw = getSafeLaneDuoMatchup(opponentPlayers, scoutedPlayers)

        const midMatchup = matchupsForDisplay.find((m) => m.position === "POSITION_2")
        const midWonByScouted =
          midMatchup &&
          ((midMatchup.radiantPlayer?.team_id === teamId && midMatchup.winner === "radiant") ||
            (midMatchup.direPlayer?.team_id === teamId && midMatchup.winner === "dire"))
        const midWonByOpponent =
          midMatchup &&
          midMatchup.winner !== "even" &&
          !midWonByScouted
        const safeWonByScouted = safeLaneDuo?.winner === "carry"
        const safeWonByOpponent = safeLaneDuo?.winner === "off"
        const offWonByScouted = offLaneDuoRaw?.winner === "off"
        const offWonByOpponent = offLaneDuoRaw?.winner === "carry"
        const lanesWonByScouted = [safeWonByScouted, midWonByScouted, offWonByScouted].filter(
          Boolean
        ).length
        const lanesWonByOpponent = [safeWonByOpponent, midWonByOpponent, offWonByOpponent].filter(
          Boolean
        ).length

        const has10MinData = match.players.some(
          (p) =>
            p.gold_at_10 != null ||
            p.xp_at_10 != null ||
            p.lh_at_10 != null
        )

        return (
          <div
            key={match.id}
            className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 shadow-lg overflow-hidden hover:border-slate-600 transition-all"
          >
            <div className="bg-slate-700/30 px-4 py-3 border-b border-slate-700 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-sm text-slate-400 font-medium">{matchDate}</p>
                <span className="text-slate-500">|</span>
                <span className="text-slate-200 font-medium truncate max-w-[140px]" title={scoutedTeamName}>
                  {scoutedTeamName}
                </span>
                <span className="text-slate-500">vs</span>
                <span className="text-slate-200 font-medium truncate max-w-[140px]" title={otherTeamName}>
                  {otherTeamName}
                </span>
                {scoutedTeamWon ? (
                  <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded-full border border-green-500/30">
                    W
                  </span>
                ) : (
                  <span className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded-full border border-red-500/30">
                    L
                  </span>
                )}
                <span className="text-slate-500 text-sm">
                  Lanes: {lanesWonByScouted}–{lanesWonByOpponent}
                </span>
              </div>
              <a
                href={`https://www.dotabuff.com/matches/${match.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium flex items-center gap-1"
              >
                Dotabuff
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>

            {!has10MinData && (
              <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-200/90 text-sm">
                10-minute statistics not available for this match. Showing match totals where applicable.
              </div>
            )}

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {safeLaneDuo && (
                <CarryLaneDuoCard
                  duo={safeLaneDuo}
                  teamId={teamId}
                  use10Min={has10MinData}
                  label="Carry Lane"
                />
              )}
              {matchupsForDisplay
                .filter((m) => m.position === "POSITION_2")
                .map((mu) => (
                  <LaneMatchupCard
                    key={mu.position}
                    matchup={mu}
                    teamId={teamId}
                    use10Min={has10MinData}
                  />
                ))}
              {offLaneDuoRaw && (
                <CarryLaneDuoCard
                  duo={{
                    ...offLaneDuoRaw,
                    carryLanePlayers: offLaneDuoRaw.offLanePlayers,
                    offLanePlayers: offLaneDuoRaw.carryLanePlayers,
                    carryLaneGold: offLaneDuoRaw.offLaneGold,
                    carryLaneXp: offLaneDuoRaw.offLaneXp,
                    offLaneGold: offLaneDuoRaw.carryLaneGold,
                    offLaneXp: offLaneDuoRaw.carryLaneXp,
                    winner:
                      offLaneDuoRaw.winner === "carry"
                        ? "off"
                        : offLaneDuoRaw.winner === "off"
                          ? "carry"
                          : "even",
                    goldAdvantage: -offLaneDuoRaw.goldAdvantage,
                    xpAdvantage: -offLaneDuoRaw.xpAdvantage,
                  }}
                  teamId={teamId}
                  use10Min={has10MinData}
                  label="Off Lane"
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CarryLaneDuoCard({
  duo,
  teamId,
  use10Min,
  label,
}: {
  duo: DuoLaneMatchup
  teamId: number
  use10Min: boolean
  label: "Carry Lane" | "Off Lane"
}) {
  const ourSideIsCarry = label === "Carry Lane"
  const ourPlayers = duo.carryLanePlayers
  const theirPlayers = duo.offLanePlayers
  const ourGold = duo.carryLaneGold
  const ourXp = duo.carryLaneXp
  const theirGold = duo.offLaneGold
  const theirXp = duo.offLaneXp
  const weWon = duo.winner === "carry"
  const theyWon = duo.winner === "off"

  const ourLabel = ourSideIsCarry ? "Carry + Hard Support" : "Offlaner + Soft Support"
  const theirLabel = ourSideIsCarry ? "Offlaner + Soft Support" : "Carry + Hard Support"

  const borderColor =
    duo.winner === "even"
      ? "border-slate-600"
      : weWon
        ? "border-green-500/50"
        : "border-red-500/50"

  return (
    <div
      className={`rounded-lg border bg-slate-800/30 p-3 transition-all ${borderColor}`}
    >
      <div className="text-xs font-medium text-slate-400 mb-3">{label}</div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="text-xs text-blue-400 font-medium">(you)</div>
          <div className="text-sm font-medium text-slate-200 flex flex-wrap gap-x-1 gap-y-0.5">
            {ourPlayers.map((p) => getHero(p.hero_id)).join(", ")}
          </div>
          {use10Min ? (
            <>
              <div className="flex justify-between gap-2 text-sm text-slate-300">
                <span className="text-slate-500">Gold @10:</span>
                <span>{ourGold.toLocaleString()}g</span>
              </div>
              <div className="flex justify-between gap-2 text-sm text-slate-300">
                <span className="text-slate-500">XP @10:</span>
                <span>{ourXp.toLocaleString()}</span>
              </div>
            </>
          ) : (
            <>
              <div className="text-sm text-slate-500">Gold / XP (match avg)</div>
              <div className="text-sm text-slate-400">
                {ourPlayers.reduce((s, p) => s + (p.gpm ?? 0), 0)} GPM,{" "}
                {ourPlayers.reduce((s, p) => s + (p.xpm ?? 0), 0)} XPM
              </div>
            </>
          )}
        </div>
        <div className="space-y-2">
          <div className="text-xs text-slate-500 font-medium">{theirLabel}</div>
          <div className="text-sm font-medium text-slate-400 flex flex-wrap gap-x-1 gap-y-0.5">
            {theirPlayers.map((p) => getHero(p.hero_id)).join(", ")}
          </div>
          {use10Min ? (
            <>
              <div className="flex justify-between gap-2 text-sm text-slate-400">
                <span className="text-slate-500">Gold @10:</span>
                <span>{theirGold.toLocaleString()}g</span>
              </div>
              <div className="flex justify-between gap-2 text-sm text-slate-400">
                <span className="text-slate-500">XP @10:</span>
                <span>{theirXp.toLocaleString()}</span>
              </div>
            </>
          ) : (
            <>
              <div className="text-sm text-slate-500">Gold / XP (match avg)</div>
              <div className="text-sm text-slate-400">
                {theirPlayers.reduce((s, p) => s + (p.gpm ?? 0), 0)} GPM,{" "}
                {theirPlayers.reduce((s, p) => s + (p.xpm ?? 0), 0)} XPM
              </div>
            </>
          )}
        </div>
      </div>
      {use10Min && (duo.goldAdvantage !== 0 || duo.xpAdvantage !== 0) && (
        <div className="mt-2 pt-2 border-t border-slate-600 text-xs text-slate-400">
          Advantage:{" "}
          <span className={duo.goldAdvantage >= 0 ? "text-green-400" : "text-red-400"}>
            {duo.goldAdvantage >= 0 ? "+" : ""}
            {duo.goldAdvantage}g
          </span>
          {" · "}
          <span className={duo.xpAdvantage >= 0 ? "text-green-400" : "text-red-400"}>
            {duo.xpAdvantage >= 0 ? "+" : ""}
            {duo.xpAdvantage} XP
          </span>
        </div>
      )}
    </div>
  )
}

function LaneMatchupCard({
  matchup,
  teamId,
  use10Min,
}: {
  matchup: LaneMatchup
  teamId: number
  use10Min: boolean
}) {
  const { laneLabel, radiantPlayer, direPlayer, winner, advantage } = matchup
  const scoutedIsRadiant = radiantPlayer?.team_id === teamId
  const borderColor =
    winner === "even"
      ? "border-slate-600"
      : (winner === "radiant" && scoutedIsRadiant) || (winner === "dire" && !scoutedIsRadiant)
        ? "border-green-500/50"
        : "border-red-500/50"

  return (
    <div
      className={`rounded-lg border bg-slate-800/30 p-3 transition-all ${borderColor}`}
    >
      <div className="text-xs font-medium text-slate-400 mb-2">{laneLabel}</div>
      <div className="space-y-3">
        {radiantPlayer && (
          <PlayerStats
            player={radiantPlayer}
            isScouted={radiantPlayer.team_id === teamId}
            advantage={
              winner === "radiant"
                ? { gold: advantage.goldAdvantage, xp: advantage.xpAdvantage, cs: advantage.csAdvantage }
                : winner === "dire"
                  ? { gold: -advantage.goldAdvantage, xp: -advantage.xpAdvantage, cs: -advantage.csAdvantage }
                  : null
            }
            use10Min={use10Min}
          />
        )}
        {direPlayer && (
          <PlayerStats
            player={direPlayer}
            isScouted={direPlayer.team_id === teamId}
            advantage={
              winner !== "even"
                ? {
                    gold: -advantage.goldAdvantage,
                    xp: -advantage.xpAdvantage,
                    cs: -advantage.csAdvantage,
                  }
                : null
            }
            use10Min={use10Min}
          />
        )}
      </div>
    </div>
  )
}

function PlayerStats({
  player,
  isScouted,
  advantage,
  use10Min,
}: {
  player: MatchPlayerRow
  isScouted: boolean
  advantage: { gold: number; xp: number; cs: number } | null
  use10Min: boolean
}) {
  const gold = use10Min ? player.gold_at_10 : null
  const xp = use10Min ? player.xp_at_10 : null
  const gpm = player.gpm
  const xpm = player.xpm
  const lh = use10Min ? player.lh_at_10 : player.last_hits
  const dn = use10Min ? player.denies_at_10 : player.denies
  const goldLabel = use10Min ? "10m" : "GPM (match avg)"
  const xpLabel = use10Min ? "10m" : "XPM (match avg)"
  const csLabel = use10Min ? "10m" : "Total"

  const hasGold = use10Min ? (gold != null && gold > 0) : (gpm != null && gpm > 0)
  const hasXp = use10Min ? (xp != null && xp > 0) : (xpm != null && xpm > 0)
  const hasCs = (lh != null && lh > 0) || (dn != null && dn > 0)

  return (
    <div className={`text-sm ${isScouted ? "text-slate-200" : "text-slate-400"}`}>
      <div className="font-medium flex items-center gap-1">
        {getHero(player.hero_id)}
        {isScouted && (
          <span className="text-xs text-blue-400">(you)</span>
        )}
      </div>
      <div className="space-y-1 mt-1">
        {hasGold && (
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">{use10Min ? `Gold (${goldLabel}):` : goldLabel}</span>
            <span>
              {use10Min && typeof gold === "number"
                ? `${gold.toLocaleString()}g`
                : typeof gpm === "number"
                  ? `${gpm}`
                  : "—"}
              {advantage != null && use10Min && (
                <span className={advantage.gold >= 0 ? "text-green-400" : "text-red-400"}>
                  {" "}
                  ({advantage.gold >= 0 ? "+" : ""}{advantage.gold})
                </span>
              )}
            </span>
          </div>
        )}
        {hasXp && (
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">{use10Min ? `XP (${xpLabel}):` : xpLabel}</span>
            <span>
              {use10Min && typeof xp === "number"
                ? xp.toLocaleString()
                : typeof xpm === "number"
                  ? String(xpm)
                  : "—"}
              {advantage != null && use10Min && (
                <span className={advantage.xp >= 0 ? "text-green-400" : "text-red-400"}>
                  {" "}
                  ({advantage.xp >= 0 ? "+" : ""}{advantage.xp})
                </span>
              )}
            </span>
          </div>
        )}
        {(hasCs || (lh != null && dn != null)) && (
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">CS ({csLabel}):</span>
            <span>
              {lh ?? 0}/{dn ?? 0}
              {advantage != null && (
                <span className={advantage.cs >= 0 ? "text-green-400" : "text-red-400"}>
                  {" "}
                  ({advantage.cs >= 0 ? "+" : ""}{advantage.cs})
                </span>
              )}
            </span>
          </div>
        )}
        {player.tower_damage != null && player.tower_damage > 0 && (
          <div className="flex justify-between gap-2 text-slate-500">
            <span>Total tower dmg:</span>
            <span>{player.tower_damage.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  )
}
