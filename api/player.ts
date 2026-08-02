import { createClient } from "@supabase/supabase-js"
import type { PlayerRow } from "../types/db"

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/**
 * The person directory. Roster membership — which team, in which league, at
 * which role and rank — lives in `roster_member` and is served by `api/roster`.
 *
 * The only read here is a lookup by steam id, so the add-to-roster form can
 * recognise someone who already exists and prefill their name instead of
 * creating a second record for the same person.
 */
async function getPlayerById(playerId: number): Promise<PlayerRow | null> {
  const result = await supabase
    .from("player")
    .select("id, created_at, updated_at, name")
    .eq("id", playerId)
    .maybeSingle()

  if (result.error) {
    console.error("Error fetching player:", result.error)
    throw result.error
  }

  return result.data as PlayerRow | null
}

export default async function handler(
  req: {
    method: string
    query: { playerId?: string }
  },
  res: {
    status: (code: number) => { json: (data: unknown) => void }
  },
) {
  if (req.method === "GET") {
    const playerId = parseInt(req.query.playerId ?? "", 10)

    if (Number.isNaN(playerId)) {
      res.status(400).json({ error: "playerId is required" })
      return
    }

    try {
      const player = await getPlayerById(playerId)

      if (!player) {
        res.status(404).json({ error: "Player not found" })
        return
      }

      res.status(200).json(player)
    } catch (error) {
      console.error("Error in handler:", error)
      res.status(500).json({ error: "Failed to fetch player" })
    }
    return
  }

  res.status(405).json({ error: "Method not allowed" })
}
