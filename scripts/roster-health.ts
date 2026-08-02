/**
 * Roster health report — a worklist for the one-time cleanup after the
 * roster_member backfill.
 *
 * The backfill fanned each old `player` row out across every league its team
 * plays in, reproducing the old "one roster, all leagues" behaviour. That seeds
 * rows that are knowingly wrong for a given season (Alca is on Sharkhorse's S47
 * roster but only played S46; Maroso is on the S46 roster but only played S47).
 * This finds them.
 *
 * Two signals per league+team:
 *   - registered but never played that league
 *   - played that league but isn't registered
 *
 * Read-only. It prints, it never writes — fix rosters in the UI, where you can
 * see the games alongside them.
 *
 * This is throwaway: delete it once the cleanup pass is done. The permanent
 * version of this signal is the Players tab, which shows stand-ins who played
 * and greys out roster members who didn't.
 *
 * Usage:
 *   npx tsx scripts/roster-health.ts             # every league
 *   npx tsx scripts/roster-health.ts 19554       # one league
 *
 * Env: SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** Private Steam profiles are ingested under this id and can't be identified. */
const ANONYMOUS_PLAYER_ID = 0

const leagueFilter = process.argv[2] ? parseInt(process.argv[2], 10) : null

type Appearance = { playerId: number; name: string; games: number }

/**
 * PostgREST caps a response at 1000 rows no matter what `limit` you ask for, and
 * says nothing about it. `match_player` is 3.5k rows, so reading it in one go
 * silently drops most of a player's games — a 19-game starter reads as 6 and
 * looks like an occasional stand-in. Page explicitly until short.
 */
const PAGE_SIZE = 1000

async function selectAll<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1)

    if (result.error) throw result.error

    const page = result.data as T[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

async function main(): Promise<void> {
  const [leagues, teams, rosterMembers, matches, matchPlayers] =
    await Promise.all([
      selectAll<{ id: number; name: string }>("league", "id, name"),
      selectAll<{ id: number; name: string }>("team", "id, name"),
      selectAll<{
        league_id: number
        team_id: number
        player_id: number
        role: string
        player: { name: string } | { name: string }[] | null
      }>("roster_member", "league_id, team_id, player_id, role, player(name)"),
      selectAll<{ id: number; league_id: number }>("match", "id, league_id"),
      selectAll<{
        match_id: number
        team_id: number | null
        player_id: number
        player_name: string | null
      }>("match_player", "match_id, team_id, player_id, player_name"),
    ])

  const leagueName = new Map(leagues.map(l => [l.id, l.name]))
  const teamName = new Map(teams.map(t => [t.id, t.name]))
  const matchLeague = new Map(matches.map(m => [m.id, m.league_id]))

  // key: `${leagueId}:${teamId}` -> playerId -> appearance
  const appearances = new Map<string, Map<number, Appearance>>()
  for (const row of matchPlayers) {
    const { player_id: playerId, team_id: teamId } = row
    if (teamId == null || playerId === ANONYMOUS_PLAYER_ID) continue

    const leagueId = matchLeague.get(row.match_id)
    if (leagueId == null) continue
    if (leagueFilter !== null && leagueId !== leagueFilter) continue

    const key = `${String(leagueId)}:${String(teamId)}`
    const byPlayer = appearances.get(key) ?? new Map<number, Appearance>()
    const existing = byPlayer.get(playerId)
    byPlayer.set(playerId, {
      playerId,
      name: row.player_name ?? String(playerId),
      games: (existing?.games ?? 0) + 1,
    })
    appearances.set(key, byPlayer)
  }

  const rosters = new Map<
    string,
    { playerId: number; name: string; role: string }[]
  >()
  for (const row of rosterMembers) {
    const leagueId = row.league_id
    if (leagueFilter !== null && leagueId !== leagueFilter) continue

    const key = `${String(leagueId)}:${String(row.team_id)}`
    const joined = Array.isArray(row.player) ? row.player[0] : row.player
    const members = rosters.get(key) ?? []
    members.push({
      playerId: row.player_id,
      name: joined?.name ?? String(row.player_id),
      role: row.role,
    })
    rosters.set(key, members)
  }

  const keys = [...new Set([...rosters.keys(), ...appearances.keys()])].sort()
  let flagged = 0

  for (const key of keys) {
    const [leagueIdRaw, teamIdRaw] = key.split(":")
    const leagueId = parseInt(leagueIdRaw, 10)
    const teamId = parseInt(teamIdRaw, 10)

    const members = rosters.get(key) ?? []
    const played = appearances.get(key) ?? new Map<number, Appearance>()

    // Nothing registered means "we don't know this team's roster", not that it's
    // wrong. Reporting all ten players as unregistered would be noise.
    if (members.length === 0) continue

    const registeredIds = new Set(members.map(m => m.playerId))
    const neverPlayed = members.filter(m => !played.has(m.playerId))
    const unregistered = [...played.values()]
      .filter(a => !registeredIds.has(a.playerId))
      .sort((a, b) => b.games - a.games)

    if (neverPlayed.length === 0 && unregistered.length === 0) continue
    flagged++

    console.log(
      `\n${teamName.get(teamId) ?? String(teamId)} — ${leagueName.get(leagueId) ?? String(leagueId)}`,
    )
    for (const member of neverPlayed) {
      console.log(`   registered, 0 games   ${member.name} (${member.role})`)
    }
    for (const appearance of unregistered) {
      console.log(
        `   played, unregistered  ${appearance.name} (${String(appearance.playerId)}) — ${String(appearance.games)} games`,
      )
    }
  }

  console.log(
    `\n${String(flagged)} of ${String(keys.length)} league+team rosters need review.`,
  )
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
