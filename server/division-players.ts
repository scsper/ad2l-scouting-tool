/**
 * One player's record at one position, aggregated across a division.
 *
 * The row is keyed on (player, position) rather than on the player, because
 * roughly half of a season's players appear at more than one — 31 of S47's 65.
 * Filing all of their games under a modal position would rank a pos 3 who
 * covered four games at pos 4 against pure pos 3s on an average that includes
 * a role where the gold is structurally two hundred a minute lower. That is the
 * pooled-archetype mistake the scouting playbook learned to split by position,
 * applied to players instead of heroes.
 *
 * Most stats here are duration-neutral, which is the difference between this and
 * the per-team Players tab; the `@10` columns are the strongest for that reason,
 * since a fixed ten-minute window is comparable across every game ever played.
 * Wards are the deliberate exception. A rate per minute is the cleaner quantity
 * — games run 23 to 83 minutes, so a long game inflates the count — but nobody
 * scouting a support thinks in wards per minute, and rescaling to per-ten to
 * make it readable produced a column whose numbers matched nothing anyone had
 * seen elsewhere. Wards placed per game is what Dotabuff shows and what the
 * Players tab shows, so it is what this shows.
 */
export type DivisionPlayerRow = {
  playerId: number
  /** Latest observed `player_name`, which is not stable across a season. */
  name: string
  position: string
  /**
   * Every team they held this position for. Usually one; a stand-in who covered
   * for two teams gets both, and the row pools their games rather than splitting
   * into two thinner ones.
   */
  teamIds: number[]
  games: number
  wins: number
  /**
   * `null` when no game of theirs carries the stat — never 0. Each of these has
   * its own denominator, so a player with lane data for three of five games is
   * averaged over those three. The two hand-entered S47 matches carry no `@10`
   * or ward data at all, and counting them as zeroes would invent a bad laner.
   */
  goldAt10: number | null
  xpAt10: number | null
  lhAt10: number | null
  gpm: number
  xpm: number
  /** Ratio of totals, matching how Dotabuff/OpenDota/Stratz report aggregate KDA. */
  kda: number
  /** Per minute of game time. `null` when no game had a usable duration. */
  heroDamagePerMin: number | null
  /** Wards placed per game, averaged over the games that report them. */
  obsPerGame: number | null
  senPerGame: number | null
}

/** Sentinel written by the ingest scripts when a Steam profile is private. */
const ANONYMOUS_PLAYER_ID = 0

export type DivisionMatch = {
  id: number
  winning_team_id: number | null
  start_date_time: number
  end_date_time: number
}

export type DivisionPlayer = {
  match_id: number
  player_id: number
  player_name: string | null
  team_id: number | null
  position: string | null
  gpm: number
  xpm: number
  kills: number
  deaths: number
  assists: number
  hero_damage: number
  obs_placed: number | null
  sen_placed: number | null
  gold_at_10?: number | null
  xp_at_10?: number | null
  lh_at_10?: number | null
}

/**
 * A running mean that ignores missing observations rather than counting them as
 * zero, so the denominator is per-stat rather than per-game. Returns `null` when
 * nothing was ever added, which the UI renders as an em dash — the distinction
 * between "placed none" and "we have no numbers" has to survive the average.
 */
class SkippingMean {
  private total = 0
  private count = 0

  add(value: number | null | undefined) {
    if (value == null) return
    this.total += value
    this.count += 1
  }

  get(): number | null {
    return this.count === 0 ? null : this.total / this.count
  }
}

type Accumulator = {
  playerId: number
  position: string
  name: string
  nameAt: number
  teamIds: Set<number>
  games: number
  wins: number
  goldAt10: SkippingMean
  xpAt10: SkippingMean
  lhAt10: SkippingMean
  gpm: number
  xpm: number
  kills: number
  deaths: number
  assists: number
  heroDamagePerMin: SkippingMean
  obsPerGame: SkippingMean
  senPerGame: SkippingMean
}

/**
 * Minutes of game time, or `null` when the match can't say.
 *
 * Guarded rather than trusted: a per-minute rate divided by a zero or negative
 * duration is an infinity that would sort straight to the top of the board.
 * Both current AD2L seasons have clean timestamps, so this only ever fires on
 * data that would otherwise be a visible lie.
 */
