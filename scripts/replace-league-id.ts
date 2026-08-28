/**
 * Move a league — and everything scoped to it — to a new league id.
 *
 * Exists because a season's teams form before Valve issues the league ticket:
 * the league row gets created under a placeholder id so rosters can be set up,
 * and once real matches reveal the true id (parsing stamps `match.league_id`
 * straight from OpenDota's `leagueid`), the placeholder has to catch up.
 *
 * Updates:
 *   - league.id (insert new row, move children, delete old row — FK-safe order)
 *   - league_teams.league_id
 *   - roster_member.league_id
 *   - match.league_id
 *   - user_league_access.league_id
 *
 * Assumes the target id has no rows of its own yet (the placeholder→real case).
 * If matches were already parsed under the real id, `match` rows simply won't
 * need moving; a conflict anywhere else means both ids were populated in
 * parallel, and that merge is a decision for a human, not this script.
 *
 * Usage:
 *   npm run replace-league-id -- --from 48 --to 19850 --dry-run
 *   npm run replace-league-id -- --from 48 --to 19850
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
    console.error(`Missing or non-numeric ${flag} <leagueId>`)
    process.exit(1)
  }
  return value
}

const FROM_LEAGUE_ID = readIdFlag("--from")
const TO_LEAGUE_ID = readIdFlag("--to")

const CHILD_TABLES = [
  "league_teams",
  "roster_member",
  "match",
  "user_league_access",
] as const

async function countRows(table: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("league_id", FROM_LEAGUE_ID)
  if (error) throw error
  return count ?? 0
}

async function moveChildren(table: string): Promise<number> {
  const { data, error } = await supabase
    .from(table)
    .update({ league_id: TO_LEAGUE_ID })
    .eq("league_id", FROM_LEAGUE_ID)
    .select("league_id")
  if (error) throw error
  return (data as unknown[]).length
}

async function main() {
  if (!SUPABASE_DOTA2_URL || !SUPABASE_DOTA2_SECRET_KEY) {
    console.error("Set SUPABASE_DOTA2_URL and SUPABASE_DOTA2_SECRET_KEY")
    process.exit(1)
  }

  const fromResult = await supabase
    .from("league")
    .select("id, name")
    .eq("id", FROM_LEAGUE_ID)
    .maybeSingle()
  if (fromResult.error) throw fromResult.error
  const fromLeague = fromResult.data as { id: number; name: string } | null
  if (!fromLeague) {
    console.error(
      `No league row with id ${String(FROM_LEAGUE_ID)} — nothing to move.`,
    )
    process.exit(1)
  }

  const toResult = await supabase
    .from("league")
    .select("id, name")
    .eq("id", TO_LEAGUE_ID)
    .maybeSingle()
  if (toResult.error) throw toResult.error
  const toLeague = toResult.data as { id: number; name: string } | null

  console.log(
    `${dryRun ? "[dry-run] " : ""}Moving "${fromLeague.name}" ${String(FROM_LEAGUE_ID)} → ${String(TO_LEAGUE_ID)}\n`,
  )

  console.log("Rows to move:")
  for (const table of CHILD_TABLES) {
    console.log(`  ${table}.league_id: ${String(await countRows(table))}`)
  }

  if (dryRun) {
    console.log(
      toLeague
        ? `\nLeague ${String(TO_LEAGUE_ID)} ("${toLeague.name}") already exists — its row would be kept, the ${String(FROM_LEAGUE_ID)} row deleted.`
        : `\nLeague ${String(TO_LEAGUE_ID)} would be created as "${fromLeague.name}".`,
    )
    console.log("\nDry run complete (no writes).")
    return
  }

  if (!toLeague) {
    const { error } = await supabase
      .from("league")
      .insert({ id: TO_LEAGUE_ID, name: fromLeague.name })
    if (error) throw error
    console.log(
      `\nleague: created ${String(TO_LEAGUE_ID)} ("${fromLeague.name}").`,
    )
  } else {
    console.log(
      `\nleague: ${String(TO_LEAGUE_ID)} ("${toLeague.name}") already exists, keeping it.`,
    )
  }

  for (const table of CHILD_TABLES) {
    console.log(
      `${table}: ${String(await moveChildren(table))} row(s) updated.`,
    )
  }

  const { error: delErr } = await supabase
    .from("league")
    .delete()
    .eq("id", FROM_LEAGUE_ID)
  if (delErr) throw delErr
  console.log(`league: deleted ${String(FROM_LEAGUE_ID)}.`)

  console.log("\nDone.")
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
