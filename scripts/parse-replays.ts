/**
 * Parse Dota replays into per-second hero positions and map events.
 *
 * Usage:
 *   npm run parse-replays -- --league 19554 --dry-run   # report what would run
 *   npm run parse-replays -- --league 19554             # download, parse, write
 *   npm run parse-replays -- path/to/ids.txt            # restrict to IDs in a file
 *   npm run parse-replays -- --league 19554 --from-archive  # re-derive, no download
 *   npm run parse-replays -- --league 19554 --force      # re-download and re-parse
 *
 * This is local-only and cannot run on Vercel: it needs Java (via Docker), a
 * ~57 MB download per match, and tens of seconds of CPU, against a serverless
 * timeout measured in seconds.
 *
 * Requires odota/parser listening on :5600 —
 *   docker run -d --rm --name odparser -p 5600:5600 odota/parser:latest
 *
 * Env: SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY,
 *      OPENDOTA_API_TOKEN (optional), REPLAY_ARCHIVE_DIR (optional)
 *
 * The archive is the point of the design, not a cache. Valve still serves
 * 165-day-old league replays, but that is an observation rather than a promise,
 * and once a season ages out the movement data is unrecoverable at any price.
 * Re-deriving from the archive costs seconds; re-downloading a season costs an
 * hour and only works while Valve still has it. Hence `--from-archive`, which is
 * the flag you will actually use once definitions start changing.
 */

import fs from "fs"
import os from "os"
import path from "path"
import zlib from "zlib"
import { spawn } from "child_process"
import { createClient } from "@supabase/supabase-js"
import { extractFromEvents } from "../server/replay-extract"
import { toPgHex } from "../server/pg-bytea"
import { selectAll } from "../server/select-all"
import { POSITION_ENCODING } from "../shared/position-codec"

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""
const OPENDOTA_API_KEY = process.env.OPENDOTA_API_TOKEN ?? ""

/**
 * Outside the repo by default. The archive is ~2.2 MB a match and is meant to
 * outlive both the working tree and the Conductor workspace it was produced in;
 * putting it under `.context/` would tie a season's only surviving copy of its
 * movement data to a directory designed to be thrown away.
 */
const ARCHIVE_DIR =
  process.env.REPLAY_ARCHIVE_DIR ??
  path.join(os.homedir(), "dota-replay-archive")

const PARSER_URL = "http://localhost:5600"
const OPEN_DOTA_DELAY_MS = 1200
const EVENT_INSERT_CHUNK = 500

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function archivePath(matchId: number): string {
  return path.join(ARCHIVE_DIR, `${String(matchId)}.ndjson.gz`)
}

async function assertParserRunning(): Promise<void> {
  try {
    const response = await fetch(PARSER_URL, { method: "GET" })
    if (!response.ok) throw new Error(`status ${String(response.status)}`)
  } catch (e) {
    // Worth its own message: a bare ECONNREFUSED from inside a 59-match loop
    // reads like a network problem with Valve rather than a container nobody
    // started.
    throw new Error(
      `odota/parser is not answering on ${PARSER_URL} (${String(e)}).\n` +
        "Start it with:\n" +
        "  docker run -d --rm --name odparser -p 5600:5600 odota/parser:latest",
    )
  }
}

type OpenDotaMatch = {
  version: number | null
  replay_url?: string | null
}

async function getReplayUrl(matchId: number): Promise<string | null> {
  const suffix = OPENDOTA_API_KEY ? `?api_key=${OPENDOTA_API_KEY}` : ""
  const response = await fetch(
    `https://api.opendota.com/api/matches/${String(matchId)}${suffix}`,
  )
  if (!response.ok) {
    throw new Error(
      `OpenDota ${String(response.status)} for ${String(matchId)}`,
    )
  }
  const match = (await response.json()) as OpenDotaMatch
  // Both go together in practice: the two S47 matches with no replay_url are the
  // same two OpenDota never parsed, which are the games entered by hand from
  // screenshots because OpenDota never ingested them.
  if (!match.version || !match.replay_url) return null
  return match.replay_url
}

/**
 * Download, decompress and parse in one pipeline, writing gzipped NDJSON.
 *
 * Streamed rather than staged through temp files: the intermediate .dem is
 * ~250 MB uncompressed and nothing needs it on disk. `pipefail` matters — the
 * final `gzip` succeeds on an empty stream, so without it a 404 from Valve would
 * produce a valid, empty archive file that the resume check then treats as done.
 */
