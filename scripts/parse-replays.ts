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
 * Resumable, and cheaply so. A match already in `match_positions` at the
 * current `POSITION_ENCODING` is skipped outright — no archive read, no
 * re-extract, no re-upload — so re-running a whole league after adding a few
 * matches costs one batched query plus the new games. Both `--force` and
 * `--from-archive` bypass that check, since re-deriving is the point of each.
 *
 * Requires odota/parser listening on :5600 —
 *   docker run -d --rm --name odparser -p 5600:5600 odota/parser:latest
 *
 * Also requires both `bunzip2` and `zstd` on PATH. Valve serves either format
 * under the same `.dem.bz2` name, so which one a given match needs is not
 * knowable in advance — see `decompressorFor`.
 *
 * Downloads are guarded and retried rather than merely time-limited: Valve's
 * Chinese replay CDN hands out connections that establish and then deliver
 * nothing, which a bare `--max-time` turns into a quarter-hour of silence. See
 * `SOURCE_CURL_LIMITS`. Much of the time it also answers with addresses on
 * networks this side of the firewall cannot reach at all, which is why each
 * attempt picks its own edge and pins to it — see `findEdge`.
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

import dns from "dns/promises"
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

/**
 * Give up on a stalled download rather than sitting on it for `--max-time`.
 *
 * `replay*.dota2.com.cn` is a Kunlun CDN with eight A records, and the edge you
 * get can accept the connection and then send nothing at all: observed
 * 2026-08-13 on TI 2026 match 8943200897, where the socket sat ESTABLISHED for
 * eleven minutes having moved zero bytes and burnt 0.09s of CPU across the whole
 * pipeline. A fresh request to the same node answered 206 in 0.66s, so the node
 * was not down — that one connection was simply dead. `--max-time` alone turns
 * that into a fifteen-minute silent pause per match, which is why this reads as
 * a hang rather than a failure.
 *
 * `--speed-time`/`--speed-limit` is the guard that actually fits: abort a
 * transfer delivering under 1 KB/s for 30s. A healthy replay arrives at MB/s
 * even from China, so the threshold is two orders of magnitude below anything
 * legitimate and will not fire on a merely slow link.
 */
const SOURCE_CURL_LIMITS =
  "--connect-timeout 20 --speed-limit 1024 --speed-time 30 --max-time 900"

/**
 * Choose the edge address ourselves instead of letting every connection re-roll
 * it, because the roll is mostly a losing one.
 *
 * The A records behind `replay*.dota2.com.cn` come as a block — usually eight,
 * sometimes as few as two — and from here a block is reachable or it is not:
 * all of them or none, since the CDN answers with whichever Chinese carrier's
 * network it feels like and only some of them route to us at all. Measured
 * 2026-08-13 against match 8943097729: nine of twelve consecutive four-byte
 * range requests failed, every one of them a connect timeout that had tried
 * every address of the block DNS was serving at the time; the three that landed
 * on a live block answered 206 in under a second. That is the `fetch failed`
 * that ended three TI 2026 matches — not a stalled transfer, a block this host
 * cannot reach.
 *
 * So an attempt probes the whole current block in parallel, takes the first
 * address that answers, and pins the download to it with `--resolve`. A dead
 * block costs one connect timeout rather than eight in series, and the transfer
 * cannot drift onto a different block between the sniff and the download, which
 * a second unpinned request seconds later is free to do.
 *
 * The probe timeout is deliberately short: a live CN edge answers in well under
 * a second, so waiting longer only buys a slower way to learn the same thing.
 */
const EDGE_CONNECT_TIMEOUT_S = 5
const EDGE_PROBE_MAX_TIME_S = 15

