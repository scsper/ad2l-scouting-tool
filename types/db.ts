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

type PlayerRow = {
  id: number
  created_at: string
  updated_at: string
  team_id: number
  role: string
  name: string
  rank: string
}

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
  PlayerPubMatchStatsRow,
}
