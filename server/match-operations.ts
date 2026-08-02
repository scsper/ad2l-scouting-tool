import { createClient } from "@supabase/supabase-js"
import type {
  MatchRow,
  MatchPlayerRow,
  MatchDraftRow,
  MatchObjectiveRow,
  WardRecord,
} from "../types/db.js"
import { extractWards, type OpenDotaWardLogs } from "./wards.js"
import { extractObjectives, type OpenDotaObjectiveLog } from "./objectives.js"

const API_URL = "https://api.opendota.com/api/matches"
const OPENDOTA_API_KEY = process.env.OPENDOTA_API_TOKEN ?? ""
const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// OpenDota API response types
type OpenDotaTeam = {
  team_id?: number
  name?: string
}

type OpenDotaPickBan = {
  is_pick: boolean
  hero_id: number
  team: 0 | 1 // 0 = radiant, 1 = dire
  order: number
}

type OpenDotaPlayer = {
  account_id?: number
  personaname?: string
  hero_id: number
  player_slot: number // 0-127 = radiant, 128-255 = dire
  kills: number
  deaths: number
  assists: number
  last_hits: number
  denies: number
  gold_per_min: number
  xp_per_min: number
  hero_damage: number
  tower_damage: number
  // Only present on replay-parsed matches; absent means unknown, not zero.
  obs_placed?: number
  sen_placed?: number
  lane?: number
  lane_role?: number
  is_roaming?: boolean
  times?: number[]
  gold_t?: number[]
  xp_t?: number[]
  lh_t?: number[]
  dn_t?: number[]
} & OpenDotaWardLogs

// OpenDota match response
type OpenDotaMatch = {
  match_id: number
  radiant_win: boolean
  start_time: number
  duration: number
  // Parser version. `null` means OpenDota fetched the match summary but never
  // parsed the replay, so there is no timeline — no `lane`, `lane_role`, or
  // `times`/`gold_t`/`xp_t`. Every position, lane, and at-10 field would be null,
  // which silently poisons the positional aggregates. `parseMatch` refuses these.
  version?: number | null
  /**
   * OpenDota's patch index, not a version string (57=7.38 … 60=7.41). The Roshan
   * pit rule is patch-specific, and deriving the patch from `start_time` cannot
   * separate 7.38 from 7.39 — they ship the same minimap.
   */
  patch?: number | null
  leagueid?: number
  radiant_team_id?: number
  dire_team_id?: number
  radiant_team?: OpenDotaTeam
  dire_team?: OpenDotaTeam
  picks_bans?: OpenDotaPickBan[]
  players: OpenDotaPlayer[]
} & OpenDotaObjectiveLog

// Internal types (matching Stratz structure for compatibility)
type Team = {
  id: number
  name: string
}

type PickBan = {
  isPick: boolean
  heroId: number
  order: number
  isRadiant: boolean
}

type SteamAccount = {
  id: number
  name: string | null
}

type Player = {
  steamAccount: SteamAccount | null
  heroId: number
  isVictory: boolean
  isRadiant: boolean
  lane: string | null
  position: string | null
  kills: number
  deaths: number
  assists: number
  numLastHits: number
  numDenies: number
  goldPerMinute: number
  experiencePerMinute: number
  heroDamage: number
  towerDamage: number
  /** `null` when OpenDota supplied no ward data; `0` means none were placed. */
  obsPlaced: number | null
  senPlaced: number | null
  goldAt10: number | null
  xpAt10: number | null
  lastHitsAt10: number | null
  deniesAt10: number | null
  // null when the replay carried no ward logs; [] when the player placed none.
  wards: WardRecord[] | null
}

export type Match = {
  id: number
  didRadiantWin: boolean
  startDateTime: number
  endDateTime: number
  leagueId: number
  radiantTeam: Team | null
  direTeam: Team | null
  topLaneOutcome: string | null
  midLaneOutcome: string | null
  bottomLaneOutcome: string | null
  pickBans: PickBan[]
  players: Player[]
  /** OpenDota's patch index; null when the payload omitted it. */
  patch: number | null
  /** null when the replay was never parsed; [] when it carried no objectives. */
  objectives: MatchObjectiveRow[] | null
}

