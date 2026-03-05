/**
 * Backfill 10-minute lane stats (gold_at_10, xp_at_10, lh_at_10, denies_at_10)
 * for existing match_player rows by re-fetching each match from OpenDota and
 * updating the database.
 *
 * Usage:
 *   npm run backfill-lanes                    # use scripts/match-ids-to-parse.txt
 *   npm run backfill-lanes -- path/to/ids.txt  # use custom file
 *   npm run backfill-lanes -- --db             # use all match_id from match_player table
 *
 * File format: one match ID per line; blank and non-numeric lines are skipped.
 *
 * Env: SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, OPENDOTA_API_TOKEN (optional)
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"
import { getMatch } from "./match-operations"
import type { Match } from "./match-operations"

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
    .map((line) => line.trim())
    .filter((line) => line !== "" && !Number.isNaN(Number(line)))
    .map(Number)
}

/** Match IDs that have at least one match_player row missing 10-min data (gold_at_10 IS NULL). */
async function getMatchIdsNeedingBackfill(): Promise<Set<number>> {
  const { data, error } = await supabase
    .from("match_player")
    .select("match_id")
    .is("gold_at_10", null)
  if (error) {
    throw new Error(`Failed to fetch match IDs: ${error.message}`)
  }
  return new Set((data ?? []).map((r: { match_id: number }) => r.match_id))
}

async function getMatchIdsFromDb(): Promise<number[]> {
  const ids = await getMatchIdsNeedingBackfill()
  return [...ids].sort((a, b) => b - a)
}

async function backfillMatch(matchId: number): Promise<{ updated: number; noData: number }> {
  const response = await getMatch(matchId)
  const match: Match | undefined = response?.data?.match

  if (!match?.players?.length) {
    return { updated: 0, noData: 0 }
  }

  let updated = 0
  let noData = 0
  for (const player of match.players) {
    const goldAt10 = player.goldAt10 ?? null
    const xpAt10 = player.xpAt10 ?? null
    const lhAt10 = player.lastHitsAt10 ?? null
    const deniesAt10 = player.deniesAt10 ?? null
    const has10m = goldAt10 != null || xpAt10 != null || lhAt10 != null || deniesAt10 != null
    if (!has10m) noData += 1

    const { error } = await supabase
      .from("match_player")
      .update({
        gold_at_10: goldAt10,
        xp_at_10: xpAt10,
        lh_at_10: lhAt10,
        denies_at_10: deniesAt10,
      })
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
    console.log(`Found ${matchIds.length} match(es) in DB.`)
  } else {
    const filePath = fileArg ? path.resolve(process.cwd(), fileArg) : DEFAULT_MATCH_IDS_FILE
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`)
      console.error("Usage: npx tsx scripts/backfill-lanes.ts [file.txt] | --db")
      process.exit(1)
    }
    const fromFile = getMatchIdsFromFile(filePath)
    const needingBackfill = await getMatchIdsNeedingBackfill()
    matchIds = fromFile.filter((id) => needingBackfill.has(id))
    console.log(`Loaded ${fromFile.length} match ID(s) from ${path.basename(filePath)}; ${matchIds.length} need lane data backfill.`)
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
      console.log(`[${i + 1}/${matchIds.length}] Match ${matchId}: ${updated} rows updated${noData > 0 ? `, ${noData} player(s) had no 10m data` : ""}.`)
    } catch (e) {
      errors += 1
      console.error(`[${i + 1}/${matchIds.length}] Match ${matchId} failed:`, e)
    }

    if (i < matchIds.length - 1) {
      await new Promise((r) => setTimeout(r, OPEN_DOTA_DELAY_MS))
    }
  }

  console.log("\nDone.")
  console.log(`Updated: ${totalUpdated} player rows, players with no 10m data: ${totalNoData}, errors: ${errors}.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