async function downloadAndParse(
  replayUrl: string,
  destination: string,
): Promise<void> {
  // Written to `.part` and renamed only on success, so a killed run cannot leave
  // a truncated archive that looks complete to the next one.
  const partial = `${destination}.part`
  const command = [
    "set -o pipefail",
    `curl -sSf --max-time 900 ${JSON.stringify(replayUrl)}` +
      ` | bunzip2 -c` +
      ` | curl -sSf -X POST -T - --max-time 900 ${JSON.stringify(PARSER_URL)}` +
      ` | gzip -6 > ${JSON.stringify(partial)}`,
  ].join("\n")

  await new Promise<void>((resolve, reject) => {
    const child = spawn("bash", ["-c", command], {
      stdio: ["ignore", "ignore", "pipe"],
    })
    let stderr = ""
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()))
    child.on("error", reject)
    child.on("close", code => {
      if (code === 0) resolve()
      else
        reject(
          new Error(`parse pipeline exited ${String(code)}: ${stderr.trim()}`),
        )
    })
  })

  const { size } = fs.statSync(partial)
  if (size === 0) {
    fs.unlinkSync(partial)
    throw new Error("parse pipeline produced an empty archive")
  }
  fs.renameSync(partial, destination)
}

function readArchive(matchId: number): string[] {
  const raw = zlib.gunzipSync(fs.readFileSync(archivePath(matchId)))
  return raw.toString("utf8").split("\n")
}

type WriteResult = {
  sampleCount: number
  events: number
  positionBytes: number
  trimmedSamples: number
}

async function writeMatch(
  matchId: number,
  dryRun: boolean,
): Promise<WriteResult> {
  const extracted = extractFromEvents(readArchive(matchId))
  const positions = zlib.gzipSync(extracted.positions)
  const lifeStates = zlib.gzipSync(extracted.lifeStates)

  const result: WriteResult = {
    sampleCount: extracted.sampleCount,
    events: extracted.events.length,
    positionBytes: positions.byteLength,
    trimmedSamples: extracted.trimmedSamples,
  }
  if (dryRun) return result

  const { error: positionsError } = await supabase
    .from("match_positions")
    .upsert(
      {
        match_id: matchId,
        encoding: POSITION_ENCODING,
        first_time: extracted.firstTime,
        sample_count: extracted.sampleCount,
        slot_hero_ids: extracted.slotHeroIds,
        positions: toPgHex(positions),
        life_states: toPgHex(lifeStates),
      },
      { onConflict: "match_id" },
    )
  if (positionsError) throw new Error(positionsError.message)

  // Replace rather than append. Supabase has no transactions, and match_event
  // has no primary key (two heroes dying on the same second is ordinary), so a
  // re-run without the delete would double every marker on the map.
  const { error: deleteError } = await supabase
    .from("match_event")
    .delete()
    .eq("match_id", matchId)
  if (deleteError) throw new Error(deleteError.message)

  for (let i = 0; i < extracted.events.length; i += EVENT_INSERT_CHUNK) {
    const chunk = extracted.events
      .slice(i, i + EVENT_INSERT_CHUNK)
      .map(event => ({ match_id: matchId, ...event }))
    const { error } = await supabase.from("match_event").insert(chunk)
    if (error) throw new Error(error.message)
  }

  return result
}

async function getLeagueMatchIds(leagueId: number): Promise<number[]> {
  const rows = await selectAll<{ id: number }>((from, to) =>
    supabase
      .from("match")
      .select("id")
      .eq("league_id", leagueId)
      .order("start_date_time", { ascending: false })
      .range(from, to),
  )
  return rows.map(r => r.id)
}

function getMatchIdsFromFile(filePath: string): number[] {
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line: string) => line.trim())
    .filter((line: string) => line !== "" && !Number.isNaN(Number(line)))
    .map(Number)
}

