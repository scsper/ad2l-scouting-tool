type MatchRow = {
  id: number;
  league_id: number;
  winning_team_id: number | null;
  radiant_team_id: number | null;
  dire_team_id: number | null;
  start_date_time: number;
  end_date_time: number;
}

type MatchPlayerRow = {
  player_id: number;
  match_id: number;
  team_id: number | null;
  player_name: string | null;
  hero_id: number;
  position: string | null;
  lane_outcome: string | null;
  lane: string | null;
  kills: number;
  deaths: number;
  assists: number;
  last_hits: number;
  denies: number;
  gpm: number;
  xpm: number;
  hero_damage: number;
  tower_damage: number;
}

type MatchDraftRow = {
  match_id: number;
  order: number;
  hero_id: number;
  team_id: number | null;
  is_pick: boolean;
}

export type { MatchRow, MatchPlayerRow, MatchDraftRow };
