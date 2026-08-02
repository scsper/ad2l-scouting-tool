/**
 * Backfill ward placements (match_player.wards) for existing rows by re-fetching
 * each match from OpenDota.
 *
 * Distinct from `backfill-wards`, which fills the obs_placed/sen_placed counts
 * on the same table. This one fills the JSONB blob of individual placements
 * that the Wards tab plots.
 *
 * Usage:
 *   npm run backfill-ward-placements -- --db --dry-run   # report what would change
 *   npm run backfill-ward-placements -- --db             # write to the database
 *   npm run backfill-ward-placements -- path/to/ids.txt  # restrict to IDs in a file
 *
 * File format: one match ID per line; blank and non-numeric lines are skipped.
 *
 * The NULL/[] distinction is the point of this script and is preserved carefully:
 * a player who placed nothing gets `[]`, and a match whose replay OpenDota never
 * parsed is left NULL so aggregates can exclude it from the denominator. A
 * failed fetch must never be recorded as "no wards".
 *
 * Env: SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, OPENDOTA_API_TOKEN (optional)
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"
import { getMatch } from "../server/match-operations"
import { selectAll } from "../server/select-all"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const DEFAULT_MATCH_IDS_FILE = path.join(__dirname, "match-ids-to-parse.txt")
const OPEN_DOTA_DELAY_MS = 1200

function getMatchIdsFromFile(filePath: string): number[] {
  const content = fs.readFileSync(filePath, "utf8")
  return content
    .split("\n")
    .map(line => line.trim())
    .filter(line => line !== "" && !Number.isNaN(Number(line)))
    .map(Number)
}

/**
 * Match IDs with at least one match_player row that has never been ward-parsed.
 *
 * Paged via `selectAll` deliberately. PostgREST caps an unbounded select at 1000
 * rows and signals nothing — a normal 200 with a short array. `wards` starts
 * NULL on every one of the ~3520 match_player rows, so an unpaged version of
 * this query matches all of them, returns the first 1000, and reports roughly
 * 100 matches instead of 355. The script would then print "Done" having silently
 * skipped most of the table.
 */
async function getMatchIdsNeedingBackfill(): Promise<Set<number>> {
  const rows = await selectAll<{ match_id: number }>((from, to) =>
    supabase
      .from("match_player")
      .select("match_id")
      .is("wards", null)
      .range(from, to),
  )
  return new Set(rows.map(r => r.match_id))
}

/** Rows still needing backfill, so the sweep can be checked against a real count. */
async function countRowsNeedingBackfill(): Promise<number> {
  const { count, error } = await supabase
    .from("match_player")
    .select("*", { count: "exact", head: true })
    .is("wards", null)
  if (error) {
    throw new Error(`Failed to count rows: ${error.message}`)
  }
  return count ?? 0
}

type BackfillResult = { updated: number; wards: number; unparsed: number }

async function backfillMatch(
  matchId: number,
  dryRun: boolean,
): Promise<BackfillResult> {
  const { match } = await getMatch(matchId)

  let updated = 0
  let wards = 0
  let unparsed = 0

  for (const player of match.players) {
    // No ward logs at all means the replay was never parsed. Leave the column
    // NULL rather than writing [], which would claim the player warded zero
    // times and quietly inflate every aggregate's denominator.
    if (player.wards === null) {
      unparsed += 1
      continue
    }

    wards += player.wards.length

    if (dryRun) {
      updated += 1
      continue
    }

    const { error } = await supabase
      .from("match_player")
      .update({ wards: player.wards })
      // (match_id, hero_id) is the effective key: player_id is 0 for anonymous
      // accounts, so it cannot identify a row. Same approach as backfill-lanes.
      .eq("match_id", matchId)
      .eq("hero_id", player.heroId)

    if (error) {
      console.error(
        `  [${String(matchId)}] hero_id ${String(player.heroId)}: ${error.message}`,
      )
    } else {
      updated += 1
    }
  }

  return { updated, wards, unparsed }
}

async function main() {
  if (!SUPABASE_DOTA2_URL || !SUPABASE_DOTA2_SECRET_KEY) {
    console.error("Set SUPABASE_DOTA2_URL and SUPABASE_DOTA2_SECRET_KEY")
    process.exit(1)
  }

  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const fileArg = args.find(a => !a.startsWith("--") && a !== "-d")
  const useDb = args.includes("--db") || args.includes("-d")

  let matchIds: number[]

  if (useDb) {
    console.log("Fetching match IDs from database...")
    matchIds = [...(await getMatchIdsNeedingBackfill())].sort((a, b) => b - a)
    const rowCount = await countRowsNeedingBackfill()
    console.log(
      `Found ${String(matchIds.length)} match(es) needing ward backfill, covering ${String(rowCount)} player row(s).`,
    )
    // A paginated sweep that ends up under one page is the signature of the
    // PostgREST row cap biting, so say it out loud rather than proceeding.
    if (matchIds.length * 10 < rowCount) {
      console.warn(
        `WARNING: ${String(matchIds.length)} matches cannot account for ${String(rowCount)} rows — the sweep looks truncated.`,
      )
    }
  } else {
    const filePath = fileArg
      ? path.resolve(process.cwd(), fileArg)
      : DEFAULT_MATCH_IDS_FILE
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`)
      console.error(
        "Usage: npx tsx scripts/backfill-ward-placements.ts [file.txt] | --db [--dry-run]",
      )
      process.exit(1)
    }
    const fromFile = getMatchIdsFromFile(filePath)
    const needingBackfill = await getMatchIdsNeedingBackfill()
    matchIds = fromFile.filter(id => needingBackfill.has(id))
    console.log(
      `Loaded ${String(fromFile.length)} match ID(s) from ${path.basename(filePath)}; ${String(matchIds.length)} need ward backfill.`,
    )
  }

  if (matchIds.length === 0) {
    console.log("No match IDs to process.")
    return
  }

  if (dryRun) console.log("DRY RUN — no writes will be made.\n")

  let totalUpdated = 0
  let totalWards = 0
  let totalUnparsed = 0
  const failed: number[] = []

  for (let i = 0; i < matchIds.length; i++) {
    const matchId = matchIds[i]
    const label = `[${String(i + 1)}/${String(matchIds.length)}]`
    try {
      const { updated, wards, unparsed } = await backfillMatch(matchId, dryRun)
      totalUpdated += updated
      totalWards += wards
      totalUnparsed += unparsed
      console.log(
        `${label} Match ${String(matchId)}: ${String(updated)} rows, ${String(wards)} wards` +
          (unparsed > 0
            ? `, ${String(unparsed)} player(s) left NULL (replay not parsed)`
            : ""),
      )
    } catch (e) {
      failed.push(matchId)
      console.error(`${label} Match ${String(matchId)} failed:`, e)
    }

    if (i < matchIds.length - 1) {
      await new Promise(r => setTimeout(r, OPEN_DOTA_DELAY_MS))
    }
  }

  console.log("\nDone.")
  console.log(
    `Rows ${dryRun ? "that would be updated" : "updated"}: ${String(totalUpdated)}, wards: ${String(totalWards)}, left NULL: ${String(totalUnparsed)}, failed matches: ${String(failed.length)}.`,
  )
  // Named explicitly so a silent partial backfill can't masquerade as a complete
  // one — these matches keep NULL wards and stay out of every aggregate.
  if (failed.length > 0) {
    console.log(`Failed match IDs: ${failed.join(", ")}`)
  }
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
