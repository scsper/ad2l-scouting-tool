/**
 * Replace all database references from one OpenDota team id to another.
 *
 * Updates:
 *   - match: winning_team_id, radiant_team_id, dire_team_id
 *   - match_player.team_id
 *   - match_draft.team_id
 *   - player.team_id
 *   - league_teams.team_id (merges with existing row if the league already lists the new team)
 *
 * Usage:
 *   npx tsx scripts/replace-team-id.ts           # apply changes
 *   npx tsx scripts/replace-team-id.ts --dry-run # print counts only
 *
 * Env: SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const FROM_TEAM_ID = 8336097
const TO_TEAM_ID = 9186949

const dryRun = process.argv.includes("--dry-run")

async function countMatchColumn(column: "winning_team_id" | "radiant_team_id" | "dire_team_id"): Promise<number> {
  const { count, error } = await supabase
    .from("match")
    .select("*", { count: "exact", head: true })
    .eq(column, FROM_TEAM_ID)
  if (error) throw error
  return count ?? 0
}

async function replaceMatchColumn(column: "winning_team_id" | "radiant_team_id" | "dire_team_id"): Promise<number> {
  const { data, error } = await supabase
    .from("match")
    .update({ [column]: TO_TEAM_ID })
    .eq(column, FROM_TEAM_ID)
    .select("id")
  if (error) throw error
  return data?.length ?? 0
}

async function replaceMatchPlayers(): Promise<number> {
  const { data, error } = await supabase
    .from("match_player")
    .update({ team_id: TO_TEAM_ID })
    .eq("team_id", FROM_TEAM_ID)
    .select("match_id")
  if (error) throw error
  return data?.length ?? 0
}

async function replaceMatchDrafts(): Promise<number> {
  const { data, error } = await supabase
    .from("match_draft")
    .update({ team_id: TO_TEAM_ID })
    .eq("team_id", FROM_TEAM_ID)
    .select("match_id")
  if (error) throw error
  return data?.length ?? 0
}

async function replacePlayers(): Promise<number> {
  const { data, error } = await supabase
    .from("player")
    .update({ team_id: TO_TEAM_ID })
    .eq("team_id", FROM_TEAM_ID)
    .select("id")
  if (error) throw error
  return data?.length ?? 0
}

/**
 * For each league that linked the old team, either update team_id or remove the duplicate row
 * if that league already had the new team id.
 */
async function replaceLeagueTeams(): Promise<{ updated: number; removedDuplicates: number }> {
  const { data: oldRows, error: fetchError } = await supabase
    .from("league_teams")
    .select("league_id")
    .eq("team_id", FROM_TEAM_ID)

  if (fetchError) throw fetchError

  let updated = 0
  let removedDuplicates = 0

  for (const row of oldRows ?? []) {
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

async function main() {
  if (!SUPABASE_DOTA2_URL || !SUPABASE_DOTA2_SECRET_KEY) {
    console.error("Set SUPABASE_DOTA2_URL and SUPABASE_DOTA2_SECRET_KEY")
    process.exit(1)
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}Replacing team_id ${FROM_TEAM_ID} → ${TO_TEAM_ID}\n`,
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

  console.log("Rows to touch (approximate):")
  console.log(`  match.winning_team_id:   ${w}`)
  console.log(`  match.radiant_team_id:   ${r}`)
  console.log(`  match.dire_team_id:      ${d}`)
  console.log(`  match_player.team_id:    ${mp ?? 0}`)
  console.log(`  match_draft.team_id:     ${md ?? 0}`)
  console.log(`  player.team_id:          ${pl ?? 0}`)
  console.log(`  league_teams.team_id:    ${lt ?? 0}`)

  if (dryRun) {
    const ltResult = await replaceLeagueTeams()
    console.log(
      `\n[dry-run] league_teams would update ${ltResult.updated} row(s), remove ${ltResult.removedDuplicates} duplicate(s).`,
    )
    console.log("\nDry run complete (no writes).")
    return
  }

  let n = 0
  n += await replaceMatchColumn("winning_team_id")
  n += await replaceMatchColumn("radiant_team_id")
  n += await replaceMatchColumn("dire_team_id")
  console.log(`\nmatch: ${n} cell(s) updated across winning/radiant/dire.`)

  const mpU = await replaceMatchPlayers()
  console.log(`match_player: ${mpU} row(s) updated.`)

  const mdU = await replaceMatchDrafts()
  console.log(`match_draft: ${mdU} row(s) updated.`)

  const plU = await replacePlayers()
  console.log(`player: ${plU} row(s) updated.`)

  const { updated: ltU, removedDuplicates: ltD } = await replaceLeagueTeams()
  console.log(`league_teams: ${ltU} row(s) updated, ${ltD} duplicate row(s) removed.`)

  console.log("\nDone.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
