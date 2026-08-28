/**
 * Import one AD2L S48 division — teams and rosters — from its playon season
 * page into the S48 league (20077 unless --league says otherwise).
 *
 * Can run before any match exists, which shapes two compromises:
 *   - A team with no history here gets its PLAYON team id (a 5-digit number)
 *     as a placeholder, because its in-game id is unknowable until it plays.
 *     Teams whose name exactly matches an existing `team` row keep their real
 *     id, so Sharkhorse's S46/S47 history stays attached. Fix a placeholder
 *     later with `npm run replace-team-id`.
 *   - `roster_member.role` is written as "Unknown": playon's "Desired Roles"
 *     field is empty in practice, and guessing Carry-through-Support from
 *     nothing would be wrong four times out of five. Set real roles in the
 *     Players tab as they become known.
 *
 * Player ids are Steam32 account ids, read from each roster's OpenDota link.
 * The rank badge (e.g. "Legend 2") is the rank at registration, so it is
 * written to both `rank` and `original_rank` — but a re-run only refreshes
 * `rank`, leaving `original_rank` and any hand-set role alone.
 *
 * Usage:
 *   npx tsx scripts/add-ad2l-s48-division.ts --season 672 --division Challenger --dry-run
 *   npx tsx scripts/add-ad2l-s48-division.ts --season 673 --division Warrior
 *
 * Env: SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY
 */

import { createClient } from "@supabase/supabase-js"
import { DIVISIONS, isDivision } from "../shared/divisions"

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const dryRun = process.argv.includes("--dry-run")

function readFlag(flag: string): string | null {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : (process.argv[index + 1] ?? null)
}

const seasonArg = readFlag("--season")
if (!seasonArg || Number.isNaN(parseInt(seasonArg, 10))) {
  console.error("--season <playonSeasonId> is required (e.g. 673)")
  process.exit(1)
}

const divisionArg = readFlag("--division")
if (!isDivision(divisionArg)) {
  console.error(
    `--division must be one of: ${DIVISIONS.join(", ")} (got ${JSON.stringify(divisionArg)})`,
  )
  process.exit(1)
}

/** Was placeholder 48 until the real ticket surfaced in week 1's matches. */
const LEAGUE_ID = parseInt(readFlag("--league") ?? "20077", 10)
const DIVISION = divisionArg
const SEASON_URL = `https://dota.playon.gg/seasons/${seasonArg}`

/**
 * Playon team id → our team id, for teams name-matching can't resolve.
 * "Josh A. Chally s48" renamed itself "Josh A-nonymous" on playon and is stored
 * here as "Josh A. Pain" (10137481) — three names, one in-game team, proven by
 * their week-1 games. Name matching would mint a fresh placeholder instead.
 */
const TEAM_ID_OVERRIDES = new Map<number, number>([[15030, 10137481]])

type PlayonTeam = { playonId: number; name: string }

type RosterPlayer = {
  steamId32: number
  name: string
  rank: string | null
  isCaptain: boolean
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(parseInt(code, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })
  if (!res.ok) throw new Error(`GET ${url} → ${String(res.status)}`)
  return res.text()
}

/**
 * The team links in the first table under "Participants". Challenger heads
 * that table "Division Ready To Be Scheduled" and follows it with a refund
 * table; Warrior has one unheaded table. Taking only the first table serves
 * both, and drops the refunded teams by construction.
 */
function parseSeasonTeams(html: string): PlayonTeam[] {
  const sectionStart = html.indexOf("Participants")
  if (sectionStart === -1) throw new Error(`"Participants" not found`)
  const tableEnd = html.indexOf("</table>", sectionStart)
  const section = html.slice(sectionStart, tableEnd)

  const teams: PlayonTeam[] = []
  for (const match of section.matchAll(
    /<a href="\/teams\/(\d+)">([^<]+)<\/a>/g,
  )) {
    teams.push({
      playonId: parseInt(match[1], 10),
      name: decodeEntities(match[2].trim()),
    })
  }
  return teams
}

/**
 * One <li class="rosterNameContainer"> per player: a rank badge, the profile
 * link (with "(Captain)" after the captain's), and an OpenDota link whose path
 * segment is the Steam32 id the rest of this database keys players by.
 */
function parseRoster(html: string): RosterPlayer[] {
  const players: RosterPlayer[] = []
  const blocks = html.split('<li class="rosterNameContainer">').slice(1)

  for (const block of blocks) {
    const steamId = /opendota\.com\/players\/(\d+)/.exec(block)
    const name =
      /<a href="\/players\/\d+">([^<]+)<\/a>(&nbsp;\(Captain\))?/.exec(block)
    const rank = /<div class="rankBadge" title="([^"]+)"/.exec(block)

    if (!steamId || !name) {
      console.warn("  Skipping roster entry with no OpenDota link or name")
      continue
    }

    players.push({
      steamId32: parseInt(steamId[1], 10),
      name: decodeEntities(name[1].trim()),
      rank: rank ? rank[1] : null,
      isCaptain: Boolean(name[2]),
    })
  }
  return players
}

