import { createClient } from "@supabase/supabase-js";
import { isDivision } from "../shared/divisions.js";
import { UnauthorizedError, requireAuth } from "../server/require-auth.js";

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
  division: string | null;
  created_at: string;
  team: Team;
}

export type LeagueTeamEntry = {
  name: string;
  /** NULL for teams recorded before divisions, or added without one. */
  division: string | null;
}

export type LeagueTeamsResponse = Record<number, Record<number, LeagueTeamEntry>>;

export type AddTeamToLeagueRequest = {
  league_id: number;
  team_id: number;
  division: string;
  /** Required only when we have no `team` row for this id yet. */
  name?: string;
}

async function getTeamsByLeagueId(leagueId: string): Promise<LeagueTeamsResponse> {
  const leagueIdNum = parseInt(leagueId, 10);

  const result = await supabase
    .from('league_teams')
    .select('team_id, league_id, division, team(id, name)')
    .eq('league_id', leagueIdNum);

  if (result.error) {
    console.error("Error fetching teams for league:", result.error);
    throw result.error;
  }

  const leagueTeams = result.data as unknown as LeagueTeam[];

  // Transform to requested format: { league_id: { team_id: { name, division } } }
  const response: LeagueTeamsResponse = {
    [leagueIdNum]: {}
  };

  leagueTeams.forEach(leagueTeam => {
    response[leagueIdNum][leagueTeam.team_id] = {
      name: leagueTeam.team.name,
      division: leagueTeam.division,
    };
  });

  return response;
}

/**
 * Register a team in a league under a division, or move one already registered.
 *
 * Upsert rather than insert because this is also the only way to correct a
 * division: teams are added lazily, one scrim opponent at a time, so a wrong or
 * forgotten division is a routine mistake and there is no other UI to fix it.
 *
 * The `team` row is created here when it's missing, which parsing deliberately
 * refuses to do (see `getLeagueMembershipWarnings`). That rule protects the
 * parse path from inventing rows as a side effect; this route is the explicit
 * act it was reserving the decision for. An existing team keeps its stored name
 * — renaming an org is not what "add to league" should quietly do.
 */
async function addTeamToLeague(body: AddTeamToLeagueRequest): Promise<LeagueTeamEntry> {
  const existing = await supabase
    .from('team')
    .select('name')
    .eq('id', body.team_id)
    .maybeSingle();

  if (existing.error) {
    console.error("Error looking up team:", existing.error);
    throw existing.error;
  }

  let name = (existing.data as { name: string } | null)?.name;

  if (name === undefined) {
    // OpenDota's /api/teams only covers pro teams and returns empty for AD2L
    // orgs, so there is nothing to auto-fill from — the caller has to supply it.
    if (!body.name) throw new Error("TEAM_NAME_REQUIRED");

    const inserted = await supabase
      .from('team')
      .insert({ id: body.team_id, name: body.name })
      .select('name')
      .single();

    if (inserted.error) {
      console.error("Error creating team:", inserted.error);
      throw inserted.error;
    }

    name = (inserted.data as { name: string }).name;
  }

  const membership = await supabase
    .from('league_teams')
    .upsert(
      { league_id: body.league_id, team_id: body.team_id, division: body.division },
      { onConflict: "league_id,team_id" },
    )
    .select('division')
    .single();

  if (membership.error) {
    console.error("Error adding team to league:", membership.error);
    throw membership.error;
  }

  return { name, division: (membership.data as { division: string | null }).division };
}

export default async function handler(
  req: {
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    query: { leagueId: string };
    body?: Partial<AddTeamToLeagueRequest>;
  },
  res: {
    status: (code: number) => { json: (data: unknown) => void }
  },
) {
  if (req.method === "POST") {
    const authorization = req.headers.authorization;
    try {
      await requireAuth(Array.isArray(authorization) ? authorization[0] : authorization);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        res.status(401).json({ error: error.message });
        return;
      }
      console.error("Error verifying session:", error);
      res.status(500).json({ error: "Failed to verify session" });
      return;
    }

    const body = req.body;
    if (!body) {
      res.status(400).json({ error: "A request body is required" });
      return;
    }

    const { league_id, team_id, division, name } = body;

    if (!Number.isInteger(league_id) || !Number.isInteger(team_id)) {
      res.status(400).json({ error: "league_id and team_id must be integers" });
      return;
    }

    // Unknown division names would each become a bracket of their own in the
    // picker, since a league's divisions are derived from these rows.
    if (!isDivision(division)) {
      res.status(400).json({ error: "division is not a recognized division" });
      return;
    }

    try {
      const data = await addTeamToLeague({
        league_id: league_id!,
        team_id: team_id!,
        division,
        name: name?.trim(),
      });
      res.status(201).json(data);
    } catch (error) {
      if (error instanceof Error && error.message === "TEAM_NAME_REQUIRED") {
        res.status(400).json({ error: "This team is new, so a name is required" });
        return;
      }
      console.error("Error in handler:", error);
      res.status(500).json({ error: "Failed to add team to league" });
    }
    return;
  }

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