/**
 * Back off between attempts, because retrying promptly retries nothing.
 *
 * The record's TTL is 3s, which suggests a re-resolve draws a fresh block, and
 * it does not: six attempts across 47s were handed 101.246.176.236-243 every
 * single time. Which block you get is sticky for far longer than the TTL — a
 * rotation was observed within 10s in one run and not at all within a minute in
 * another. Retrying on a fixed 3s heartbeat therefore asks the same dead block
 * the same question six times and calls it six chances.
 *
 * Doubling instead spreads six attempts over ~75s of waiting rather than 15s,
 * which is the timescale rotations actually happen on, and the spread is what
 * does the work: on the run that settled this, attempts 1-3 were all handed
 * 222.192.186.119-120, attempts 4-5 got 43.248.231.20-31, and the sixth landed
 * on a live block and pulled the replay down in 123s. Six prompt attempts would
 * have spent all of them inside the first dead block.
 *
 * The cap keeps the tail from running away: a match nobody can reach should
 * fail in about two minutes, not sit there.
 */
const DOWNLOAD_ATTEMPTS = 6
const RETRY_DELAY_MS = 3000
const MAX_RETRY_DELAY_MS = 30000
/** Cap on the OpenDota metadata fetch, the one request still made over fetch. */
const FETCH_TIMEOUT_MS = 30000
const EVENT_INSERT_CHUNK = 500
/** IDs per `.in()` filter when asking which matches are already written. */
const WRITTEN_QUERY_CHUNK = 200

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function archivePath(matchId: number): string {
  return path.join(ARCHIVE_DIR, `${String(matchId)}.ndjson.gz`)
}

/**
 * Unwrap `cause`, because that is where anything useful lives.
 *
 * `fetch` rejects with a bare `TypeError: fetch failed` for every network-level
 * failure there is — refused, reset, unroutable, DNS — and hangs the actual
 * reason off `cause`. Reporting only `message` turns "these eight addresses all
 * timed out connecting" into a line that says nothing at all.
 */
