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

type LaneResult = "win_stomp" | "win" | "draw" | "loss" | "loss_stomp"

function getLaneResult(goldAdv: number, xpAdv: number): LaneResult {
  const score = goldAdv * 0.75 + xpAdv * 0.25
  if (score >= 1501) return "win_stomp"
  if (score >= 501) return "win"
  if (score >= -500) return "draw"
  if (score >= -1500) return "loss"
  return "loss_stomp"
}

function signedStr(n: number, suffix = "") {
  return `${n >= 0 ? "+" : ""}${n.toLocaleString()}${suffix}`
}

function DiffRow({
  label,
  goldDiff,
  xpDiff,
}: {
  label: string
  goldDiff: number
  xpDiff: number
}) {
  const goldColor = goldDiff >= 0 ? "text-green-400" : "text-red-400"
  const xpColor = xpDiff >= 0 ? "text-green-400" : "text-red-400"
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500">{label}:</span>
      <span className="flex gap-1.5">
        <span className={goldColor}>{signedStr(goldDiff, "g")}</span>
        <span className="text-slate-600">/</span>
        <span className={xpColor}>{signedStr(xpDiff, " XP")}</span>
      </span>
    </div>
  )
}

function LaneResultSection({
  goldAdv,
  xpAdv,
  coreGoldDiff,
  coreXpDiff,
  supportGoldDiff,
  supportXpDiff,
}: {
  goldAdv: number
  xpAdv: number
  coreGoldDiff?: number
  coreXpDiff?: number
  supportGoldDiff?: number
  supportXpDiff?: number
}) {
  const result = getLaneResult(goldAdv, xpAdv)
  const resultColor =
    result === "win_stomp" || result === "win"
      ? "text-green-400"
      : result === "loss" || result === "loss_stomp"
        ? "text-red-400"
        : "text-slate-400"

  return (
    <div className="mt-3 pt-2 border-t border-slate-600 text-xs space-y-1">
      <div className="flex justify-between gap-2">
        <span className="text-slate-500">Result:</span>
        <span className={`font-medium ${resultColor}`}>{result}</span>
      </div>
      <DiffRow label="Overall Difference" goldDiff={goldAdv} xpDiff={xpAdv} />
      {coreGoldDiff != null && coreXpDiff != null && (
        <DiffRow label="Core Difference" goldDiff={coreGoldDiff} xpDiff={coreXpDiff} />
      )}
      {supportGoldDiff != null && supportXpDiff != null && (
        <DiffRow label="Support Difference" goldDiff={supportGoldDiff} xpDiff={supportXpDiff} />
      )}
    </div>
  )
}

