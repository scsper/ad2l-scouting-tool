import { createClient } from "@supabase/supabase-js";
import type { MatchApiResponse } from "../types/api";
import type { MatchRow, MatchDraftRow, MatchPlayerRow } from "../types/db";
import { selectAll } from "./lib/select-all.js";

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

  // Get all matches for the specified league and team. Paged like the league
  // aggregates: one team's drafts peak around 550 rows today, under PostgREST's
  // silent 1000-row ceiling but only just, and it grows every season. Truncation
  // would drop games from a scouting report without saying so.
  const matches = await selectAll<MatchRow>((from, to) => supabase
    .from('match')
    .select('*')
    .eq('league_id', leagueIdNum)
    .or(`radiant_team_id.eq.${String(teamIdNum)},dire_team_id.eq.${String(teamIdNum)}`)
    .order('start_date_time', { ascending: false })
    .range(from, to));

  if (matches.length === 0) {
    return [];
  }

  // Get match IDs
  const matchIds = matches.map(m => m.id);

  const [players, drafts] = await Promise.all([
    // Get all match players for these matches
    selectAll<MatchPlayerRow>((from, to) => supabase
      .from('match_player')
      .select('*')
      .in('match_id', matchIds)
      .range(from, to)),
    // Get draft data for these matches
    selectAll<MatchDraftRow>((from, to) => supabase
      .from('match_draft')
      .select('*')
      .in('match_id', matchIds)
      .order('order', { ascending: true })
      .range(from, to)),
  ]);

  // Group data by match_id
  const matchesMap = new Map<number, MatchApiResponse>();

  // Initialize with match data
  matches.forEach(match => {
    matchesMap.set(match.id, {
      ...match,
      players: [],
      draft: []
    });
  });

  // Add players to their matches
  players.forEach(player => {
    const match = matchesMap.get(player.match_id);
    if (match) {
      match.players.push(player);
    }
  });

  // Add drafts to their matches
  drafts.forEach(draft => {
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

