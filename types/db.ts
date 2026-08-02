type MatchRow = {
  id: number
  league_id: number
  winning_team_id: number | null
  radiant_team_id: number | null
  dire_team_id: number | null
  start_date_time: number
  end_date_time: number
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
  MatchPlayerRow,
  MatchDraftRow,
  PlayerRow,
  RosterMemberRow,
  RosterEntry,
  PlayerPubMatchStatsRow,
}
