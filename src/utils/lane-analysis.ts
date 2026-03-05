import type { MatchPlayerRow } from "../../types/db"

const POSITION_ORDER = [
  "POSITION_1",
  "POSITION_2",
  "POSITION_3",
  "POSITION_4",
  "POSITION_5",
] as const

const LANE_LABELS: Record<string, string> = {
  POSITION_1: "Carry Lane",
  POSITION_2: "Mid Lane",
  POSITION_3: "Off Lane",
  POSITION_4: "Soft Support",
  POSITION_5: "Hard Support",
}

export type LaneMatchup = {
  position: string
  laneLabel: string
  radiantPlayer: MatchPlayerRow | null
  direPlayer: MatchPlayerRow | null
  winner: "radiant" | "dire" | "even"
  advantage: {
    goldAdvantage: number
    xpAdvantage: number
    csAdvantage: number
  }
}

function getPlayersByPosition(
  players: MatchPlayerRow[],
): Map<string, MatchPlayerRow> {
  const byPos = new Map<string, MatchPlayerRow>()
  for (const p of players) {
    const pos = p.position ?? "UNCATEGORIZED"
    if (POSITION_ORDER.includes(pos as (typeof POSITION_ORDER)[number])) {
      byPos.set(pos, p)
    }
  }
  return byPos
}

/**
 * Pair up opposing laners by position (Radiant pos N vs Dire pos N).
 */
export function analyzeLaneMatchups(
  radiantPlayers: MatchPlayerRow[],
  direPlayers: MatchPlayerRow[],
): LaneMatchup[] {
  const radiantByPos = getPlayersByPosition(radiantPlayers)
  const direByPos = getPlayersByPosition(direPlayers)

  return POSITION_ORDER.map(position => {
    const radiantPlayer = radiantByPos.get(position) ?? null
    const direPlayer = direByPos.get(position) ?? null
    const laneLabel = LANE_LABELS[position] ?? position

    let winner: "radiant" | "dire" | "even" = "even"
    let advantage = { goldAdvantage: 0, xpAdvantage: 0, csAdvantage: 0 }

    if (radiantPlayer && direPlayer) {
      const laneWinner = calculateLaneWinner(radiantPlayer, direPlayer)
      advantage = calculateAdvantage(radiantPlayer, direPlayer)
      if (laneWinner === "player1") winner = "radiant"
      else if (laneWinner === "player2") winner = "dire"
    }

    return {
      position,
      laneLabel,
      radiantPlayer,
      direPlayer,
      winner,
      advantage,
    }
  })
}

/**
 * Lane win: weighted score = gold_adv * 0.75 + xp_adv * 0.25.
 * 0–500: even, 501–1500: won, 1501+: stomp (we just return player1/player2 won or even).
 */
export function calculateLaneWinner(
  player1: MatchPlayerRow,
  player2: MatchPlayerRow,
): "player1" | "player2" | "even" {
  const g1 = player1.gold_at_10 ?? null
  const g2 = player2.gold_at_10 ?? null
  const x1 = player1.xp_at_10 ?? null
  const x2 = player2.xp_at_10 ?? null

  if (g1 == null || g2 == null || x1 == null || x2 == null) {
    return "even"
  }

  const goldAdv = g1 - g2
  const xpAdv = x1 - x2
  const weightedScore = goldAdv * 0.75 + xpAdv * 0.25

  if (weightedScore >= 501) return "player1"
  if (weightedScore <= -501) return "player2"
  return "even"
}

export function calculateAdvantage(
  player1: MatchPlayerRow,
  player2: MatchPlayerRow,
): {
  goldAdvantage: number
  xpAdvantage: number
  csAdvantage: number
} {
  const g1 = player1.gold_at_10 ?? 0
  const g2 = player2.gold_at_10 ?? 0
  const x1 = player1.xp_at_10 ?? 0
  const x2 = player2.xp_at_10 ?? 0
  const lh1 = player1.lh_at_10 ?? player1.last_hits ?? 0
  const lh2 = player2.lh_at_10 ?? player2.last_hits ?? 0
  const d1 = player1.denies_at_10 ?? player1.denies ?? 0
  const d2 = player2.denies_at_10 ?? player2.denies ?? 0

  return {
    goldAdvantage: g1 - g2,
    xpAdvantage: x1 - x2,
    csAdvantage: lh1 + d1 - (lh2 + d2),
  }
}