/** Exits rather than returning on bad input, so callers get a plain array. */
async function resolveMatchIds(
  leagueId: number | null,
  fileArg: string | undefined,
): Promise<number[]> {
  if (leagueId !== null && Number.isInteger(leagueId)) {
    const ids = await getLeagueMatchIds(leagueId)
    console.log(`League ${String(leagueId)}: ${String(ids.length)} match(es).`)
    return ids
  }

  if (fileArg) {
    const filePath = path.resolve(process.cwd(), fileArg)
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`)
      process.exit(1)
    }
    const ids = getMatchIdsFromFile(filePath)
    console.log(
      `Loaded ${String(ids.length)} match ID(s) from ${path.basename(filePath)}.`,
    )
    return ids
  }

  console.error(
    "Usage: npm run parse-replays -- --league <id> | <file.txt> [--dry-run] [--force] [--from-archive]",
  )
  console.error(
    `Default archive: ${ARCHIVE_DIR} (override with REPLAY_ARCHIVE_DIR)`,
  )
  process.exit(1)
  // Unreachable. `process.exit` is only typed as `never` when @types/node is in
  // scope, which tsconfig.node.json does not pull in for scripts/.
  throw new Error("unreachable")
}

async function main() {
  if (!SUPABASE_DOTA2_URL || !SUPABASE_DOTA2_SECRET_KEY) {
    console.error("Set SUPABASE_DOTA2_URL and SUPABASE_DOTA2_SECRET_KEY")
    process.exit(1)
  }

  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const force = args.includes("--force")
  const fromArchive = args.includes("--from-archive")
  const leagueArg = args.indexOf("--league")
  const leagueId = leagueArg >= 0 ? Number(args[leagueArg + 1]) : null
  const fileArg = args.find(
    (a, i) => !a.startsWith("--") && args[i - 1] !== "--league",
  )

  const matchIds = await resolveMatchIds(leagueId, fileArg)

  fs.mkdirSync(ARCHIVE_DIR, { recursive: true })
  console.log(`Archive: ${ARCHIVE_DIR}`)
  if (dryRun) console.log("DRY RUN — no writes will be made.")

  const needsParser =
    !fromArchive &&
    matchIds.some(id => force || !fs.existsSync(archivePath(id)))
  if (needsParser && !dryRun) await assertParserRunning()

  let parsed = 0
  let reused = 0
  let noReplay = 0
  let totalEvents = 0
  let totalBytes = 0
  const failed: number[] = []
  // Named rather than counted, on the same reasoning as backfill-objectives:
  // a partial run must never be able to masquerade as a complete one.
  const skipped: number[] = []

  for (let i = 0; i < matchIds.length; i++) {
    const matchId = matchIds[i]
    const label = `[${String(i + 1)}/${String(matchIds.length)}]`
    const archived = fs.existsSync(archivePath(matchId))

    try {
      if (!archived || force) {
        if (fromArchive) {
          skipped.push(matchId)
          console.log(
            `${label} ${String(matchId)}: no archive, skipped (--from-archive)`,
          )
          continue
        }
        if (dryRun) {
          console.log(`${label} ${String(matchId)}: would download and parse`)
          continue
        }

        const replayUrl = await getReplayUrl(matchId)
        if (replayUrl === null) {
          noReplay += 1
          skipped.push(matchId)
          console.log(
            `${label} ${String(matchId)}: no replay available, skipped`,
          )
          await new Promise(r => setTimeout(r, OPEN_DOTA_DELAY_MS))
          continue
        }

        const started = Date.now()
        await downloadAndParse(replayUrl, archivePath(matchId))
        parsed += 1
        console.log(
          `${label} ${String(matchId)}: parsed in ${String(Math.round((Date.now() - started) / 1000))}s` +
            ` (${String(Math.round(fs.statSync(archivePath(matchId)).size / 1024))} KB archived)`,
        )
        await new Promise(r => setTimeout(r, OPEN_DOTA_DELAY_MS))
      } else {
        reused += 1
      }

      const result = await writeMatch(matchId, dryRun)
      totalEvents += result.events
      totalBytes += result.positionBytes
      console.log(
        `${label} ${String(matchId)}: ${String(result.sampleCount)}s x10, ` +
          `${String(result.events)} events, ${String(Math.round(result.positionBytes / 1024))} KB` +
          (result.trimmedSamples > 0
            ? ` — trimmed ${String(result.trimmedSamples)} ragged sample(s)`
            : ""),
      )
    } catch (e) {
      failed.push(matchId)
      console.error(
        `${label} ${String(matchId)} failed:`,
        e instanceof Error ? e.message : e,
      )
    }
  }

  console.log("\nDone.")
  console.log(
    `Parsed: ${String(parsed)}, reused from archive: ${String(reused)}, ` +
      `no replay: ${String(noReplay)}, failed: ${String(failed.length)}.`,
  )
  console.log(
    `Events ${dryRun ? "that would be written" : "written"}: ${String(totalEvents)}; ` +
      `positions ${(totalBytes / 1048576).toFixed(1)} MB.`,
  )
  if (skipped.length > 0)
    console.log(`Skipped match IDs: ${skipped.join(", ")}`)
  if (failed.length > 0) console.log(`Failed match IDs: ${failed.join(", ")}`)
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
