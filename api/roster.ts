import { createClient } from "@supabase/supabase-js"
import type { RosterEntry } from "../types/db.js"
import { fetchAndStorePlayerStats } from "./player-pub-matches.js"
import { roleToPositions } from "../shared/roles.js"
import {
  requireScope,
  requireTeamAccess,
  respondToAccessError,
} from "../server/access.js"

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/**
 * Pub stats older than this are refetched when a player is added to a roster.
 * You scout the current season, so a player's S47-era pub history is the wrong
 * thing to show while prepping for S48.
 */
const PUB_STATS_STALE_AFTER_DAYS = 30

type CreateRosterMemberRequest = {
  league_id: number
  team_id: number
  player_id: number
  name: string
  role: string
  rank?: string | null
  original_rank?: string | null
  is_stand_in?: boolean
}

type CopyRosterRequest = {
  from_league_id: number
  league_id: number
  team_id: number
}

type RosterMemberRecord = {
  league_id: number
  team_id: number
  player_id: number
  role: string
  rank: string | null
  original_rank: string | null
  is_stand_in: boolean
  created_at: string
  updated_at: string
  player: { name: string } | { name: string }[] | null
}

function toRosterEntries(records: RosterMemberRecord[]): RosterEntry[] {
  return records.map(record => {
    const { player, ...member } = record
    const joined = Array.isArray(player) ? player[0] : player
    return { ...member, name: joined?.name ?? String(member.player_id) }
  })
}

async function getRoster(
  leagueId: number,
  teamId: number,
): Promise<RosterEntry[]> {
  const result = await supabase
    .from("roster_member")
    .select("*, player(name)")
    .eq("league_id", leagueId)
    .eq("team_id", teamId)

  if (result.error) {
    console.error("Error fetching roster:", result.error)
    throw result.error
  }

  return toRosterEntries(result.data as RosterMemberRecord[]).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
}

/**
 * A team that isn't in `league_teams` for this league can't have a roster there.
 * Client state is not a data-integrity mechanism, and this route is
 * unauthenticated, so the check belongs here as well as in the picker.
 */
async function assertTeamInLeague(
  leagueId: number,
  teamId: number,
): Promise<void> {
  const result = await supabase
    .from("league_teams")
    .select("team_id")
    .eq("league_id", leagueId)
    .eq("team_id", teamId)
    .maybeSingle()

  if (result.error) {
    console.error("Error checking league membership:", result.error)
    throw result.error
  }

  if (!result.data) {
    throw new Error("TEAM_NOT_IN_LEAGUE")
  }
}

async function hasFreshPubStats(playerId: number): Promise<boolean> {
  const result = await supabase
    .from("player_pub_match_stats")
    .select("created_at")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (result.error || !result.data) return false

  const { created_at } = result.data as { created_at: string }
  const ageMs = Date.now() - new Date(created_at).getTime()
  return ageMs < PUB_STATS_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000
}

/**
 * Adds someone to a roster. The person is upserted rather than inserted: a
 * player who left one roster keeps their row (and their pub match history), and
 * reappears constantly as a stand-in or on another team.
 *
 * The membership is upserted too. Status is not fixed for a season — a member
 * gets benched and starts subbing, a stand-in gets properly registered — and
 * remove-then-re-add was the only way to change one. A plain insert also meant
 * re-adding an existing member surfaced a primary key violation as an opaque
 * 500, which is the first thing you hit when you forget you already added them.
 */
