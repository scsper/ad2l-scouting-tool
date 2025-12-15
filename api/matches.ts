import { createClient } from "@supabase/supabase-js";

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? "";
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? "";

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

type MatchPlayerRow = {
  player_id: number;
  match_id: number;
  league_id: number;
  winning_team_id: number | null;
  radiant_team_id: number | null;
  dire_team_id: number | null;
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
  league_id: number;
  winning_team_id: number | null;
  radiant_team_id: number | null;
  dire_team_id: number | null;
  order: number;
  hero_id: number;
  team_id: number | null;
  is_pick: boolean;
}

type MatchData = {
  match_id: number;
  league_id: number;
  winning_team_id: number | null;
  radiant_team_id: number | null;
  dire_team_id: number | null;
  players: MatchPlayerRow[];
  draft: MatchDraftRow[];
}

async function getMatchesByLeagueAndTeam(
  leagueId: string,
  teamId: string
): Promise<MatchData[]> {
  const leagueIdNum = parseInt(leagueId, 10);
  const teamIdNum = parseInt(teamId, 10);

  // Get all match players for the specified league and team
  const { data: players, error: playersError } = await supabase
    .from('match_player')
    .select('*')
    .eq('league_id', leagueIdNum)
    .or(`radiant_team_id.eq.${String(teamIdNum)},dire_team_id.eq.${String(teamIdNum)}`)
    .order('match_id', { ascending: false });

  if (playersError) {
    console.error("Error fetching match players:", playersError);
    throw playersError;
  }

  if (players.length === 0) {
    return [];
  }

  // Get unique match IDs
  const matchIds = [...new Set((players as MatchPlayerRow[]).map(p => p.match_id))];

  // Get draft data for these matches
  const { data: drafts, error: draftsError } = await supabase
    .from('match_draft')
    .select('*')
    .in('match_id', matchIds)
    .order('order', { ascending: true });

  if (draftsError) {
    console.error("Error fetching match drafts:", draftsError);
    throw draftsError;
  }

  // Group data by match_id
  const matchesMap = new Map<number, MatchData>();

  (players as MatchPlayerRow[]).forEach(player => {
    if (!matchesMap.has(player.match_id)) {
      matchesMap.set(player.match_id, {
        match_id: player.match_id,
        league_id: player.league_id,
        winning_team_id: player.winning_team_id,
        radiant_team_id: player.radiant_team_id,
        dire_team_id: player.dire_team_id,
        players: [],
        draft: []
      });
    }
    const match = matchesMap.get(player.match_id);
    if (match) {
      match.players.push(player);
    }
  });

  (drafts as MatchDraftRow[]).forEach(draft => {
    const match = matchesMap.get(draft.match_id);
    if (match) {
      match.draft.push(draft);
    }
  });

  return Array.from(matchesMap.values());
}

export default async function handler(
  req: { query: { leagueId: string; teamId: string } },
  res: {
    status: (code: number) => { json: (data: unknown) => void }
  },
) {
  const { leagueId, teamId } = req.query

  try {
    const data = await getMatchesByLeagueAndTeam(leagueId, teamId);
    res.status(200).json(data);
  } catch (error) {
    console.error("Error in handler:", error);
    res.status(500).json({ error: "Failed to fetch match data" });
  }
}