/**
 * Both the transformed match and the raw OpenDota payload. Callers need the raw
 * payload to inspect `version` before deciding whether the match is worth storing.
 */
export type FetchedMatch = {
  raw: OpenDotaMatch
  match: Match
}

/** Why a parse could not complete. The API route maps these to HTTP statuses. */
export type ParseErrorCode =
  | "INVALID_ID"
  | "NOT_FOUND"
  | "UPSTREAM"
  | "ALREADY_PARSED"
  | "UNPARSED"
  | "UNKNOWN_TEAM"

export class ParseError extends Error {
  readonly code: ParseErrorCode

  constructor(code: ParseErrorCode, message: string) {
    super(message)
    this.name = "ParseError"
    this.code = code
  }
}

function get10MinuteStats(player: OpenDotaPlayer): {
  goldAt10: number | null
  xpAt10: number | null
  lastHitsAt10: number | null
  deniesAt10: number | null
} {
  if (!player.times || !player.gold_t || !player.xp_t) {
    return { goldAt10: null, xpAt10: null, lastHitsAt10: null, deniesAt10: null }
  }

  const index10Min = player.times.findIndex(t => t === 600)
  if (index10Min === -1) {
    return { goldAt10: null, xpAt10: null, lastHitsAt10: null, deniesAt10: null }
  }

  return {
    goldAt10: player.gold_t[index10Min] ?? null,
    xpAt10: player.xp_t[index10Min] ?? null,
    lastHitsAt10: player.lh_t?.[index10Min] ?? null,
    deniesAt10: player.dn_t?.[index10Min] ?? null,
  }
}

// Helper to convert lane number to lane string
function getLaneString(lane?: number, isRoaming?: boolean): string | null {
  if (isRoaming) return "ROAMING"
  if (lane === undefined || lane === null) return null

  // OpenDota lane values: 1=safe, 2=mid, 3=off, 4=jungle
  switch (lane) {
    case 1:
      return "SAFE_LANE"
    case 2:
      return "MID_LANE"
    case 3:
      return "OFF_LANE"
    case 4:
      return "JUNGLE"
    default:
      return null
  }
}

// Helper to determine position based on lane_role and farm priority
// OpenDota lane_role: 1=safelane, 2=mid, 3=offlane, 4=jungle
// Positions: 1=carry, 2=mid, 3=offlane, 4=soft support, 5=hard support
export function getPositionString(
  player: OpenDotaPlayer,
  allPlayers: OpenDotaPlayer[],
): string | null {
  const { lane_role, player_slot } = player
  if (lane_role === undefined || lane_role === null) return null

  // Mid lane is always position 2
  if (lane_role === 2) {
    return "POSITION_2"
  }

  // Jungle is typically position 4
  if (lane_role === 4) {
    return "POSITION_4"
  }

  // For safelane (1) and offlane (3), distinguish core from support by comparing
  // only the players who actually shared that lane, using lane-phase farm.
  //
  // Comparing against the whole team on full-game farm (the previous approach) mislabels
  // any lane whose core finishes below a high-GPM support — e.g. an offlane Axe ranked
  // behind a farming Zeus, which flipped p3/p4 in 9 team-games across the DB.
  const isRadiant = player_slot < 128
  const laneMates = allPlayers.filter(
    p => p.player_slot < 128 === isRadiant && p.lane_role === lane_role,
  )

  // Last hits at 10 minutes is the cleanest signal for who had lane farm priority.
  // Fall back to full-game farm only when the timeline is unavailable (unparsed match).
  const laneFarmScore = (p: OpenDotaPlayer): number => {
    const lh10 = get10MinuteStats(p).lastHitsAt10
    return lh10 ?? p.gold_per_min * 0.5 + p.last_hits * 0.5
  }

  const rank = [...laneMates]
    .sort((a, b) => laneFarmScore(b) - laneFarmScore(a))
    .findIndex(p => p === player)

  // Safelane: top farm = carry, next = hard support, any extra = soft support
  if (lane_role === 1) {
    if (rank === 0) return "POSITION_1"
    return rank === 1 ? "POSITION_5" : "POSITION_4"
  }

  // Offlane: top farm = offlaner, everyone else = soft support
  if (lane_role === 3) {
    return rank === 0 ? "POSITION_3" : "POSITION_4"
  }

  return null
}