function errorMessage(e: unknown): string {
  if (!(e instanceof Error)) return String(e)
  const { cause } = e
  return cause instanceof Error ? `${e.message}: ${cause.message}` : e.message
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
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
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
 * Pick a decompressor from the first bytes, NOT by trusting the URL.
 *
 * Valve serves some replays zstd-compressed while still naming them `.dem.bz2`.
 * Observed 2026-08-03: the two newest S47 matches at the time (8921820516 and
 * 8921763052, both ~3.6 days old) began `28 b5 2f fd` — the zstd magic — while a
 * 10-day-old match from the same season began `BZh`. Older replays are bzip2, so
 * the changeover appears to track recency and this will be the ordinary case
 * going forward rather than an oddity.
 *
 * The failure it caused was worth a range request to prevent: `bunzip2` died on
 * the stream, which broke the pipe, which surfaced as `curl: (23) Failure
 * writing output to destination` — an error that reads like a disk or network
 * fault and says nothing whatsoever about compression.
 */
function decompressorFor(magic: Uint8Array): string {
  // zstd: 0xFD2FB528, little-endian.
  if (
    magic[0] === 0x28 &&
    magic[1] === 0xb5 &&
    magic[2] === 0x2f &&
    magic[3] === 0xfd
  ) {
    return "zstd -d -c"
  }
  // bzip2: "BZh".
  if (magic[0] === 0x42 && magic[1] === 0x5a && magic[2] === 0x68) {
    return "bunzip2 -c"
  }
  // Refuse rather than guess. Feeding the wrong decompressor produces the
  // broken-pipe error above, which points nowhere near the real problem.
  const hex = [...magic].map(b => b.toString(16).padStart(2, "0")).join(" ")
  throw new Error(`unrecognised replay compression (magic ${hex})`)
}

/** A CDN address that has been shown to answer, and what it is serving. */
type Edge = { address: string | null; decompress: string }

/**
 * Host to the last address of it that served us, for the length of a run.
 *
 * A live edge stays live for a good while — long enough to have carried a 57 MB
 * replay end to end — and every match in a league comes from the same host. So
 * the first match pays for the roulette and the rest go straight to the winner,
 * which for a 29-match league is the difference between one bad block and
 * twenty-nine of them. It is a hint, not a promise: if the remembered address
 * has since gone, the probe falls back to the full block.
 */
const liveEdges = new Map<string, string>()

/** `--resolve` pinning `url` to `address`, or nothing if we have no address. */
function resolveArgs(url: URL, address: string | null): string[] {
  if (address === null) return []
  const port =
    url.port === "" ? (url.protocol === "https:" ? "443" : "80") : url.port
  return ["--resolve", `${url.hostname}:${port}:${address}`]
}

/**
 * Ask one address for the replay's first four bytes.
 *
 * Done with curl rather than `fetch` for the one thing curl can do here and
 * `fetch` cannot: aim a request at a chosen address while keeping the Host
 * header. `fetch` only takes a URL, so it re-resolves and may answer from a
 * different edge than the one being tested, which is the whole point of the
 * probe.
 *
 * The child is killed the moment four bytes arrive. A server that ignored the
 * Range header would otherwise keep sending the remaining 57 MB.
 */
async function probeEdge(
  url: URL,
  address: string | null,
): Promise<Uint8Array> {
  const args = [
    "-sSf",
    "--connect-timeout",
    String(EDGE_CONNECT_TIMEOUT_S),
    "--max-time",
    String(EDGE_PROBE_MAX_TIME_S),
    ...resolveArgs(url, address),
    "-r",
    "0-3",
    url.href,
  ]

  return new Promise<Uint8Array>((resolve, reject) => {
    const child = spawn("curl", args, { stdio: ["ignore", "pipe", "pipe"] })
    const chunks: Buffer[] = []
    let length = 0
    let settled = false
    let stderr = ""

    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()))
    child.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk)
      length += chunk.length
      if (length < 4 || settled) return
      settled = true
      child.kill()
      resolve(new Uint8Array(Buffer.concat(chunks).subarray(0, 4)))
    })
    child.on("error", reject)
    child.on("close", () => {
      if (settled) return
      settled = true
      // Reason only — which address it was is `findEdge`'s to say, since it is
      // the one that can see they all failed the same way.
      reject(
        new Error(
          stderr.trim() === ""
            ? `sent ${String(length)} of 4 bytes`
            : stderr.trim(),
        ),
      )
    })
  })
}

/**
 * Find an address that will actually serve this replay, and sniff it while there.
 *
 * Every address of the current block is probed at once and the first to answer
 * wins, so a block this host cannot reach costs one connect timeout instead of
 * one per address in series. Doing the lookup here rather than leaving it to
 * curl is what makes the rest possible: it is the only way to know which
 * addresses were tried, and the only way to hand the download the one that
 * worked instead of hoping it draws the same one.
 *
 * If the name will not resolve at all we hand back a null address and let curl
 * do its own lookup — a host that is not this CDN has no block problem to solve,
 * and pinning is not worth failing over.
 */
async function findEdge(replayUrl: string): Promise<Edge> {
  const url = new URL(replayUrl)

  // The remembered edge is asked alone rather than raced against the block, so
  // the ordinary case costs one request instead of eight. It answers in under a
  // second when it is still good, and one probe timeout when it is not.
  const remembered = liveEdges.get(url.hostname)
  if (remembered !== undefined) {
    const magic = await probeEdge(url, remembered).catch(() => null)
    if (magic !== null) {
      return { address: remembered, decompress: decompressorFor(magic) }
    }
    liveEdges.delete(url.hostname)
  }

  const addresses = await dns.resolve4(url.hostname).catch(() => [])
  const candidates: (string | null)[] =
    addresses.length === 0 ? [null] : addresses

  const probes = candidates.map(address =>
    probeEdge(url, address).then(magic => ({ address, magic })),
  )
  const winner = await Promise.any(probes).catch((e: unknown) => {
    throw new Error(
      `no reachable edge for ${url.hostname}: ` +
        describeProbeFailures(candidates, e),
    )
  })

  if (winner.address !== null) liveEdges.set(url.hostname, winner.address)
  return { address: winner.address, decompress: decompressorFor(winner.magic) }
}

