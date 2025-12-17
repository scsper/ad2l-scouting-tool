import { createClient } from "@supabase/supabase-js";

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? "";
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? "";

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

export type Team = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

type LeagueTeam = {
  team_id: number;
  league_id: number;
  created_at: string;
  team: Team;
}

export type LeagueTeamsResponse = Record<number, Record<number, string>>;

async function getTeamsByLeagueId(leagueId: string): Promise<LeagueTeamsResponse> {
  const leagueIdNum = parseInt(leagueId, 10);

  const result = await supabase
    .from('league_teams')
    .select('team_id, league_id, team(id, name)')
    .eq('league_id', leagueIdNum);

  if (result.error) {
    console.error("Error fetching teams for league:", result.error);
    throw result.error;
  }

  const leagueTeams = result.data as unknown as LeagueTeam[];

  // Transform to requested format: { league_id: { team_id: team_name, ... } }
  const response: LeagueTeamsResponse = {
    [leagueIdNum]: {}
  };

  leagueTeams.forEach(leagueTeam => {
    response[leagueIdNum][leagueTeam.team_id] = leagueTeam.team.name;
  });

  return response;
}

export default async function handler(
  req: { query: { leagueId: string } },
  res: {
    status: (code: number) => { json: (data: unknown) => void }
  },
) {
  const { leagueId } = req.query;

  if (!leagueId) {
    res.status(400).json({ error: "leagueId is required" });
    return;
  }

  try {
    const data = await getTeamsByLeagueId(leagueId);
    res.status(200).json(data);
  } catch (error) {
    console.error("Error in handler:", error);
    res.status(500).json({ error: "Failed to fetch teams data" });
  }
}

