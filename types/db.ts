type MatchRow = {
  id: number
  league_id: number
  winning_team_id: number | null
  radiant_team_id: number | null
  dire_team_id: number | null
  start_date_time: number
  end_date_time: number
}

// A single ward placement, extracted from OpenDota's replay-parsed logs.
// Times are seconds relative to the horn and can be negative (pre-horn setup).
type WardRecord = {
  type: "obs" | "sen"
  x: number
  y: number
  placed: number
  // null when the ward was still standing at game end.
  left: number | null
  // Killing hero, "npc_dota_hero_" prefix stripped. OpenDota populates this on
  // natural expiries too, so it does NOT mean the ward was dewarded — compare
  // lifespan against the nominal duration for that (see src/utils/ward-map.ts).
  by: string | null
}

type MatchPlayerRow = {
  player_id: number
  match_id: number
  team_id: number | null
  player_name: string | null
  hero_id: number
  position: string | null
  lane_outcome: string | null
  lane: string | null
  kills: number
  deaths: number
  assists: number
  last_hits: number
  denies: number
  gpm: number
  xpm: number
  hero_damage: number
  tower_damage: number
  /**
   * Wards placed. Nullable on purpose and required on purpose: `null` means we
   * have no ward data for the row (OpenDota never parsed the match, or it was
   * hand-entered from post-game screenshots, which don't show ward counts),
   * while `0` means the player placed none. Ward averages skip `null` but
   * include real zeroes, so the two must never be collapsed. Unlike the
   * `*_at_10` fields below, these are not optional — every construction site
   * should have to say which one it means.
   */
  obs_placed: number | null
  sen_placed: number | null
  gold_at_10?: number | null
  xp_at_10?: number | null
  lh_at_10?: number | null
  denies_at_10?: number | null
  // null = never ward-parsed; [] = parsed, placed nothing. See migrations/add_wards.sql.
  wards?: WardRecord[] | null
}

type MatchDraftRow = {
  match_id: number
  order: number
  hero_id: number
  team_id: number | null
  is_pick: boolean
}

/** A person. Roster membership lives in `roster_member`, scoped to a league. */
type PlayerRow = {
  id: number
  created_at: string
  updated_at: string
  name: string
}

/**
 * One player's membership of one team's roster for one league. A team fields a
 * different lineup each season, so `role` and both ranks are per-league facts,
 * not per-person ones.
 */
type RosterMemberRow = {
  league_id: number
  team_id: number
  player_id: number
  role: string
  /** Free text, e.g. "Archon V". Their rank during this league. */
  rank: string | null
  /** Free text. The rank they registered at, which gates stand-in validity. */
  original_rank: string | null
  /**
   * A stand-in rather than a registered member. Declared up front, because the
   * useful time to know about a sub is before they've played — which is exactly
   * when match data can't tell you. Someone can be a stand-in here while being a
   * registered member of another team in the same league.
   */
  is_stand_in: boolean
  created_at: string
  updated_at: string
}

/** A `roster_member` row joined to the person it refers to. */
type RosterEntry = RosterMemberRow & { name: string }

type PlayerPubMatchStatsRow = {
  id: number
  player_id: number
  created_at: string
  hero_id: number
  wins: number
  losses: number
  type: "RECENT_MATCH" | "TOP_10_HEROES_BY_POSITION" | "TOP_10_HEROES_OVERALL"
  last_match_date_time: string | null
}

export type {
  MatchRow,
  WardRecord,
  MatchPlayerRow,
  MatchDraftRow,
  PlayerRow,
  RosterMemberRow,
  RosterEntry,
  PlayerPubMatchStatsRow,
}