/**
 * The real team id when this org already exists (exact name match, case
 * insensitive), else the playon id as a knowingly-wrong placeholder.
 */
async function resolveTeamId(
  team: PlayonTeam,
): Promise<{ id: number; existing: boolean }> {
  const override = TEAM_ID_OVERRIDES.get(team.playonId)
  if (override !== undefined) return { id: override, existing: true }

  const result = await supabase
    .from("team")
    .select("id, name")
    .ilike("name", team.name)
  if (result.error) throw result.error
  const rows = result.data as { id: number; name: string }[]
  if (rows.length > 1) {
    throw new Error(
      `Multiple existing teams named "${team.name}" — resolve by hand`,
    )
  }
  return rows.length === 1
    ? { id: rows[0].id, existing: true }
    : { id: team.playonId, existing: false }
}

async function importTeam(team: PlayonTeam): Promise<void> {
  const { id: teamId, existing } = await resolveTeamId(team)
  const roster = parseRoster(
    await fetchHtml(`https://dota.playon.gg/teams/${String(team.playonId)}`),
  )

  console.log(
    `\n${team.name} → team_id ${String(teamId)} ${existing ? "(existing)" : "(placeholder = playon id)"}`,
  )
  for (const player of roster) {
    console.log(
      `  ${String(player.steamId32).padEnd(10)} ${player.name}${player.isCaptain ? " (Captain)" : ""} — ${player.rank ?? "unranked"}`,
    )
  }
  if (roster.length === 0) console.warn("  No roster entries parsed!")
  if (dryRun) return

  if (!existing) {
    const inserted = await supabase
      .from("team")
      .insert({ id: teamId, name: team.name })
    if (inserted.error && inserted.error.code !== "23505") throw inserted.error
  }

  const membership = await supabase
    .from("league_teams")
    .upsert(
      { league_id: LEAGUE_ID, team_id: teamId, division: DIVISION },
      { onConflict: "league_id,team_id" },
    )
  if (membership.error) throw membership.error

  for (const player of roster) {
    const upserted = await supabase.from("player").upsert(
      {
        id: player.steamId32,
        name: player.name,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    if (upserted.error) throw upserted.error

    // Re-runs refresh `rank` (today's badge) but must not touch a member's
    // `original_rank` or `role` — one is the registration-time fact, the other
    // may have been set by hand in the Players tab since the import.
    const existingMember = await supabase
      .from("roster_member")
      .select("role, original_rank")
      .eq("league_id", LEAGUE_ID)
      .eq("team_id", teamId)
      .eq("player_id", player.steamId32)
      .maybeSingle()
    if (existingMember.error) throw existingMember.error
    const kept = existingMember.data as {
      role: string
      original_rank: string | null
    } | null

    const member = await supabase.from("roster_member").upsert(
      {
        league_id: LEAGUE_ID,
        team_id: teamId,
        player_id: player.steamId32,
        role: kept?.role ?? "Unknown",
        rank: player.rank,
        original_rank: kept?.original_rank ?? player.rank,
        is_stand_in: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "league_id,team_id,player_id" },
    )
    if (member.error) throw member.error
  }
  console.log(`  Wrote ${String(roster.length)} roster member(s).`)
}

async function main() {
  if (!SUPABASE_DOTA2_URL || !SUPABASE_DOTA2_SECRET_KEY) {
    console.error("Set SUPABASE_DOTA2_URL and SUPABASE_DOTA2_SECRET_KEY")
    process.exit(1)
  }

  const league = await supabase
    .from("league")
    .select("name")
    .eq("id", LEAGUE_ID)
    .maybeSingle()
  if (league.error) throw league.error
  if (!league.data) {
    console.error(
      `League ${String(LEAGUE_ID)} does not exist — create it first.`,
    )
    process.exit(1)
  }

  const teams = parseSeasonTeams(await fetchHtml(SEASON_URL))
  console.log(
    `${dryRun ? "[dry-run] " : ""}${String(teams.length)} team(s) on ${SEASON_URL} → ${DIVISION}`,
  )

  for (const team of teams) {
    // Every division carries a "<Division> Bye Week" scheduling artifact with
    // admin accounts on its roster; none of them is an opponent.
    if (team.name.includes("Bye Week")) {
      console.log(`\nSkipping ${team.name} (bye placeholder).`)
      continue
    }
    await importTeam(team)
  }

  console.log(`\n${dryRun ? "Dry run complete (no writes)." : "Done."}`)
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
