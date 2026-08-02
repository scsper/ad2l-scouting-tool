import type { WardRecord } from "../types/db.js"

// OpenDota emits one entry per ward placement in `obs_log`/`sen_log`, and one per
// removal in `obs_left_log`/`sen_left_log`. The two are joined on `ehandle`, which
// is the engine's entity handle and is unique per ward within a match.
export type OpenDotaWardLogEntry = {
  time: number
  x: number
  y: number
  ehandle?: number
  attackername?: string
}

export type OpenDotaWardLogs = {
  obs_log?: OpenDotaWardLogEntry[]
  sen_log?: OpenDotaWardLogEntry[]
  obs_left_log?: OpenDotaWardLogEntry[]
  sen_left_log?: OpenDotaWardLogEntry[]
}

function pair(
  type: "obs" | "sen",
  placedLog: OpenDotaWardLogEntry[] | undefined,
  leftLog: OpenDotaWardLogEntry[] | undefined,
): WardRecord[] {
  // Index removals by ehandle. A ward with no matching removal was still
  // standing when the game ended — that is a real state, not missing data, and
  // it must round-trip as `left: null` so "alive at T" treats it as up.
  const removals = new Map<number, OpenDotaWardLogEntry>()
  for (const entry of leftLog ?? []) {
    if (entry.ehandle !== undefined) removals.set(entry.ehandle, entry)
  }

  return (placedLog ?? []).map(entry => {
    const removal =
      entry.ehandle === undefined ? undefined : removals.get(entry.ehandle)
    return {
      type,
      x: entry.x,
      y: entry.y,
      placed: entry.time,
      left: removal?.time ?? null,
      by: removal?.attackername?.replace(/^npc_dota_hero_/, "") ?? null,
    }
  })
}

/**
 * Extract every ward this player placed, in placement order.
 *
 * Returns `[]` when the player placed none — the caller must not turn that into
 * `null`, which means "never ward-parsed" (see migrations/add_wards.sql).
 * Returns `null` only when the replay was never parsed, i.e. all four logs are
 * absent; an unparsed match has no ward data at all rather than empty arrays.
 */
export function extractWards(player: OpenDotaWardLogs): WardRecord[] | null {
  const hasAnyLog =
    player.obs_log !== undefined ||
    player.sen_log !== undefined ||
    player.obs_left_log !== undefined ||
    player.sen_left_log !== undefined
  if (!hasAnyLog) return null

  return [
    ...pair("obs", player.obs_log, player.obs_left_log),
    ...pair("sen", player.sen_log, player.sen_left_log),
  ].sort((a, b) => a.placed - b.placed)
}