// Transform OpenDota match to internal Match format
function transformOpenDotaMatch(openDotaMatch: OpenDotaMatch): Match {
  const endDateTime = openDotaMatch.start_time + openDotaMatch.duration

  // Transform players
  const players: Player[] = openDotaMatch.players.map(player => {
    const isRadiant = player.player_slot < 128
    const isVictory =
      (isRadiant && openDotaMatch.radiant_win) ||
      (!isRadiant && !openDotaMatch.radiant_win)
    const at10 = get10MinuteStats(player)

    return {
      steamAccount: player.account_id
        ? {
            id: player.account_id,
            name: player.personaname ?? null,
          }
        : null,
      heroId: player.hero_id,
      isVictory,
      isRadiant,
      lane: getLaneString(player.lane, player.is_roaming),
      position: getPositionString(player, openDotaMatch.players),
      kills: player.kills,
      deaths: player.deaths,
      assists: player.assists,
      numLastHits: player.last_hits,
      numDenies: player.denies,
      goldPerMinute: player.gold_per_min,
      experiencePerMinute: player.xp_per_min,
      heroDamage: player.hero_damage,
      towerDamage: player.tower_damage,
      // `?? null`, never `?? 0`: an absent field means OpenDota has no ward data
      // for this player, which is not the same as placing no wards.
      obsPlaced: player.obs_placed ?? null,
      senPlaced: player.sen_placed ?? null,
      goldAt10: at10.goldAt10,
      xpAt10: at10.xpAt10,
      lastHitsAt10: at10.lastHitsAt10,
      deniesAt10: at10.deniesAt10,
      wards: extractWards(player),
    }
  })

  // Transform picks and bans
  const pickBans: PickBan[] = (openDotaMatch.picks_bans ?? []).map(pb => ({
    isPick: pb.is_pick,
    heroId: pb.hero_id,
    order: pb.order,
    isRadiant: pb.team === 0,
  }))

  // Transform teams - prioritize direct team IDs, fall back to nested team object
  const radiantTeamId =
    openDotaMatch.radiant_team_id ?? openDotaMatch.radiant_team?.team_id
  const direTeamId =
    openDotaMatch.dire_team_id ?? openDotaMatch.dire_team?.team_id

  const radiantTeam: Team | null = radiantTeamId
    ? {
        id: radiantTeamId,
        name: openDotaMatch.radiant_team?.name ?? "Radiant",
      }
    : null

  const direTeam: Team | null = direTeamId
    ? {
        id: direTeamId,
        name: openDotaMatch.dire_team?.name ?? "Dire",
      }
    : null

  return {
    id: openDotaMatch.match_id,
    didRadiantWin: openDotaMatch.radiant_win,
    startDateTime: openDotaMatch.start_time,
    endDateTime,
    leagueId: openDotaMatch.leagueid ?? 0,
    radiantTeam,
    direTeam,
    topLaneOutcome: null, // OpenDota doesn't provide lane outcomes
    midLaneOutcome: null,
    bottomLaneOutcome: null,
    pickBans,
    players,
    patch: openDotaMatch.patch ?? null,
    objectives: extractObjectives(openDotaMatch, openDotaMatch.match_id),
  }
}

