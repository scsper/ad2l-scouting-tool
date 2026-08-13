/**
 * Rewrite `match_player.player_name` to the pro handle for any player OpenDota
 * tracks as a pro. Existing rows hold whatever Steam persona the account had at
 * ingest time, so a pro who plays here shows up under a joke name — and under a
 * different one each week.
 *
 * This does not re-fetch matches. OpenDota's /api/proPlayers is one request that
 * returns every tracked pro, which is the same table the per-match `name` field
 * is populated from, so a single call covers the whole database.
 *
 * Usage:
 *   npm run backfill-pro-names              # apply
 *   npm run backfill-pro-names -- --dry-run # report what would change
 *
 * Env: SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const PRO_PLAYERS_URL = "https://api.opendota.com/api/proPlayers"
const PAGE_SIZE = 1000

type ProPlayer = { account_id: number; name: string | null }

/** account_id -> pro handle, for accounts that actually have one set. */
async function fetchProNames(): Promise<Map<number, string>> {
  const response = await fetch(PRO_PLAYERS_URL)
  if (!response.ok) {
    throw new Error(
      `OpenDota returned ${String(response.status)} ${response.statusText}`,
    )
  }

  const pros = (await response.json()) as ProPlayer[]
  const names = new Map<number, string>()
  for (const pro of pros) {
    const name = pro.name?.trim()
    if (pro.account_id && name) {
      names.set(pro.account_id, name)
    }
  }
  return names
}

/**
 * Every (player_id, player_name) pair on record. PostgREST caps an unbounded
 * select at 1000 rows, so page explicitly rather than trusting one `.select()`.
 */
async function fetchPlayerNames(): Promise<Map<number, Set<string | null>>> {
  const byPlayer = new Map<number, Set<string | null>>()

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("match_player")
      .select("player_id, player_name")
      .order("player_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      throw new Error(`Failed to read match_player: ${error.message}`)
    }

    const rows = data as { player_id: number; player_name: string | null }[]
    for (const row of rows) {
      const seen = byPlayer.get(row.player_id) ?? new Set<string | null>()
      seen.add(row.player_name)
      byPlayer.set(row.player_id, seen)
    }

    if (rows.length < PAGE_SIZE) break
  }

  return byPlayer
}

async function main() {
  if (!SUPABASE_DOTA2_URL || !SUPABASE_DOTA2_SECRET_KEY) {
    console.error("Set SUPABASE_DOTA2_URL and SUPABASE_DOTA2_SECRET_KEY")
    process.exit(1)
  }

  const dryRun = process.argv.includes("--dry-run")

  const proNames = await fetchProNames()
  console.log(
    `OpenDota lists ${String(proNames.size)} accounts with a pro handle.`,
  )

  const byPlayer = await fetchPlayerNames()
  console.log(
    `Found ${String(byPlayer.size)} distinct player(s) in match_player.`,
  )

  // Only players whose rows disagree with the pro handle need touching; a pro
  // whose persona already matches would just burn a write.
  const stale = [...byPlayer.entries()]
    .map(([playerId, names]) => ({
      playerId,
      names,
      proName: proNames.get(playerId),
    }))
    .filter(entry => entry.proName != null)
    .filter(entry => [...entry.names].some(name => name !== entry.proName))

  if (stale.length === 0) {
    console.log(
      "No rows to update — every pro already stored under their pro handle.",
    )
    return
  }

  let updated = 0
  let errors = 0

  for (const { playerId, names, proName } of stale) {
    const previous = [...names].map(n => n ?? "(none)").join(", ")
    const rename = `${String(playerId)}: ${previous} -> ${proName ?? ""}`
    if (dryRun) {
      console.log(`[dry-run] ${rename}`)
      continue
    }

    const { data, error } = await supabase
      .from("match_player")
      .update({ player_name: proName })
      .eq("player_id", playerId)
      .select("match_id")

    if (error) {
      errors += 1
      console.error(`${String(playerId)}: ${error.message}`)
      continue
    }

    const rows = data.length
    updated += rows
    console.log(`${rename} (${String(rows)} row(s))`)
  }

  console.log("\nDone.")
  if (dryRun) {
    console.log(
      `${String(stale.length)} player(s) would be renamed. Re-run without --dry-run to apply.`,
    )
  } else {
    console.log(
      `Renamed ${String(stale.length)} player(s) across ${String(updated)} row(s), errors: ${String(errors)}.`,
    )
  }
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
