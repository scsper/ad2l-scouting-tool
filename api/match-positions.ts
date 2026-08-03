import zlib from "zlib"
import { createClient } from "@supabase/supabase-js"
import { fromPgHex } from "../server/pg-bytea.js"
import { selectAll } from "../server/select-all.js"
import type {
  MatchEventRow,
  MatchPlayerRow,
  MatchPositionsRow,
  MatchRow,
} from "../types/db.js"

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** One player's identity for one slot of one game. */
export type PositionSlot = {
  /** 0-4 are Radiant, 5-9 are Dire. Indexes into the decoded position tracks. */
  slot: number
  heroId: number
  /**
   * Null when `match_player` has no row for this hero — the opponent side of a
   * match whose ten rows were only partly written, or a hand-entered game.
   * The track is still drawn; it just cannot be attributed to a person.
   */
  playerId: number | null
  playerName: string | null
  position: string | null
  teamId: number | null
}

export type PositionMatch = {
  id: number
  start_date_time: number
  /** True when the requested team was Radiant. Always true for a match query. */
  isRadiant: boolean
  opponentTeamId: number | null
  winning_team_id: number | null
  encoding: string
  firstTime: number
  sampleCount: number
  slots: PositionSlot[]
  /**
   * base64 of the raw, DECOMPRESSED int16 delta bytes.
   *
   * The blob is gzipped in Postgres and gunzipped here rather than forwarded
   * compressed, because the difference on the wire is small and the difference
   * in the client is not: measured on a real match, a 20-game season is 1104 KB
   * as base64-of-raw under Vercel's response gzip versus 922 KB as
   * base64-of-gzip. Paying 180 KB buys a synchronous `atob` in the browser
   * instead of an async `DecompressionStream`, which every consumer of this
   * data would otherwise have to await.
   */
  positions: string
  lifeStates: string
}

export type PositionEvent = Omit<MatchEventRow, "match_id"> & {
  matchId: number
}

export type MatchPositionsApiResponse = {
  matches: PositionMatch[]
  events: PositionEvent[]
}

type PositionsRow = MatchPositionsRow & {
  positions: string
  life_states: string
}

type SlotPlayer = Pick<
  MatchPlayerRow,
  "player_id" | "player_name" | "hero_id" | "position" | "team_id"
> & { match_id: number }

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64")
}

async function loadMatches(matchIds: number[]): Promise<MatchRow[]> {
  if (matchIds.length === 0) return []
  return selectAll<MatchRow>((from, to) =>
    supabase
      .from("match")
      .select(
        "id, start_date_time, radiant_team_id, dire_team_id, winning_team_id",
      )
      .in("id", matchIds)
      .order("start_date_time", { ascending: false })
      .range(from, to),
  )
}

async function build(
  matchIds: number[],
  teamId: number | null,
): Promise<MatchPositionsApiResponse> {
  if (matchIds.length === 0) return { matches: [], events: [] }

  const [matches, positionRows, players, eventRows] = await Promise.all([
    loadMatches(matchIds),
    selectAll<PositionsRow>((from, to) =>
      supabase
        .from("match_positions")
        .select(
          "match_id, encoding, first_time, sample_count, slot_hero_ids, positions, life_states",
        )
        .in("match_id", matchIds)
        .range(from, to),
    ),
    // Both teams, unlike api/match-wards.ts. Movement is relative: a rotation is
    // only legible next to where the other five players were standing, and
    // playback that drew half the map would be worse than not drawing it.
    selectAll<SlotPlayer>((from, to) =>
      supabase
        .from("match_player")
        .select("match_id, player_id, player_name, hero_id, position, team_id")
        .in("match_id", matchIds)
        .range(from, to),
    ),
    selectAll<MatchEventRow>((from, to) =>
      supabase
        .from("match_event")
        .select("match_id, time, type, slot, target_slot, key, x, y")
        .in("match_id", matchIds)
        .order("time", { ascending: true })
        .range(from, to),
    ),
  ])

  const matchById = new Map(matches.map(m => [m.id, m]))
  const playersByMatch = new Map<number, SlotPlayer[]>()
  for (const player of players) {
    const list = playersByMatch.get(player.match_id) ?? []
    list.push(player)
    playersByMatch.set(player.match_id, list)
  }

  const out: PositionMatch[] = []
  for (const row of positionRows) {
    const match = matchById.get(row.match_id)
    if (!match) continue

    // Hero id is the join key because `match_player` has no player_slot column.
    // Sound only because heroes are unique within a Captains Mode game.
    const byHero = new Map(
      (playersByMatch.get(row.match_id) ?? []).map(p => [p.hero_id, p]),
    )

    const slots: PositionSlot[] = row.slot_hero_ids.map((heroId, slot) => {
      const player = byHero.get(heroId)
      return {
        slot,
        heroId,
        playerId: player?.player_id ?? null,
        playerName: player?.player_name ?? null,
        position: player?.position ?? null,
        teamId: player?.team_id ?? null,
      }
    })

    const isRadiant = teamId === null || match.radiant_team_id === teamId

    out.push({
      id: match.id,
      start_date_time: match.start_date_time,
      isRadiant,
      opponentTeamId: isRadiant ? match.dire_team_id : match.radiant_team_id,
      winning_team_id: match.winning_team_id,
      encoding: row.encoding,
      firstTime: row.first_time,
      sampleCount: row.sample_count,
      slots,
      positions: toBase64(zlib.gunzipSync(fromPgHex(row.positions))),
      lifeStates: toBase64(zlib.gunzipSync(fromPgHex(row.life_states))),
    })
  }

  out.sort((a, b) => b.start_date_time - a.start_date_time)

  return {
    matches: out,
    events: eventRows.map(({ match_id, ...event }) => ({
      matchId: match_id,
      ...event,
    })),
  }
}

async function getByTeam(
  leagueId: number,
  teamId: number,
): Promise<MatchPositionsApiResponse> {
  const matches = await selectAll<{ id: number }>((from, to) =>
    supabase
      .from("match")
      .select("id")
      .eq("league_id", leagueId)
      .or(
        `radiant_team_id.eq.${String(teamId)},dire_team_id.eq.${String(teamId)}`,
      )
      .range(from, to),
  )
  return build(
    matches.map(m => m.id),
    teamId,
  )
}

export default async function handler(
  req: { query: { leagueId?: string; teamId?: string; matchId?: string } },
  res: { status: (code: number) => { json: (data: unknown) => void } },
) {
  const { leagueId, teamId, matchId } = req.query

  try {
    if (matchId) {
      const id = parseInt(matchId, 10)
      if (Number.isNaN(id)) {
        res.status(400).json({ error: "matchId must be a number" })
        return
      }
      res.status(200).json(await build([id], null))
      return
    }

    if (leagueId && teamId) {
      const league = parseInt(leagueId, 10)
      const team = parseInt(teamId, 10)
      if (Number.isNaN(league) || Number.isNaN(team)) {
        res.status(400).json({ error: "leagueId and teamId must be numbers" })
        return
      }
      res.status(200).json(await getByTeam(league, team))
      return
    }

    res.status(400).json({ error: "matchId, or leagueId and teamId, required" })
  } catch (error) {
    console.error("Error in handler:", error)
    res.status(500).json({ error: "Failed to fetch position data" })
  }
}
