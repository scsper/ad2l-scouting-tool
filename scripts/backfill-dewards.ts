/**
 * Recompute reveal credit from locally archived replays, without replacing
 * other match data or downloading replays. Run add_deward_credit.sql first.
 *
 * npm run backfill-dewards -- --db [--dry-run]
 * npm run backfill-dewards -- path/to/ids.txt [--dry-run]
 *
 * Needs SUPABASE_DOTA2_URL and SUPABASE_DOTA2_SECRET_KEY. REPLAY_ARCHIVE_DIR
 * defaults to ~/dota-replay-archive, as in parse-replays. Missing archives are
 * reported and remain unknown. --dry-run works before the migration too.
 */
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { gunzipSync } from "node:zlib"
import { createClient } from "@supabase/supabase-js"
import { extractReplayDewards } from "../server/replay-dewards.js"
import { storeDewards } from "../server/store-dewards.js"
import { selectAll } from "../server/select-all.js"

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const sources = args.filter(arg => arg !== "--dry-run")
  if (
    sources.length !== 1 ||
    (sources[0].startsWith("--") && sources[0] !== "--db")
  ) {
    throw new Error(
      "Usage: npm run backfill-dewards -- --db | path/to/ids.txt [--dry-run]",
    )
  }
  const source = sources[0]
  const requested =
    source === "--db"
      ? null
      : new Set(
          readFileSync(source, "utf8")
            .split(/\r?\n/)
            .filter(line => line.trim() !== "")
            .map(line => {
              const id = Number(line)
              if (!Number.isSafeInteger(id) || id <= 0) {
                throw new Error(`Invalid match ID: ${line}`)
              }
              return id
            }),
        )
  const supabase = createClient(
    process.env.SUPABASE_DOTA2_URL ?? "",
    process.env.SUPABASE_DOTA2_SECRET_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const archive =
    process.env.REPLAY_ARCHIVE_DIR ?? join(homedir(), "dota-replay-archive")
  const rows = await selectAll<{ match_id: number; hero_id: number }>(
    (from, to) =>
      supabase
        .from("match_player")
        .select("match_id, hero_id")
        .order("match_id")
        .order("hero_id")
        .range(from, to),
  )
  const matches = new Map<number, number[]>()
  for (const row of rows) {
    if (requested !== null && !requested.has(row.match_id)) continue
    const heroes = matches.get(row.match_id) ?? []
    heroes.push(row.hero_id)
    matches.set(row.match_id, heroes)
  }

  let updated = 0
  const missing: number[] = []
  const failed: number[] = []
  if (requested !== null) {
    for (const id of requested) {
      if (!matches.has(id)) {
        failed.push(id)
        console.error(`Match ${String(id)}: no stored players`)
      }
    }
  }
  if (dryRun) console.log("DRY RUN — no writes will be made.")

  for (const [matchId, heroes] of matches) {
    const file = join(archive, `${String(matchId)}.ndjson.gz`)
    if (!existsSync(file)) {
      missing.push(matchId)
      continue
    }
    try {
      const players = extractReplayDewards(
        gunzipSync(readFileSync(file)).toString("utf8").split("\n"),
      )
      if (
        heroes.length !== 10 ||
        new Set(heroes).size !== 10 ||
        players.some(player => !heroes.includes(player.heroId))
      ) {
        throw new Error("Replay heroes do not match the ten stored players")
      }
      if (!dryRun) await storeDewards(supabase, matchId, players)
      updated += 1
      const obs = players.reduce((sum, p) => sum + p.obsDewards, 0)
      const sen = players.reduce((sum, p) => sum + p.senDewards, 0)
      console.log(
        `${String(matchId)}: ${String(obs)} observer / ${String(sen)} sentry dewards ${dryRun ? "would be credited" : "credited"}`,
      )
    } catch (error) {
      failed.push(matchId)
      console.error(`Match ${String(matchId)} failed:`, error)
    }
  }

  console.log(
    `${String(updated)} matches ${dryRun ? "ready" : "updated"}; ${String(missing.length)} missing archives; ${String(failed.length)} failed.`,
  )
  if (missing.length > 0) console.log(`Missing archives: ${missing.join(", ")}`)
  if (failed.length > 0) {
    console.error(`Failed match IDs: ${failed.join(", ")}`)
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
