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

type HeroCounterRow = {
  hero_id: number
  counter_hero_id: number
  synergy: number
  updated_at: string
}

type HeroStatsRow = {
  hero_id: number
  hero_name: string
  all_pick: number
  all_win: number
  legend_plus_pick: number
  legend_plus_win: number
  legend_surrounding_pick: number
  legend_surrounding_win: number
  legend_pick: number
  legend_win: number
  updated_at: string
}

type HeroCounterAnalysisRow = {
  hero_a: number
  hero_b: number
  // All ranks
  overall_wr_a: number
  overall_wr_b: number
  observed_wr_a_vs_b: number
  expected_wr_a_vs_b: number
  shrunk_wr_a_vs_b: number
  matchup_games: number
  counter_score: number
  z_score: number
  p_value: number
  significant: boolean
  label: string
  // Legend+ bracket
  overall_wr_a_legend_plus: number | null
  overall_wr_b_legend_plus: number | null
  expected_wr_a_vs_b_legend_plus: number | null
  shrunk_wr_a_vs_b_legend_plus: number | null
  counter_score_legend_plus: number | null
  z_score_legend_plus: number | null
  p_value_legend_plus: number | null
  significant_legend_plus: boolean | null
  label_legend_plus: string | null
  // Legend surrounding bracket
  overall_wr_a_legend_surrounding: number | null
  overall_wr_b_legend_surrounding: number | null
  expected_wr_a_vs_b_legend_surrounding: number | null
  shrunk_wr_a_vs_b_legend_surrounding: number | null
  counter_score_legend_surrounding: number | null
  z_score_legend_surrounding: number | null
  p_value_legend_surrounding: number | null
  significant_legend_surrounding: boolean | null
  label_legend_surrounding: string | null
  updated_at: string
}

export type {
  MatchRow,
  MatchPlayerRow,
  MatchDraftRow,
  PlayerRow,
  PlayerPubMatchStatsRow,
  HeroCounterRow,
  HeroStatsRow,
  HeroCounterAnalysisRow,
}