/**
 * Say once what eight addresses failing the same way means.
 *
 * A block fails as a block, so one reason per address is eight copies of the
 * same sentence — 1400 characters of retry line for one fact. `AggregateError`
 * keeps `errors` in the order of the promises it was handed, which is the order
 * of `candidates`, so the two zip and the addresses can be gathered under the
 * reason they share.
 */
function describeProbeFailures(
  candidates: (string | null)[],
  e: unknown,
): string {
  const errors: unknown[] = e instanceof AggregateError ? e.errors : [e]
  const byReason = new Map<string, string[]>()

  errors.forEach((error, i) => {
    // curl reports the exact milliseconds it waited, which differ by a handful
    // between addresses and would otherwise defeat the grouping entirely.
    const reason = errorMessage(error).replace(
      /after \d+ ms/,
      `after ~${String(EDGE_CONNECT_TIMEOUT_S)}s`,
    )
    const addresses = byReason.get(reason) ?? []
    addresses.push(candidates[i] ?? "unpinned")
    byReason.set(reason, addresses)
  })

  return [...byReason]
    .map(([reason, addresses]) => `${addresses.join(", ")} — ${reason}`)
    .join("; ")
}

/**
 * One download-decompress-parse attempt, writing gzipped NDJSON to `partial`.
 *
 * Streamed rather than staged through temp files: the intermediate .dem is
 * ~250 MB uncompressed and nothing needs it on disk. `pipefail` matters — the
 * final `gzip` succeeds on an empty stream, so without it a 404 from Valve would
 * produce a valid, empty archive file that the resume check then treats as done.
 *
 * The speed guards go on the source curl only. The POST to the parser is a
 * localhost upload whose rate is bounded by how fast the source feeds it, so a
 * threshold there would only ever fire second, on a stall the source already
 * caught.
 *
 * The transfer is pinned to the address `findEdge` proved reachable. Left to
 * resolve on its own it would be a fresh roll of the same bad dice: the probe
 * establishes that one address works, and nothing carries that over to a second
 * lookup seconds later, which is free to come back with a block that was never
 * asked anything.
 */
async function runPipeline(
  replayUrl: string,
  edge: Edge,
  partial: string,
): Promise<void> {
  const pin = resolveArgs(new URL(replayUrl), edge.address)
    .map(arg => JSON.stringify(arg))
    .join(" ")
  // `>` truncates, so an attempt always starts from an empty file rather than
  // appending to the corpse of the previous one.
  const command = [
    "set -o pipefail",
    `curl -sSf ${SOURCE_CURL_LIMITS} ${pin} ${JSON.stringify(replayUrl)}` +
      ` | ${edge.decompress}` +
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
  if (size === 0) throw new Error("parse pipeline produced an empty archive")
}

/**
 * Parse one replay into the archive, retrying a stalled or dead CDN edge.
 *
 * Retried here rather than with `curl --retry` because curl restarts a retried
 * transfer from byte zero, and by then `zstd` downstream has already been fed a
 * prefix of the stream — the second attempt would splice onto the first and
 * corrupt the .dem. Re-running the whole pipeline is the only retry that leaves
 * the archive honest.
 *
 * Edge selection is inside the loop for the same reason the retry exists: an
 * attempt that failed did so because of which addresses DNS was handing out at
 * the time, and the only way to get different ones is to ask again.
 */
async function downloadAndParse(
  replayUrl: string,
  destination: string,
): Promise<void> {
  // Written to `.part` and renamed only on success, so a killed run cannot leave
  // a truncated archive that looks complete to the next one.
  const partial = `${destination}.part`
  let lastError = new Error("no attempt made")

  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      const edge = await findEdge(replayUrl)
      await runPipeline(replayUrl, edge, partial)
      fs.renameSync(partial, destination)
      return
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      if (fs.existsSync(partial)) fs.unlinkSync(partial)
      // Whatever went wrong, it went wrong on the address we were holding, so
      // stop holding it. A four-byte probe cannot tell a healthy edge from one
      // that will stall halfway through 57 MB; a failed transfer can.
      liveEdges.delete(new URL(replayUrl).hostname)
      if (attempt === DOWNLOAD_ATTEMPTS) break
      const delay = Math.min(
        RETRY_DELAY_MS * 2 ** (attempt - 1),
        MAX_RETRY_DELAY_MS,
      )
      console.log(
        `    attempt ${String(attempt)}/${String(DOWNLOAD_ATTEMPTS)} failed ` +
          `(${errorMessage(lastError)}) — retrying in ${String(Math.round(delay / 1000))}s`,
      )
      await new Promise(r => setTimeout(r, delay))
    }
  }

  throw lastError
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

  // Written last, deliberately. Lacking transactions, the positions row is the
  // only commit marker this pair of tables has, and `getWrittenMatchIds` treats
  // it as one. Upserting it first would mean a run killed midway through the
  // event inserts left a match that the next run skips as done while its map is
  // missing most of its markers.
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

  return result
}

