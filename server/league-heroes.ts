/**
 * A league's hero boards: what got picked, what got banned, and by whom.
 *
 * Picks are counted from `match_player` rather than from the `is_pick` rows of
 * `match_draft`, because the two do not cover the same games. Seven matches
 * across the current seasons have player rows and no draft rows at all — one
 * was rebuilt from post-game screenshots after OpenDota never ingested it — and
 * a hero that was played is a pick whether or not we hold the draft it came
 * from. Bans have no such second source, so a hero's contest number is picks we
 * are sure of plus bans we happen to have.
 *
 * Lives here rather than beside its one caller because Vercel turns every file
 * under `api/` into a function, tests included — see commit 3b9aed7.
 */

/** One line of a hero's pick breakdown: one player, one team, one position. */
export type LeagueHeroPickRecord = {
  playerId: number
  teamId: number | null
  /** Null for the ~2% of rows that carry no position. */
  position: string | null
  wins: number
  losses: number
}

/** One team's bans of one hero. */
export type LeagueHeroBanRecord = {
  teamId: number | null
  bans: number
}

export type LeagueHeroPositionStats = {
  picks: number
  wins: number
}

export type LeaguePicksByPosition = Record<
  string,
  Record<string, LeagueHeroPositionStats>
>

export type LeagueHeroDraftStats = {
  picks: number
  bans: number
  wins: number
  /** Sorted by games descending. Sums back to `picks` and `wins` exactly. */
  pickedBy: LeagueHeroPickRecord[]
  /** Sorted by bans descending. Sums back to `bans` exactly. */
  bannedBy: LeagueHeroBanRecord[]
}

export type LeagueHeroDraftMap = Record<string, LeagueHeroDraftStats>

export type LeagueHeroMatch = {
  id: number
  winning_team_id: number | null
}

export type LeagueHeroDraft = {
  match_id: number
  hero_id: number
  team_id: number | null
  is_pick: boolean
}

export type LeagueHeroPlayer = {
  match_id: number
  player_id: number
  hero_id: number
  team_id: number | null
  position: string | null
}

export type LeagueHeroStats = {
  picksByPosition: LeaguePicksByPosition
  heroDraftStats: LeagueHeroDraftMap
}

/**
 * Build both hero boards.
 *
 * `matches` must already be scoped to whatever the caller means by "the league"
 * — a division, usually. Drafts and players are joined to it by match id, so
 * anything outside the scope is dropped here rather than being filtered twice.
 */
export function buildLeagueHeroStats(
  matches: LeagueHeroMatch[],
  drafts: LeagueHeroDraft[],
  players: LeagueHeroPlayer[],
): LeagueHeroStats {
  const winners = new Map(matches.map(match => [match.id, match.winning_team_id]))

  // Everything accumulates in maps and is turned into the response's plain
  // objects at the end — including the breakdown lines, which leave here already
  // grouped and sorted.
  const draftStats = new Map<string, LeagueHeroDraftStats>()
  const positionStats = new Map<string, Map<string, LeagueHeroPositionStats>>()
  const pickRecords = new Map<string, Map<string, LeagueHeroPickRecord>>()
  const banRecords = new Map<string, Map<string, LeagueHeroBanRecord>>()

  const heroStats = (heroId: string) => {
    const existing = draftStats.get(heroId)
    if (existing) return existing
    const created: LeagueHeroDraftStats = {
      picks: 0,
      bans: 0,
      wins: 0,
      pickedBy: [],
      bannedBy: [],
    }
    draftStats.set(heroId, created)
    return created
  }

  for (const draft of drafts) {
    if (draft.is_pick) continue
    if (!winners.has(draft.match_id)) continue

    const heroId = String(draft.hero_id)
    heroStats(heroId).bans++

    const byTeam = banRecords.get(heroId) ?? new Map<string, LeagueHeroBanRecord>()
    banRecords.set(heroId, byTeam)
    const key = String(draft.team_id)
    const record = byTeam.get(key) ?? { teamId: draft.team_id, bans: 0 }
    record.bans++
    byTeam.set(key, record)
  }

  for (const player of players) {
    if (!winners.has(player.match_id)) continue

    const heroId = String(player.hero_id)
    // The null check is the point. A match can carry no winner — a hand-entered
    // one, or a game the parse never resolved — and `null === null` would score
    // every hero in it a win for both sides.
    const winningTeamId = winners.get(player.match_id) ?? null
    const teamWon = player.team_id !== null && player.team_id === winningTeamId

    const stats = heroStats(heroId)
    stats.picks++
    if (teamWon) stats.wins++

    const byPlayer = pickRecords.get(heroId) ?? new Map<string, LeagueHeroPickRecord>()
    pickRecords.set(heroId, byPlayer)
    const key = `${String(player.team_id)}|${String(player.player_id)}|${String(player.position)}`
    const record = byPlayer.get(key) ?? {
      playerId: player.player_id,
      teamId: player.team_id,
      position: player.position,
      wins: 0,
      losses: 0,
    }
    // A game we can't call a win counts as a loss rather than being dropped, so
    // that a record still adds up to the games the headline counted. Only a
    // match with no recorded winner can land here, and both current seasons
    // have one for every game.
    if (teamWon) record.wins++
    else record.losses++
    byPlayer.set(key, record)

    // A row with no position can't be filed under one, so it counts league-wide
    // and is absent from the position cards — those columns are deliberately
    // narrower than the boards above them rather than guessing a role.
    if (!player.position) continue
    const byHero = positionStats.get(player.position) ?? new Map<string, LeagueHeroPositionStats>()
    positionStats.set(player.position, byHero)
    const heroPosition = byHero.get(heroId) ?? { picks: 0, wins: 0 }
    heroPosition.picks++
    if (teamWon) heroPosition.wins++
    byHero.set(heroId, heroPosition)
  }

  for (const [heroId, byPlayer] of pickRecords) {
    heroStats(heroId).pickedBy = Array.from(byPlayer.values()).sort(
      (a, b) => b.wins + b.losses - (a.wins + a.losses),
    )
  }

  for (const [heroId, byTeam] of banRecords) {
    heroStats(heroId).bannedBy = Array.from(byTeam.values()).sort((a, b) => b.bans - a.bans)
  }

  return {
    picksByPosition: Object.fromEntries(
      Array.from(positionStats, ([position, byHero]) => [position, Object.fromEntries(byHero)]),
    ),
    heroDraftStats: Object.fromEntries(draftStats),
  }
}