async function createRosterMember(
  body: CreateRosterMemberRequest,
): Promise<RosterEntry> {
  await assertTeamInLeague(body.league_id, body.team_id)

  const playerResult = await supabase
    .from("player")
    .upsert(
      {
        id: body.player_id,
        name: body.name,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select()
    .single()

  if (playerResult.error) {
    console.error("Error upserting player:", playerResult.error)
    throw playerResult.error
  }

  const memberResult = await supabase
    .from("roster_member")
    .upsert(
      {
        league_id: body.league_id,
        team_id: body.team_id,
        player_id: body.player_id,
        role: body.role,
        rank: body.rank ?? null,
        original_rank: body.original_rank ?? null,
        is_stand_in: body.is_stand_in ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "league_id,team_id,player_id" },
    )
    .select("*, player(name)")
    .single()

  if (memberResult.error) {
    console.error("Error creating roster member:", memberResult.error)
    throw memberResult.error
  }

  // Refetch pub stats only if what's cached has gone stale. Don't fail the write
  // if Stratz is down or the token has expired — the roster row is the point.
  try {
    if (!(await hasFreshPubStats(body.player_id))) {
      await fetchAndStorePlayerStats(body.player_id, roleToPositions(body.role))
    }
  } catch (error) {
    console.error(
      `Failed to fetch pub match stats for player ${String(body.player_id)}:`,
      error,
    )
  }

  return toRosterEntries([memberResult.data as RosterMemberRecord])[0]
}

/**
 * Clones another league's roster for the same team. Rosters mostly carry over —
 * Sharkhorse kept 3 of 5 from S46 to S47 — so setting up a new season is
 * "copy, then swap the two who changed" rather than five fresh forms.
 */
async function copyRoster(body: CopyRosterRequest): Promise<RosterEntry[]> {
  await assertTeamInLeague(body.league_id, body.team_id)

  // Stand-ins are deliberately left behind. Copying is explicit rather than an
  // implicit inheritance so that a roster is asserted for the season it's used
  // in; an inherited stand-in nobody asserted is a claim that last season's
  // emergency sub is playing this week. The ones who recur cost 20 seconds to
  // re-add, and show up on their own as soon as they play a game.
  const source = (await getRoster(body.from_league_id, body.team_id)).filter(
    member => !member.is_stand_in,
  )
  if (source.length === 0) return []

  const result = await supabase
    .from("roster_member")
    .upsert(
      source.map(member => ({
        league_id: body.league_id,
        team_id: body.team_id,
        player_id: member.player_id,
        role: member.role,
        rank: member.rank,
        original_rank: member.original_rank,
      })),
      { onConflict: "league_id,team_id,player_id", ignoreDuplicates: true },
    )
    .select("*, player(name)")

  if (result.error) {
    console.error("Error copying roster:", result.error)
    throw result.error
  }

  return toRosterEntries(result.data as RosterMemberRecord[])
}

/**
 * Removes the membership row only. The person and their pub match history stay:
 * pub stats are expensive and fragile to rebuild, and leaving a roster is not
 * the same as ceasing to exist.
 */
async function deleteRosterMember(
  leagueId: number,
  teamId: number,
  playerId: number,
): Promise<void> {
  const result = await supabase
    .from("roster_member")
    .delete()
    .eq("league_id", leagueId)
    .eq("team_id", teamId)
    .eq("player_id", playerId)

  if (result.error) {
    console.error("Error deleting roster member:", result.error)
    throw result.error
  }
}

function parseId(value: string | undefined): number | null {
  if (!value) return null
  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) ? null : parsed
}

export default async function handler(
  req: {
    method: string
    body: CreateRosterMemberRequest & Partial<CopyRosterRequest>
    query: { leagueId?: string; teamId?: string; playerId?: string }
    headers: Record<string, string | string[] | undefined>
  },
  res: {
    status: (code: number) => { json: (data: unknown) => void }
  },
) {
  if (req.method === "GET") {
    const leagueId = parseId(req.query.leagueId)
    const teamId = parseId(req.query.teamId)

    if (leagueId === null || teamId === null) {
      res.status(400).json({ error: "leagueId and teamId are required" })
      return
    }

    try {
      const scope = await requireScope(req.headers.authorization)
      await requireTeamAccess(scope, leagueId, teamId)
      res.status(200).json(await getRoster(leagueId, teamId))
    } catch (error) {
      if (respondToAccessError(error, res)) return
      console.error("Error in handler:", error)
      res.status(500).json({ error: "Failed to fetch roster" })
    }
    return
  }

  if (req.method === "POST") {
    // A POST with no body at all would otherwise throw before any validation.
    const body = req.body as typeof req.body | undefined
    if (!body) {
      res.status(400).json({ error: "A request body is required" })
      return
    }

    // A `from_league_id` in the body means "clone that league's roster".
    if (body.from_league_id) {
      const { from_league_id, league_id, team_id } = body

      if (!league_id || !team_id) {
        res.status(400).json({ error: "league_id and team_id are required" })
        return
      }

      try {
        const scope = await requireScope(req.headers.authorization)
        // Both ends, because this route reads one league and writes another.
        // Checking only the destination would make it a way to read any team's
        // roster from a season the caller cannot otherwise open.
        await requireTeamAccess(scope, from_league_id, team_id)
        await requireTeamAccess(scope, league_id, team_id)
        const data = await copyRoster({ from_league_id, league_id, team_id })
        res.status(201).json(data)
      } catch (error) {
        if (respondToAccessError(error, res)) return
        if (error instanceof Error && error.message === "TEAM_NOT_IN_LEAGUE") {
          res.status(400).json({ error: "That team is not in this league" })
          return
        }
        console.error("Error in handler:", error)
        res.status(500).json({ error: "Failed to copy roster" })
      }
      return
    }

    const { league_id, team_id, player_id, name, role } = body

    if (!league_id || !team_id || !player_id || !name || !role) {
      res.status(400).json({
        error: "league_id, team_id, player_id, name, and role are required",
      })
      return
    }

    try {
      const scope = await requireScope(req.headers.authorization)
      await requireTeamAccess(scope, league_id, team_id)
      const data = await createRosterMember(body)
      res.status(201).json(data)
    } catch (error) {
      if (respondToAccessError(error, res)) return
      if (error instanceof Error && error.message === "TEAM_NOT_IN_LEAGUE") {
        res.status(400).json({ error: "That team is not in this league" })
        return
      }
      console.error("Error in handler:", error)
      res.status(500).json({ error: "Failed to add roster member" })
    }
    return
  }

  if (req.method === "DELETE") {
    const leagueId = parseId(req.query.leagueId)
    const teamId = parseId(req.query.teamId)
    const playerId = parseId(req.query.playerId)

    if (leagueId === null || teamId === null || playerId === null) {
      res
        .status(400)
        .json({ error: "leagueId, teamId, and playerId are required" })
      return
    }

    try {
      const scope = await requireScope(req.headers.authorization)
      await requireTeamAccess(scope, leagueId, teamId)
      await deleteRosterMember(leagueId, teamId, playerId)
      res.status(200).json({ success: true })
    } catch (error) {
      if (respondToAccessError(error, res)) return
      console.error("Error in handler:", error)
      res.status(500).json({ error: "Failed to remove roster member" })
    }
    return
  }

  res.status(405).json({ error: "Method not allowed" })
}
