type MatchRow = {
  id: number
  league_id: number
  winning_team_id: number | null
  radiant_team_id: number | null
  dire_team_id: number | null
  start_date_time: number
  end_date_time: number
  /**
   * OpenDota's patch index (57=7.38, 58=7.39, 59=7.40, 60=7.41). Stored rather
   * than derived from `start_date_time`, because 7.38 and 7.39 share a minimap
   * image and cannot be told apart by date bucket — and the Roshan pit rule is
   * gated on the exact patch. `null` on rows predating the objectives backfill.
   */
  patch?: number | null
  /**
   * Whether OpenDota's `objectives[]` was ever read for this match. The
   * relational twin of the NULL-vs-`[]` contract on `match_player.wards`:
   * without it, "no match_objective rows" cannot be told apart from "parsed,
   * nothing was destroyed", and unparsed games would read as games where every
   * building survived — deflating every fall rate.
   */
  objectives_parsed?: boolean
}

/** OpenDota objective types we store. Kept as the upstream strings verbatim. */
type ObjectiveType =
  | "building_kill"
  | "CHAT_MESSAGE_ROSHAN_KILL"
  /** Tormentor. */
  | "CHAT_MESSAGE_MINIBOSS_KILL"
  | "CHAT_MESSAGE_AEGIS"
  | "CHAT_MESSAGE_FIRSTBLOOD"
  | "CHAT_MESSAGE_COURIER_LOST"

/**
 * One row of OpenDota's `objectives[]`.
 *
 * Deliberately heterogeneous, because the upstream array is: only
 * `building_kill` carries `key` (the building's entity name), Roshan carries
 * only `team`, and aegis carries only `player_slot`. Narrowing on `type` is the
 * only safe way to read the optional fields.
 */
type MatchObjectiveRow = {
  match_id: number
  /** Seconds relative to the horn. Can be negative — first blood often is. */
  time: number
  /**
   * Stored as free text, not the `ObjectiveType` union: the union names the
   * types we know about today, and OpenDota adding a new event must widen the
   * data rather than fail to parse it.
   */
  type: string
  /** e.g. "npc_dota_goodguys_tower1_bot". Only on `building_kill`. */
  key: string | null
  /** The killing unit, when it was not a hero (e.g. a flagbearer creep). */
  unit: string | null
  /** 2 = Radiant, 3 = Dire. On Roshan/Tormentor rows this is the KILLER. */
  team: number | null
  player_slot: number | null
  slot: number | null
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
  ObjectiveType,
  MatchObjectiveRow,
  MatchPlayerRow,
  MatchDraftRow,
  PlayerRow,
  RosterMemberRow,
  RosterEntry,
  PlayerPubMatchStatsRow,
}
