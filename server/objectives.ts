import type { MatchObjectiveRow } from "../types/db.js"

/**
 * One entry of OpenDota's `objectives[]`.
 *
 * Every field but `time` and `type` is optional because the array is a union of
 * unrelated event shapes flattened into one list: `building_kill` carries `key`
 * and sometimes `unit`, Roshan carries only `team`, aegis carries only
 * `player_slot`, courier carries `team` plus a `value`.
 */
export type OpenDotaObjective = {
  time: number
  type: string
  key?: string | number
  unit?: string
  team?: number
  player_slot?: number
  slot?: number
}

export type OpenDotaObjectiveLog = {
  objectives?: OpenDotaObjective[] | null
}

/**
 * Objective rows for a match, or `null` when OpenDota never parsed the replay.
 *
 * `null` and `[]` mean different things and both are returned on purpose, on the
 * same reasoning as `extractWards`: an unparsed match has no objectives array at
 * all, and recording that as "nothing was destroyed" would put a game where
 * every tower supposedly survived into the fall-rate denominator. A parsed match
 * always has at least the losing fort, so `[]` is close to unreachable in
 * practice — but it is returned rather than collapsed to `null`, because the
 * caller decides what an empty parse means, not this function.
 */
export function extractObjectives(
  match: OpenDotaObjectiveLog,
  matchId: number,
): MatchObjectiveRow[] | null {
  const objectives = match.objectives
  if (!objectives) return null

  return objectives.map(o => ({
    match_id: matchId,
    time: o.time,
    type: o.type,
    // First blood puts the victim's slot in `key` as a number, so `key` is not
    // reliably a building name — it is normalised to text and only read back for
    // `building_kill` rows.
    key: typeof o.key === "string" ? o.key : (o.key?.toString() ?? null),
    unit: o.unit ?? null,
    team: o.team ?? null,
    player_slot: o.player_slot ?? null,
    slot: o.slot ?? null,
  }))
}
