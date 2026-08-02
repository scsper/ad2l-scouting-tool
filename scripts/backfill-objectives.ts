/**
 * Backfill match objectives (match_objective rows, plus match.patch and
 * match.objectives_parsed) by re-fetching each match from OpenDota.
 *
 * Usage:
 *   npm run backfill-objectives -- --db --dry-run   # report what would change
 *   npm run backfill-objectives -- --db             # write to the database
 *   npm run backfill-objectives -- path/to/ids.txt  # restrict to IDs in a file
 *
 * File format: one match ID per line; blank and non-numeric lines are skipped.
 *
 * The FALSE/TRUE distinction on `match.objectives_parsed` is the point of this
 * script, exactly as NULL-vs-[] is for backfill-ward-placements. A match whose
 * replay OpenDota never parsed is left FALSE with no rows, so fall rates can
 * exclude it from the denominator. A failed fetch must never be recorded as
 * "parsed, nothing was destroyed" — that would claim every building survived.
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
 * Matches that have never been objective-parsed.
 *
 * Paged via `selectAll`: PostgREST truncates an unbounded select at 1000 rows
 * and reports a normal 200, so an unpaged sweep over 355 matches would look
 * complete while silently skipping none today and plenty once the table grows.
 */
async function getMatchIdsNeedingBackfill(): Promise<Set<number>> {
  const rows = await selectAll<{ id: number }>((from, to) =>
    supabase
      .from("match")
      .select("id")
      .eq("objectives_parsed", false)
      .range(from, to),
  )
  return new Set(rows.map(r => r.id))
}

type BackfillResult = {
  objectives: number
  towers: number
  parsed: boolean
  patch: number | null
}

async function backfillMatch(
  matchId: number,
  dryRun: boolean,
): Promise<BackfillResult> {
  const { match } = await getMatch(matchId)
  const objectives = match.objectives
  const towers = (objectives ?? []).filter(
    o => o.type === "building_kill" && (o.key ?? "").includes("tower"),
  ).length

  if (dryRun) {
    return {
      objectives: objectives?.length ?? 0,
      towers,
      parsed: objectives !== null,
      patch: match.patch,
    }
  }

  // Replace rather than append, so re-running the script is safe. Supabase has
  // no transactions; deleting first keeps a duplicate insert from doubling every
  // count if a previous run died mid-match.
  const { error: deleteError } = await supabase
    .from("match_objective")
    .delete()
    .eq("match_id", matchId)
  if (deleteError) throw new Error(deleteError.message)

  if (objectives !== null && objectives.length > 0) {
    const { error } = await supabase.from("match_objective").insert(objectives)
    if (error) throw new Error(error.message)
  }

  // The flag is written last: if the insert failed above we threw, and the match
  // stays FALSE rather than claiming a parse that did not land.
  const { error: matchError } = await supabase
    .from("match")
    .update({ patch: match.patch, objectives_parsed: objectives !== null })
    .eq("id", matchId)
  if (matchError) throw new Error(matchError.message)

  return {
    objectives: objectives?.length ?? 0,
    towers,
    parsed: objectives !== null,
    patch: match.patch,
  }
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
    console.log(
      `Found ${String(matchIds.length)} match(es) needing objective backfill.`,
    )
  } else {
    const filePath = fileArg
      ? path.resolve(process.cwd(), fileArg)
      : DEFAULT_MATCH_IDS_FILE
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`)
      console.error(
        "Usage: npx tsx scripts/backfill-objectives.ts [file.txt] | --db [--dry-run]",
      )
      process.exit(1)
    }
    const fromFile = getMatchIdsFromFile(filePath)
    const needingBackfill = await getMatchIdsNeedingBackfill()
    matchIds = fromFile.filter(id => needingBackfill.has(id))
    console.log(
      `Loaded ${String(fromFile.length)} match ID(s) from ${path.basename(filePath)}; ${String(matchIds.length)} need objective backfill.`,
    )
  }

  if (matchIds.length === 0) {
    console.log("No match IDs to process.")
    return
  }

  if (dryRun) console.log("DRY RUN — no writes will be made.\n")

  let totalObjectives = 0
  let totalTowers = 0
  let unparsed = 0
  const failed: number[] = []

  for (let i = 0; i < matchIds.length; i++) {
    const matchId = matchIds[i]
    const label = `[${String(i + 1)}/${String(matchIds.length)}]`
    try {
      const result = await backfillMatch(matchId, dryRun)
      totalObjectives += result.objectives
      totalTowers += result.towers
      if (!result.parsed) unparsed += 1
      console.log(
        `${label} Match ${String(matchId)}: ${String(result.objectives)} objectives (${String(result.towers)} towers), patch ${String(result.patch ?? "unknown")}` +
          (result.parsed ? "" : " — replay not parsed, left unparsed"),
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
    `Objectives ${dryRun ? "that would be written" : "written"}: ${String(totalObjectives)} (${String(totalTowers)} tower kills), matches left unparsed: ${String(unparsed)}, failed: ${String(failed.length)}.`,
  )
  // Named explicitly so a partial backfill cannot masquerade as a complete one —
  // these matches stay out of every fall-rate denominator.
  if (failed.length > 0) {
    console.log(`Failed match IDs: ${failed.join(", ")}`)
  }
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
