/**
 * Replace all database references from one OpenDota team id to another.
 *
 * Updates:
 *   - match: winning_team_id, radiant_team_id, dire_team_id
 *   - match_player.team_id
 *   - match_draft.team_id
 *   - player.team_id
 *   - league_teams.team_id (merges with existing row if the league already lists the new team)
 *   - roster_member.team_id (merges the same way when someone is on both rosters)
 *   - team: the old row is deleted once nothing references it; the new row is
 *     created from it when missing, so a placeholder→real swap needs no
 *     pre-existing target row
 *
 * Usage:
 *   npm run replace-team-id -- --from 15017 --to 6614847 --dry-run
 *   npm run replace-team-id -- --from 15017 --to 6614847
 *
 * Env: SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const dryRun = process.argv.includes("--dry-run")

function readIdFlag(flag: "--from" | "--to"): number {
  const index = process.argv.indexOf(flag)
  const value = index === -1 ? NaN : parseInt(process.argv[index + 1] ?? "", 10)
  if (Number.isNaN(value)) {
    console.error(`Missing or non-numeric ${flag} <teamId>`)
    process.exit(1)
  }
  return value
}

const FROM_TEAM_ID = readIdFlag("--from")
const TO_TEAM_ID = readIdFlag("--to")

async function countMatchColumn(
  column: "winning_team_id" | "radiant_team_id" | "dire_team_id",
): Promise<number> {
  const { count, error } = await supabase
    .from("match")
    .select("*", { count: "exact", head: true })
    .eq(column, FROM_TEAM_ID)
  if (error) throw error
  return count ?? 0
}

async function replaceMatchColumn(
  column: "winning_team_id" | "radiant_team_id" | "dire_team_id",
): Promise<number> {
  const { data, error } = await supabase
    .from("match")
    .update({ [column]: TO_TEAM_ID })
    .eq(column, FROM_TEAM_ID)
    .select("id")
  if (error) throw error
  return data.length
}

async function replaceMatchPlayers(): Promise<number> {
  const { data, error } = await supabase
    .from("match_player")
    .update({ team_id: TO_TEAM_ID })
    .eq("team_id", FROM_TEAM_ID)
    .select("match_id")
  if (error) throw error
  return data.length
}

async function replaceMatchDrafts(): Promise<number> {
  const { data, error } = await supabase
    .from("match_draft")
    .update({ team_id: TO_TEAM_ID })
    .eq("team_id", FROM_TEAM_ID)
    .select("match_id")
  if (error) throw error
  return data.length
}

async function replacePlayers(): Promise<number> {
  const { data, error } = await supabase
    .from("player")
    .update({ team_id: TO_TEAM_ID })
    .eq("team_id", FROM_TEAM_ID)
    .select("id")
  if (error) throw error
  return data.length
}

/**
 * For each league that linked the old team, either update team_id or remove the duplicate row
 * if that league already had the new team id.
 */
async function replaceLeagueTeams(): Promise<{
  updated: number
  removedDuplicates: number
}> {
  const { data: oldRows, error: fetchError } = await supabase
    .from("league_teams")
    .select("league_id")
    .eq("team_id", FROM_TEAM_ID)

  if (fetchError) throw fetchError

  let updated = 0
  let removedDuplicates = 0

  for (const row of oldRows) {
    const leagueId = row.league_id as number

    const { data: newExists, error: newErr } = await supabase
      .from("league_teams")
      .select("league_id")
      .eq("league_id", leagueId)
      .eq("team_id", TO_TEAM_ID)
      .maybeSingle()

    if (newErr) throw newErr

    if (newExists) {
      if (dryRun) {
        removedDuplicates += 1
        continue
      }
      const { error: delErr } = await supabase
        .from("league_teams")
        .delete()
        .eq("league_id", leagueId)
        .eq("team_id", FROM_TEAM_ID)
      if (delErr) throw delErr
      removedDuplicates += 1
    } else {
      if (dryRun) {
        updated += 1
        continue
      }
      const { error: upErr } = await supabase
        .from("league_teams")
        .update({ team_id: TO_TEAM_ID })
        .eq("league_id", leagueId)
        .eq("team_id", FROM_TEAM_ID)
      if (upErr) throw upErr
      updated += 1
    }
  }

  return { updated, removedDuplicates }
}

/**
 * Same shape as replaceLeagueTeams: move each membership, unless the person is
 * already on the new team's roster for that league — then the old row is the
 * duplicate and is dropped.
 */
async function replaceRosterMembers(): Promise<{
  updated: number
  removedDuplicates: number
}> {
  const { data: oldRows, error: fetchError } = await supabase
    .from("roster_member")
    .select("league_id, player_id")
    .eq("team_id", FROM_TEAM_ID)

  if (fetchError) throw fetchError

  let updated = 0
  let removedDuplicates = 0

  for (const row of oldRows) {
    const leagueId = row.league_id as number
    const playerId = row.player_id as number

    const { data: newExists, error: newErr } = await supabase
      .from("roster_member")
      .select("player_id")
      .eq("league_id", leagueId)
      .eq("team_id", TO_TEAM_ID)
      .eq("player_id", playerId)
      .maybeSingle()

    if (newErr) throw newErr

    if (dryRun) {
      if (newExists) removedDuplicates += 1
      else updated += 1
      continue
    }

    if (newExists) {
      const { error: delErr } = await supabase
        .from("roster_member")
        .delete()
        .eq("league_id", leagueId)
        .eq("team_id", FROM_TEAM_ID)
        .eq("player_id", playerId)
      if (delErr) throw delErr
      removedDuplicates += 1
    } else {
      const { error: upErr } = await supabase
        .from("roster_member")
        .update({ team_id: TO_TEAM_ID })
        .eq("league_id", leagueId)
        .eq("team_id", FROM_TEAM_ID)
        .eq("player_id", playerId)
      if (upErr) throw upErr
      updated += 1
    }
  }

  return { updated, removedDuplicates }
}

