import { createClient } from "@supabase/supabase-js";
import type { MatchApiResponse } from "../types/api";
import type { MatchRow, MatchDraftRow, MatchPlayerRow } from "../types/db";

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? "";
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? "";

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function getMatchesByLeagueAndTeam(
  leagueId: string,
  teamId: string
): Promise<MatchApiResponse[]> {
  const leagueIdNum = parseInt(leagueId, 10);
  const teamIdNum = parseInt(teamId, 10);

  // Get all matches for the specified league and team
  const { data: matches, error: matchesError } = await supabase
    .from('match')
    .select('*')
    .eq('league_id', leagueIdNum)
    .or(`radiant_team_id.eq.${String(teamIdNum)},dire_team_id.eq.${String(teamIdNum)}`)
    .order('id', { ascending: false });

  if (matchesError) {
    console.error("Error fetching matches:", matchesError);
    throw matchesError;
  }

  if (matches.length === 0) {
    return [];
  }

  // Get match IDs
  const matchIds = (matches as MatchRow[]).map(m => m.id);

  // Get all match players for these matches
  const { data: players, error: playersError } = await supabase
    .from('match_player')
    .select('*')
    .in('match_id', matchIds);

  if (playersError) {
    console.error("Error fetching match players:", playersError);
    throw playersError;
  }

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
  const matchesMap = new Map<number, MatchApiResponse>();

  // Initialize with match data
  (matches as MatchRow[]).forEach(match => {
    matchesMap.set(match.id, {
      ...match,
      players: [],
      draft: []
    });
  });

  // Add players to their matches
  (players as MatchPlayerRow[]).forEach(player => {
    const match = matchesMap.get(player.match_id);
    if (match) {
      match.players.push(player);
    }
  });

  // Add drafts to their matches
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