export async function getMatch(matchId: number): Promise<FetchedMatch> {
  const url = `${API_URL}/${String(matchId)}${OPENDOTA_API_KEY ? `?api_key=${OPENDOTA_API_KEY}` : ""}`

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  })

  if (response.status === 404) {
    throw new ParseError(
      "NOT_FOUND",
      `OpenDota has no record of match ${String(matchId)}.`,
    )
  }

  if (!response.ok) {
    throw new ParseError(
      "UPSTREAM",
      `OpenDota returned ${String(response.status)} ${response.statusText}.`,
    )
  }

  const openDotaMatch = (await response.json()) as OpenDotaMatch & {
    error?: string
  }

  if (openDotaMatch.error) {
    throw new ParseError("NOT_FOUND", `OpenDota: ${openDotaMatch.error}`)
  }

  // A summary with no players is not something we can transform.
  if (!Array.isArray(openDotaMatch.players) || openDotaMatch.players.length === 0) {
    throw new ParseError(
      "UPSTREAM",
      `OpenDota returned no player data for match ${String(matchId)}.`,
    )
  }

  return { raw: openDotaMatch, match: transformOpenDotaMatch(openDotaMatch) }
}

function getLaneOutcome(match: Match, player: Player): string | null {
  if (!player.lane) return null

  const lane = player.lane.toLowerCase()

  // Map lane to outcome based on whether player is radiant or dire
  // In Dota 2 map layout:
  // - Top lane: Radiant off lane / Dire safe lane
  // - Mid lane: Mid for both teams
  // - Bottom lane: Radiant safe lane / Dire off lane
  if (lane.includes("mid")) {
    return match.midLaneOutcome
  }

  if (player.isRadiant) {
    if (lane.includes("safe")) {
      return match.bottomLaneOutcome
    } else if (lane.includes("off")) {
      return match.topLaneOutcome
    }
  } else {
    // Dire team
    if (lane.includes("safe")) {
      return match.topLaneOutcome
    } else if (lane.includes("off")) {
      return match.bottomLaneOutcome
    }
  }

  // For jungle/roaming positions, no specific lane outcome
  return null
}

export async function convertMatchDataToMatchPlayersTable(
  matchData: Match,
): Promise<MatchPlayerRow[]> {
  const matchPlayerRows: MatchPlayerRow[] = matchData.players.map(player => ({
    player_id: player.steamAccount?.id ?? 0,
    match_id: matchData.id,
    team_id: player.isRadiant
      ? (matchData.radiantTeam?.id ?? null)
      : (matchData.direTeam?.id ?? null),
    player_name: player.steamAccount?.name ?? null,
    hero_id: player.heroId,
    position: player.position,
    lane_outcome: getLaneOutcome(matchData, player),
    lane: player.lane,
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    last_hits: player.numLastHits,
    denies: player.numDenies,
    gpm: player.goldPerMinute,
    xpm: player.experiencePerMinute,
    hero_damage: player.heroDamage,
    tower_damage: player.towerDamage,
    obs_placed: player.obsPlaced,
    sen_placed: player.senPlaced,
    gold_at_10: player.goldAt10,
    xp_at_10: player.xpAt10,
    lh_at_10: player.lastHitsAt10,
    denies_at_10: player.deniesAt10,
    wards: player.wards,
  }))

  const { data, error } = await supabase
    .from("match_player")
    .insert(matchPlayerRows)
    .select()

  if (error) {
    console.error("Error inserting match player:", error)
    throw error
  }

  console.log(
    `Successfully inserted ${String(matchPlayerRows.length)} players for match ${String(matchData.id)}`,
  )
  return data as MatchPlayerRow[]
}

export async function convertMatchDataToMatchDraftTable(
  matchData: Match,
): Promise<MatchDraftRow[]> {
  const matchDraftRows: MatchDraftRow[] = matchData.pickBans.map(pickBan => ({
    match_id: matchData.id,
    order: pickBan.order,
    hero_id: pickBan.heroId,
    team_id: pickBan.isRadiant
      ? (matchData.radiantTeam?.id ?? null)
      : (matchData.direTeam?.id ?? null),
    is_pick: pickBan.isPick,
  }))

  const { data, error } = await supabase
    .from("match_draft")
    .insert(matchDraftRows)
    .select()

  if (error) {
    console.error("Error inserting match draft:", error)
    throw error
  }

  console.log(
    `Successfully inserted ${String(matchDraftRows.length)} picks/bans for match ${String(matchData.id)}`,
  )
  return data as MatchDraftRow[]
}