function durationMinutes(match: DivisionMatch): number | null {
  const seconds = match.end_date_time - match.start_date_time
  return seconds > 0 ? seconds / 60 : null
}

/**
 * Build the division's player-position rows.
 *
 * `matches` must already be division-scoped — this does no filtering of its own,
 * because the caller has the team set and `matchesWithinDivision` is the one
 * place that decides what "in the division" means.
 *
 * Rows are returned unranked and unfiltered, including the one-game cameos. The
 * minimum-sample floor is a presentation decision and lives with the board, so
 * that the shape of the field stays visible rather than being cut server-side.
 */
export function buildDivisionPlayerRows(
  matches: DivisionMatch[],
  players: DivisionPlayer[],
): DivisionPlayerRow[] {
  const matchesById = new Map(matches.map(match => [match.id, match]))
  const accumulators = new Map<string, Accumulator>()

  for (const player of players) {
    // Private Steam profiles all ingest as player 0, so merging them would
    // invent one composite player out of several people.
    if (player.player_id === ANONYMOUS_PLAYER_ID) continue
    // A row with no position can't be filed under one. 12% of S45 looks like
    // this; both current seasons are clean.
    if (!player.position) continue

    const match = matchesById.get(player.match_id)
    if (!match) continue

    const key = `${String(player.player_id)}|${player.position}`
    let accumulator = accumulators.get(key)
    if (!accumulator) {
      accumulator = {
        playerId: player.player_id,
        position: player.position,
        name: String(player.player_id),
        nameAt: Number.NEGATIVE_INFINITY,
        teamIds: new Set(),
        games: 0,
        wins: 0,
        goldAt10: new SkippingMean(),
        xpAt10: new SkippingMean(),
        lhAt10: new SkippingMean(),
        gpm: 0,
        xpm: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        heroDamagePerMin: new SkippingMean(),
        obsPerGame: new SkippingMean(),
        senPerGame: new SkippingMean(),
      }
      accumulators.set(key, accumulator)
    }

    // Handles change mid-season — six S46 players used more than one — so the
    // display name is whichever they wore most recently rather than whichever
    // match happened to be read first.
    if (player.player_name && match.start_date_time > accumulator.nameAt) {
      accumulator.name = player.player_name
      accumulator.nameAt = match.start_date_time
    }

    if (player.team_id !== null) accumulator.teamIds.add(player.team_id)

    accumulator.games += 1
    if (player.team_id !== null && player.team_id === match.winning_team_id) {
      accumulator.wins += 1
    }

    accumulator.goldAt10.add(player.gold_at_10)
    accumulator.xpAt10.add(player.xp_at_10)
    accumulator.lhAt10.add(player.lh_at_10)

    accumulator.gpm += player.gpm
    accumulator.xpm += player.xpm
    accumulator.kills += player.kills
    accumulator.deaths += player.deaths
    accumulator.assists += player.assists

    // Ward counts don't need the match's duration, so they survive a game whose
    // timestamps we can't use — which the hero-damage rate can't.
    accumulator.obsPerGame.add(player.obs_placed)
    accumulator.senPerGame.add(player.sen_placed)

    // Rated per game and then averaged, rather than summing both sides and
    // dividing once. Otherwise a single long game would weigh more than a short
    // one in a stat whose entire purpose is to be independent of game length.
    const minutes = durationMinutes(match)
    if (minutes !== null) {
      accumulator.heroDamagePerMin.add(player.hero_damage / minutes)
    }
  }

  return Array.from(accumulators.values()).map(accumulator => ({
    playerId: accumulator.playerId,
    name: accumulator.name,
    position: accumulator.position,
    teamIds: Array.from(accumulator.teamIds),
    games: accumulator.games,
    wins: accumulator.wins,
    goldAt10: accumulator.goldAt10.get(),
    xpAt10: accumulator.xpAt10.get(),
    lhAt10: accumulator.lhAt10.get(),
    gpm: accumulator.gpm / accumulator.games,
    xpm: accumulator.xpm / accumulator.games,
    kda:
      (accumulator.kills + accumulator.assists) / Math.max(accumulator.deaths, 1),
    heroDamagePerMin: accumulator.heroDamagePerMin.get(),
    obsPerGame: accumulator.obsPerGame.get(),
    senPerGame: accumulator.senPerGame.get(),
  }))
}
