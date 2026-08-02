/**
 * Backfill ward placement stats (obs_placed, sen_placed) for existing
 * match_player rows by re-fetching each match from OpenDota and updating the
 * database.
 *
 * Usage:
 *   npm run backfill-wards                     # use scripts/match-ids-to-parse.txt
 *   npm run backfill-wards -- path/to/ids.txt  # use custom file
 *   npm run backfill-wards -- --db             # use all match_id from match_player table
 *
 * File format: one match ID per line; blank and non-numeric lines are skipped.
 *
 * Safe to re-run: it only looks at rows where obs_placed IS NULL, so an
 * interrupted run picks up where it left off. Note that a handful of matches can
 * never be filled — the hand-entered ones OpenDota 404s (see
 * add-sharkhorse-vs-for-glort-s47-week3.ts) and any match without a parsed
 * replay. Those are re-attempted on every run and always fail; that's expected.
 *
 * Env: SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, OPENDOTA_API_TOKEN (optional)
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"
import { getMatch } from "../api/lib/match-operations"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const DEFAULT_MATCH_IDS_FILE = path.join(__dirname, "match-ids-to-parse.txt")
const OPEN_DOTA_DELAY_MS = 1200
/** PostgREST caps an unbounded select at 1000 rows, so pages have to be explicit. */
const PAGE_SIZE = 1000

function getMatchIdsFromFile(filePath: string): number[] {
  const content = fs.readFileSync(filePath, "utf8")
  return content
    .split("\n")
    .map(line => line.trim())
    .filter(line => line !== "" && !Number.isNaN(Number(line)))
    .map(Number)
}

/**
 * Match IDs with at least one match_player row missing ward data.
 *
 * Paged deliberately: on the first run every one of the ~3500 rows is null, and
 * an unpaged select would silently return only the first 1000 and report
 * success having skipped three quarters of the matches.
 */
async function getMatchIdsNeedingBackfill(): Promise<Set<number>> {
  const matchIds = new Set<number>()
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("match_player")
      .select("match_id")
      .is("obs_placed", null)
      .order("match_id", { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      throw new Error(`Failed to fetch match IDs: ${error.message}`)
    }
    const page = data ?? []
    for (const row of page as { match_id: number }[]) {
      matchIds.add(row.match_id)
    }
    if (page.length < PAGE_SIZE) break
  }
  return matchIds
}

async function getMatchIdsFromDb(): Promise<number[]> {
  const ids = await getMatchIdsNeedingBackfill()
  return [...ids].sort((a, b) => b - a)
}

async function backfillMatch(
  matchId: number,
): Promise<{ updated: number; noData: number }> {
  // `getMatch` throws on a missing or unfetchable match; the caller already logs
  // and continues per match, so let it propagate.
  const { match } = await getMatch(matchId)

  if (match.players.length === 0) {
    return { updated: 0, noData: 0 }
  }

  let updated = 0
  let noData = 0
  for (const player of match.players) {
    // Left as null, never coerced to 0: a match with no ward data must stay
    // distinguishable from a player who placed no wards, because the Players tab
    // skips nulls when averaging but counts real zeroes.
    const obsPlaced = player.obsPlaced
    const senPlaced = player.senPlaced
    if (obsPlaced == null && senPlaced == null) noData += 1

    const { error } = await supabase
      .from("match_player")
      .update({ obs_placed: obsPlaced, sen_placed: senPlaced })
      .eq("match_id", matchId)
      .eq("hero_id", player.heroId)

    if (error) {
      console.error(`  [${matchId}] hero_id ${player.heroId}: ${error.message}`)
    } else {
      updated += 1
    }
  }

  return { updated, noData }
}

async function main() {
  if (!SUPABASE_DOTA2_URL || !SUPABASE_DOTA2_SECRET_KEY) {
    console.error("Set SUPABASE_DOTA2_URL and SUPABASE_DOTA2_SECRET_KEY")
    process.exit(1)
  }

  const fileArg = process.argv[2]
  let matchIds: number[]

  if (fileArg === "--db" || fileArg === "-d") {
    console.log("Fetching match IDs from database...")
    matchIds = await getMatchIdsFromDb()
    console.log(`Found ${matchIds.length} match(es) needing ward data.`)
  } else {
    const filePath = fileArg
      ? path.resolve(process.cwd(), fileArg)
      : DEFAULT_MATCH_IDS_FILE
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`)
      console.error(
        "Usage: npx tsx scripts/backfill-wards.ts [file.txt] | --db",
      )
      process.exit(1)
    }
    const fromFile = getMatchIdsFromFile(filePath)
    const needingBackfill = await getMatchIdsNeedingBackfill()
    matchIds = fromFile.filter(id => needingBackfill.has(id))
    console.log(
      `Loaded ${fromFile.length} match ID(s) from ${path.basename(filePath)}; ${matchIds.length} need ward data backfill.`,
    )
  }

  if (matchIds.length === 0) {
    console.log("No match IDs to process.")
    return
  }

  let totalUpdated = 0
  let totalNoData = 0
  let errors = 0

  for (let i = 0; i < matchIds.length; i++) {
    const matchId = matchIds[i]
    try {
      const { updated, noData } = await backfillMatch(matchId)
      totalUpdated += updated
      totalNoData += noData
      console.log(
        `[${i + 1}/${matchIds.length}] Match ${matchId}: ${updated} rows updated${noData > 0 ? `, ${noData} player(s) had no ward data` : ""}.`,
      )
    } catch (e) {
      errors += 1
      console.error(`[${i + 1}/${matchIds.length}] Match ${matchId} failed:`, e)
    }

    if (i < matchIds.length - 1) {
      await new Promise(r => setTimeout(r, OPEN_DOTA_DELAY_MS))
    }
  }

  console.log("\nDone.")
  console.log(
    `Updated: ${totalUpdated} player rows, players with no ward data: ${totalNoData}, errors: ${errors}.`,
  )
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