/**
 * Store a match's objectives.
 *
 * A no-op when `objectives` is null — the replay was never parsed, and inserting
 * nothing while `match.objectives_parsed` stays FALSE is exactly right. Writing
 * zero rows against a TRUE flag would claim every building survived.
 */
export async function convertMatchDataToMatchObjectiveTable(
  matchData: Match,
): Promise<MatchObjectiveRow[]> {
  if (matchData.objectives === null || matchData.objectives.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from("match_objective")
    .insert(matchData.objectives)
    .select()

  if (error) {
    console.error("Error inserting match objectives:", error)
    throw error
  }

  console.log(
    `Successfully inserted ${String(matchData.objectives.length)} objectives for match ${String(matchData.id)}`,
  )
  return data as MatchObjectiveRow[]
}

export async function convertMatchDataToMatchTable(
  matchData: Match,
  { upsert = false }: { upsert?: boolean } = {},
): Promise<MatchRow[]> {
  const matchRow: MatchRow = {
    id: matchData.id,
    league_id: matchData.leagueId,
    winning_team_id: matchData.didRadiantWin
      ? (matchData.radiantTeam?.id ?? null)
      : (matchData.direTeam?.id ?? null),
    radiant_team_id: matchData.radiantTeam?.id ?? null,
    dire_team_id: matchData.direTeam?.id ?? null,
    start_date_time: matchData.startDateTime,
    end_date_time: matchData.endDateTime,
    patch: matchData.patch,
    // Asserted here rather than after the child insert because the match row is
    // written first and upserts overwrite it: leaving it FALSE and flipping it
    // later would mark every match unparsed for the window in between, and
    // Supabase has no transaction to close that window.
    objectives_parsed: matchData.objectives !== null,
  }

  const { data, error } = upsert
    ? await supabase.from("match").upsert(matchRow).select()
    : await supabase.from("match").insert(matchRow).select()

  if (error) {
    console.error("Error inserting match:", error)
    throw error
  }

  console.log(`Successfully inserted match ${String(matchData.id)}`)
  return data as MatchRow[]
}

export type ParseMatchResult = {
  matchId: number
  status: "parsed" | "overwritten"
  leagueId: number
  radiantTeamId: number | null
  direTeamId: number | null
  /** Non-fatal problems: the rows landed, but the match may not be visible yet. */
  warnings: string[]
}

/** Postgres error codes surfaced by PostgREST. */
const FOREIGN_KEY_VIOLATION = "23503"
const UNIQUE_VIOLATION = "23505"

function isPostgrestError(error: unknown): error is { code?: string; message?: string } {
  return typeof error === "object" && error !== null && "code" in error
}

async function matchExists(matchId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from("match")
    .select("id")
    .eq("id", matchId)
    .maybeSingle()

  if (error) {
    console.error("Error checking for existing match:", error)
    throw error
  }

  return data !== null
}

/**
 * Remove the child rows for a match so it can be re-inserted from scratch.
 *
 * Supabase has no transactions, so this leaves a window where the match row
 * exists with no players. `parseMatch` shrinks that window by fetching and
 * validating the OpenDota payload *before* calling this.
 */
async function deleteMatchChildren(matchId: number): Promise<void> {
  const [
    { error: playersError },
    { error: draftError },
    { error: objectivesError },
  ] = await Promise.all([
    supabase.from("match_player").delete().eq("match_id", matchId),
    supabase.from("match_draft").delete().eq("match_id", matchId),
    supabase.from("match_objective").delete().eq("match_id", matchId),
  ])

  if (playersError) {
    console.error("Error deleting existing match players:", playersError)
    throw playersError
  }
  if (draftError) {
    console.error("Error deleting existing match draft:", draftError)
    throw draftError
  }
  if (objectivesError) {
    console.error("Error deleting existing match objectives:", objectivesError)
    throw objectivesError
  }
}

/**
 * Check that both teams are registered in this league.
 *
 * Parsing deliberately does not create `team` or `league_teams` rows. A match
 * whose team is missing from `league_teams` is stored correctly but is invisible
 * in the UI, because both the team dropdown and `api/matches` filter on league
 * membership. Reporting it beats letting it look like a silent no-op.
 */
async function getLeagueMembershipWarnings(match: Match): Promise<string[]> {
  const teamIds = [match.radiantTeam?.id, match.direTeam?.id].filter(
    (id): id is number => typeof id === "number",
  )

  if (teamIds.length === 0) {
    return [
      "This match has no team IDs, so it will not appear under any team.",
    ]
  }

  const { data, error } = await supabase
    .from("league_teams")
    .select("team_id")
    .eq("league_id", match.leagueId)
    .in("team_id", teamIds)

  if (error) {
    console.error("Error checking league membership:", error)
    // A warning lookup must never fail the parse — the rows are already stored.
    return []
  }

  const registered = new Set((data as { team_id: number }[]).map(row => row.team_id))

  return teamIds
    .filter(id => !registered.has(id))
    .map(
      id =>
        `Team ${String(id)} is not registered in league ${String(match.leagueId)}, so this match will not show up under that team yet.`,
    )
}

/**
 * Fetch a match from OpenDota and store it.
 *
 * Refuses matches OpenDota has not parsed (no timeline means every position and
 * lane field would be null) and refuses matches already in the database unless
 * `overwrite` is set.
 */
export async function parseMatch({
  matchId,
  overwrite = false,
}: {
  matchId: number
  overwrite?: boolean
}): Promise<ParseMatchResult> {
  if (!Number.isInteger(matchId) || matchId <= 0) {
    throw new ParseError("INVALID_ID", `"${String(matchId)}" is not a valid match ID.`)
  }

  const exists = await matchExists(matchId)
  if (exists && !overwrite) {
    throw new ParseError(
      "ALREADY_PARSED",
      `Match ${String(matchId)} is already in the database.`,
    )
  }

  // Fetch and validate before touching anything, so a bad payload can never
  // leave an existing match stripped of its players.
  const { raw, match } = await getMatch(matchId)

  if (raw.version == null) {
    throw new ParseError(
      "UNPARSED",
      `OpenDota has not parsed match ${String(matchId)} yet. Try again in a few minutes.`,
    )
  }

  try {
    if (exists) {
      await deleteMatchChildren(matchId)
      await convertMatchDataToMatchTable(match, { upsert: true })
    } else {
      await convertMatchDataToMatchTable(match)
    }

    await convertMatchDataToMatchPlayersTable(match)
    await convertMatchDataToMatchDraftTable(match)
    await convertMatchDataToMatchObjectiveTable(match)
  } catch (error) {
    if (isPostgrestError(error) && error.code === FOREIGN_KEY_VIOLATION) {
      throw new ParseError(
        "UNKNOWN_TEAM",
        `Match ${String(matchId)} references a team that is not in the database yet. Add the team first, then parse again.`,
      )
    }
    // The existence check above is not atomic with the insert, so a concurrent
    // request for the same match can get here instead of the early return.
    if (isPostgrestError(error) && error.code === UNIQUE_VIOLATION) {
      throw new ParseError(
        "ALREADY_PARSED",
        `Match ${String(matchId)} is already in the database.`,
      )
    }
    throw error
  }

  return {
    matchId,
    status: exists ? "overwritten" : "parsed",
    leagueId: match.leagueId,
    radiantTeamId: match.radiantTeam?.id ?? null,
    direTeamId: match.direTeam?.id ?? null,
    warnings: await getLeagueMembershipWarnings(match),
  }
}