async function getTeamRow(
  id: number,
): Promise<{ id: number; name: string } | null> {
  const result = await supabase
    .from("team")
    .select("id, name")
    .eq("id", id)
    .maybeSingle()
  if (result.error) throw result.error
  return result.data as { id: number; name: string } | null
}

/**
 * The target row must exist before any child row points at it. It inherits the
 * old name only when the new id is genuinely absent; an existing team keeps its
 * stored name, same as `addTeamToLeague`.
 */
async function ensureTargetTeamRow(): Promise<void> {
  const toTeam = await getTeamRow(TO_TEAM_ID)
  if (toTeam) {
    console.log(
      `team: ${String(TO_TEAM_ID)} ("${toTeam.name}") already exists, keeping its name.`,
    )
    return
  }
  const fromTeam = await getTeamRow(FROM_TEAM_ID)
  if (!fromTeam)
    throw new Error(
      "Neither team row exists — nothing to carry the name over from",
    )
  const { error } = await supabase
    .from("team")
    .insert({ id: TO_TEAM_ID, name: fromTeam.name })
  if (error) throw error
  console.log(`team: created ${String(TO_TEAM_ID)} ("${fromTeam.name}").`)
}

/**
 * Once every reference has moved, the old `team` row is unreachable clutter —
 * placeholder rows especially shouldn't outlive the swap.
 */
async function deleteOldTeamRow(): Promise<void> {
  const fromTeam = await getTeamRow(FROM_TEAM_ID)
  if (!fromTeam) return
  const { error } = await supabase.from("team").delete().eq("id", FROM_TEAM_ID)
  if (error) throw error
  console.log(`team: deleted ${String(FROM_TEAM_ID)} ("${fromTeam.name}").`)
}

async function main() {
  if (!SUPABASE_DOTA2_URL || !SUPABASE_DOTA2_SECRET_KEY) {
    console.error("Set SUPABASE_DOTA2_URL and SUPABASE_DOTA2_SECRET_KEY")
    process.exit(1)
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}Replacing team_id ${String(FROM_TEAM_ID)} → ${String(TO_TEAM_ID)}\n`,
  )

  const w = await countMatchColumn("winning_team_id")
  const r = await countMatchColumn("radiant_team_id")
  const d = await countMatchColumn("dire_team_id")

  const { count: mp } = await supabase
    .from("match_player")
    .select("*", { count: "exact", head: true })
    .eq("team_id", FROM_TEAM_ID)
  const { count: md } = await supabase
    .from("match_draft")
    .select("*", { count: "exact", head: true })
    .eq("team_id", FROM_TEAM_ID)
  const { count: pl } = await supabase
    .from("player")
    .select("*", { count: "exact", head: true })
    .eq("team_id", FROM_TEAM_ID)
  const { count: lt } = await supabase
    .from("league_teams")
    .select("*", { count: "exact", head: true })
    .eq("team_id", FROM_TEAM_ID)
  const { count: rm } = await supabase
    .from("roster_member")
    .select("*", { count: "exact", head: true })
    .eq("team_id", FROM_TEAM_ID)

  console.log("Rows to touch (approximate):")
  console.log(`  match.winning_team_id:   ${String(w)}`)
  console.log(`  match.radiant_team_id:   ${String(r)}`)
  console.log(`  match.dire_team_id:      ${String(d)}`)
  console.log(`  match_player.team_id:    ${String(mp ?? 0)}`)
  console.log(`  match_draft.team_id:     ${String(md ?? 0)}`)
  console.log(`  player.team_id:          ${String(pl ?? 0)}`)
  console.log(`  league_teams.team_id:    ${String(lt ?? 0)}`)
  console.log(`  roster_member.team_id:   ${String(rm ?? 0)}`)

  if (dryRun) {
    const ltResult = await replaceLeagueTeams()
    console.log(
      `\n[dry-run] league_teams would update ${String(ltResult.updated)} row(s), remove ${String(ltResult.removedDuplicates)} duplicate(s).`,
    )
    const rmResult = await replaceRosterMembers()
    console.log(
      `[dry-run] roster_member would update ${String(rmResult.updated)} row(s), remove ${String(rmResult.removedDuplicates)} duplicate(s).`,
    )
    console.log("\nDry run complete (no writes).")
    return
  }

  await ensureTargetTeamRow()

  let n = 0
  n += await replaceMatchColumn("winning_team_id")
  n += await replaceMatchColumn("radiant_team_id")
  n += await replaceMatchColumn("dire_team_id")
  console.log(
    `\nmatch: ${String(n)} cell(s) updated across winning/radiant/dire.`,
  )

  const mpU = await replaceMatchPlayers()
  console.log(`match_player: ${String(mpU)} row(s) updated.`)

  const mdU = await replaceMatchDrafts()
  console.log(`match_draft: ${String(mdU)} row(s) updated.`)

  const plU = await replacePlayers()
  console.log(`player: ${String(plU)} row(s) updated.`)

  const { updated: ltU, removedDuplicates: ltD } = await replaceLeagueTeams()
  console.log(
    `league_teams: ${String(ltU)} row(s) updated, ${String(ltD)} duplicate row(s) removed.`,
  )

  const { updated: rmU, removedDuplicates: rmD } = await replaceRosterMembers()
  console.log(
    `roster_member: ${String(rmU)} row(s) updated, ${String(rmD)} duplicate row(s) removed.`,
  )

  await deleteOldTeamRow()

  console.log("\nDone.")
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
