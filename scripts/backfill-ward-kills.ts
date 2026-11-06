/**
 * Fill missing deward counts (obs_kills, sen_kills) without replacing other
 * match data. Needs migrations/add_ward_kills.sql applied first.
 *
 * Usage (with SUPABASE_DOTA2_URL and SUPABASE_DOTA2_SECRET_KEY in the environment):
 *   npm run backfill-ward-kills -- --db
 *   npm run backfill-ward-kills -- path/to/match-ids.txt
 *
 * OPENDOTA_API_TOKEN is optional. Missing upstream counts remain NULL; existing
 * counts are never overwritten, so interrupted runs can safely be repeated.
 */
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { getMatch } from "../server/match-operations.js"
import { selectAll } from "../server/select-all.js"

const supabase = createClient(
  process.env.SUPABASE_DOTA2_URL ?? "",
  process.env.SUPABASE_DOTA2_SECRET_KEY ?? "",
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  const source = process.argv[2]
  if (!source) {
    throw new Error(
      "Usage: npm run backfill-ward-kills -- --db | path/to/ids.txt",
    )
  }

  // Collect all pages before updating rows so a shrinking NULL set cannot
  // move unprocessed rows into pages we've already read.
  const rows = await selectAll<{ match_id: number }>((from, to) =>
    supabase
      .from("match_player")
      .select("match_id")
      .is("obs_kills", null)
      .order("match_id")
      .order("hero_id")
      .range(from, to),
  )
  const requested =
    source === "--db"
      ? null
      : new Set(
          readFileSync(source, "utf8")
            .split(/\r?\n/)
            .map(Number)
            .filter(id => Number.isSafeInteger(id) && id > 0),
        )
  const matchIds = [...new Set(rows.map(row => row.match_id))].filter(
    id => requested === null || requested.has(id),
  )
  let updated = 0
  let errors = 0

  for (const [index, matchId] of matchIds.entries()) {
    try {
      const { match } = await getMatch(matchId)
      let matchUpdated = 0
      for (const player of match.players) {
        // OpenDota derives both from the same combat-log tally, so they are
        // present or absent together.
        if (player.obsKills === null || player.senKills === null) continue
        const { data, error } = await supabase
          .from("match_player")
          .update({ obs_kills: player.obsKills, sen_kills: player.senKills })
          .eq("match_id", matchId)
          .eq("hero_id", player.heroId)
          .is("obs_kills", null)
          .select("hero_id")
        if (error) throw error
        matchUpdated += data.length
        updated += data.length
      }
      console.log(
        `[${String(index + 1)}/${String(matchIds.length)}] Match ${String(matchId)}: ${String(matchUpdated)} counts filled.`,
      )
    } catch (error) {
      errors += 1
      console.error(`Match ${String(matchId)} failed:`, error)
    }
    if (index < matchIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1200))
    }
  }

  console.log(
    `Done: ${String(updated)} counts filled, ${String(errors)} match errors.`,
  )
  if (errors > 0) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