function DuoSideStats({
  players,
  totalGold,
  totalXp,
  sideLabel,
  isOurTeam,
  use10Min,
}: {
  players: MatchPlayerRow[]
  totalGold: number
  totalXp: number
  sideLabel: string
  isOurTeam: boolean
  use10Min: boolean
}) {
  const labelColor = "text-blue-400"
  const valueColor = "text-slate-200"
  const names = players.map((p) => p.player_name ?? "Unknown").join(", ")

  return (
    <div className="space-y-1.5">
      <div className={`text-xs font-medium ${labelColor}`}>
        {sideLabel}
        {names && <span className="font-normal"> — {names}</span>}
      </div>
      {players.map((p) => {
        const gold = use10Min ? p.gold_at_10 : null
        const xp = use10Min ? p.xp_at_10 : null
        return (
          <div key={p.player_id} className="space-y-0.5">
            <div className={`text-sm font-medium ${valueColor}`}>{getHero(p.hero_id)}</div>
            {use10Min ? (
              <div className="grid grid-cols-2 gap-x-2 text-xs">
                <div className="flex justify-between gap-1">
                  <span className="text-slate-500">Gold:</span>
                  <span className={valueColor}>
                    {gold != null ? gold.toLocaleString() + "g" : "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-1">
                  <span className="text-slate-500">XP:</span>
                  <span className={valueColor}>
                    {xp != null ? xp.toLocaleString() : "—"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 text-xs text-slate-400">
                <span>{p.gpm ?? "—"} GPM</span>
                <span>{p.xpm ?? "—"} XPM</span>
              </div>
            )}
          </div>
        )
      })}
      {players.length >= 2 && use10Min && (
        <div className="pt-1 border-t border-slate-700/60 grid grid-cols-2 gap-x-2 text-xs font-medium">
          <div className="flex justify-between gap-1">
            <span className="text-slate-500">Total:</span>
            <span className={valueColor}>{totalGold.toLocaleString()}g</span>
          </div>
          <div className="flex justify-between gap-1">
            <span className="text-slate-500">Total:</span>
            <span className={valueColor}>{totalXp.toLocaleString()} XP</span>
          </div>
        </div>
      )}
      {players.length >= 2 && !use10Min && (
        <div className="pt-1 border-t border-slate-700/60 text-xs font-medium text-slate-500">
          Combined: {players.reduce((s, p) => s + (p.gpm ?? 0), 0)} GPM ·{" "}
          {players.reduce((s, p) => s + (p.xpm ?? 0), 0)} XPM
        </div>
      )}
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

  const ourLabel = ourSideIsCarry ? "Carry + Hard Support" : "Offlaner + Soft Support"
  const theirLabel = ourSideIsCarry ? "Offlaner + Soft Support" : "Carry + Hard Support"

  // Core = carry (pos1) vs offlaner (pos3), Support = hard sup (pos5) vs soft sup (pos4)
  const [ourCorePos, ourSupPos, theirCorePos, theirSupPos] = ourSideIsCarry
    ? ["POSITION_1", "POSITION_5", "POSITION_3", "POSITION_4"]
    : ["POSITION_3", "POSITION_4", "POSITION_1", "POSITION_5"]
  const ourCore = ourPlayers.find((p) => p.position === ourCorePos)
  const ourSup = ourPlayers.find((p) => p.position === ourSupPos)
  const theirCore = theirPlayers.find((p) => p.position === theirCorePos)
  const theirSup = theirPlayers.find((p) => p.position === theirSupPos)

  const coreGoldDiff =
    ourCore && theirCore ? (ourCore.gold_at_10 ?? 0) - (theirCore.gold_at_10 ?? 0) : undefined
  const coreXpDiff =
    ourCore && theirCore ? (ourCore.xp_at_10 ?? 0) - (theirCore.xp_at_10 ?? 0) : undefined
  const supportGoldDiff =
    ourSup && theirSup ? (ourSup.gold_at_10 ?? 0) - (theirSup.gold_at_10 ?? 0) : undefined
  const supportXpDiff =
    ourSup && theirSup ? (ourSup.xp_at_10 ?? 0) - (theirSup.xp_at_10 ?? 0) : undefined

  const result = use10Min ? getLaneResult(duo.goldAdvantage, duo.xpAdvantage) : null
  const borderColor =
    !result || result === "draw"
      ? "border-slate-600"
      : result === "win" || result === "win_stomp"
        ? "border-green-500/50"
        : "border-red-500/50"

  return (
    <div
      className={`rounded-lg border bg-slate-800/30 p-3 transition-all ${borderColor}`}
    >
      <div className="text-xs font-medium text-slate-400 mb-3">{label}</div>
      <div className="space-y-3">
        <DuoSideStats
          players={ourPlayers}
          totalGold={ourGold}
          totalXp={ourXp}
          sideLabel={ourLabel}
          isOurTeam
          use10Min={use10Min}
        />
        <div className="border-t border-slate-700" />
        <DuoSideStats
          players={theirPlayers}
          totalGold={theirGold}
          totalXp={theirXp}
          sideLabel={theirLabel}
          isOurTeam={false}
          use10Min={use10Min}
        />
      </div>
      {use10Min && (
        <LaneResultSection
          goldAdv={duo.goldAdvantage}
          xpAdv={duo.xpAdvantage}
          coreGoldDiff={coreGoldDiff}
          coreXpDiff={coreXpDiff}
          supportGoldDiff={supportGoldDiff}
          supportXpDiff={supportXpDiff}
        />
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

  const ourPlayer = scoutedIsRadiant ? radiantPlayer : direPlayer
  const theirPlayer = scoutedIsRadiant ? direPlayer : radiantPlayer

  const ourGoldAdv = scoutedIsRadiant ? advantage.goldAdvantage : -advantage.goldAdvantage
  const ourXpAdv = scoutedIsRadiant ? advantage.xpAdvantage : -advantage.xpAdvantage

  const result = use10Min ? getLaneResult(ourGoldAdv, ourXpAdv) : null
  const borderColor =
    !result || result === "draw"
      ? "border-slate-600"
      : result === "win" || result === "win_stomp"
        ? "border-green-500/50"
        : "border-red-500/50"

  return (
    <div
      className={`rounded-lg border bg-slate-800/30 p-3 transition-all ${borderColor}`}
    >
      <div className="text-xs font-medium text-slate-400 mb-3">{laneLabel}</div>
      <div className="space-y-3">
        {ourPlayer && (
          <DuoSideStats
            players={[ourPlayer]}
            totalGold={ourPlayer.gold_at_10 ?? 0}
            totalXp={ourPlayer.xp_at_10 ?? 0}
            sideLabel="Mid"
            isOurTeam
            use10Min={use10Min}
          />
        )}
        {ourPlayer && theirPlayer && <div className="border-t border-slate-700" />}
        {theirPlayer && (
          <DuoSideStats
            players={[theirPlayer]}
            totalGold={theirPlayer.gold_at_10 ?? 0}
            totalXp={theirPlayer.xp_at_10 ?? 0}
            sideLabel="Mid"
            isOurTeam={false}
            use10Min={use10Min}
          />
        )}
      </div>
      {use10Min && (
        <LaneResultSection goldAdv={ourGoldAdv} xpAdv={ourXpAdv} />
      )}
    </div>
  )
}