/**
 * Which of these matches are already in the database at the current encoding.
 *
 * Encoding-aware rather than a bare existence check, because that is what the
 * version string in `match_positions.encoding` is for: a v1 row is exactly the
 * thing a v2 run must redo, and skipping it would make bumping the codec a
 * silent no-op.
 *
 * One batched query rather than a probe per match: a league run is ~60 matches
 * and the whole point is to make the resume path cheap.
 */
async function getWrittenMatchIds(matchIds: number[]): Promise<Set<number>> {
  const written = new Set<number>()

  for (let i = 0; i < matchIds.length; i += WRITTEN_QUERY_CHUNK) {
    const chunk = matchIds.slice(i, i + WRITTEN_QUERY_CHUNK)
    const rows = await selectAll<{ match_id: number }>((from, to) =>
      supabase
        .from("match_positions")
        .select("match_id")
        .eq("encoding", POSITION_ENCODING)
        .in("match_id", chunk)
        .order("match_id")
        .range(from, to),
    )
    for (const row of rows) written.add(row.match_id)
  }

  return written
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

  // Both flags mean "derive this again", so neither consults the resume check:
  // `--force` re-downloads, and `--from-archive` exists precisely for the case
  // where the extraction changed but the encoding string did not.
  const rederiving = force || fromArchive
  const alreadyWritten = rederiving
    ? new Set<number>()
    : await getWrittenMatchIds(matchIds)
  if (alreadyWritten.size > 0) {
    console.log(
      `${String(alreadyWritten.size)} of ${String(matchIds.length)} already written at ${POSITION_ENCODING} — skipping those.`,
    )
  }

  const pending = matchIds.filter(id => !alreadyWritten.has(id))
  const needsParser =
    !fromArchive && pending.some(id => force || !fs.existsSync(archivePath(id)))
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

  for (let i = 0; i < pending.length; i++) {
    const matchId = pending[i]
    const label = `[${String(i + 1)}/${String(pending.length)}]`
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

        // Printed before the minutes-long silent stretch, not after it. Which
        // host a replay comes from is the first thing you want when a match
        // stalls, and the CN edges are where that happens.
        console.log(
          `${label} ${String(matchId)}: downloading from ${new URL(replayUrl).host}`,
        )
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
      console.error(`${label} ${String(matchId)} failed:`, errorMessage(e))
    }
  }

  console.log("\nDone.")
  console.log(
    `Parsed: ${String(parsed)}, reused from archive: ${String(reused)}, ` +
      `already written: ${String(alreadyWritten.size)}, ` +
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
