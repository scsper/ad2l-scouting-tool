import { createClient } from "@supabase/supabase-js";

const API_URL = "https://api.stratz.com/graphql";
const STRATZ_API_KEY = process.env.STRATZ_API_TOKEN ?? "";
const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? "";
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? "";

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const QUERY = `query GetMatch($matchId: Long!) {
	match(id: $matchId) {
    id
    didRadiantWin
    startDateTime
    endDateTime
    leagueId
    radiantTeam {
      id
      name
    }
    direTeam {
      id
      name
    }
    topLaneOutcome
    midLaneOutcome
    bottomLaneOutcome
    pickBans {
      isPick
      heroId
      order
      isRadiant
    }
		players {
      steamAccount {
        id
        name
      }
      heroId
      isVictory
      isRadiant
      lane
      position
      kills
      deaths
      assists
      numLastHits
      numDenies
      goldPerMinute
      experiencePerMinute
      heroDamage
      towerDamage
    }
  }
}`

type Team = {
  id: number;
  name: string;
}

type PickBan = {
  isPick: boolean;
  heroId: number;
  order: number;
  isRadiant: boolean;
}

type SteamAccount = {
  id: number;
  name: string | null;
}

type Player = {
  steamAccount: SteamAccount | null;
  heroId: number;
  isVictory: boolean;
  isRadiant: boolean;
  lane: string | null;
  position: string | null;
  kills: number;
  deaths: number;
  assists: number;
  numLastHits: number;
  numDenies: number;
  goldPerMinute: number;
  experiencePerMinute: number;
  heroDamage: number;
  towerDamage: number;
}

type Match = {
  id: number;
  didRadiantWin: boolean;
  startDateTime: number;
  endDateTime: number;
  leagueId: number;
  radiantTeam: Team | null;
  direTeam: Team | null;
  topLaneOutcome: string | null;
  midLaneOutcome: string | null;
  bottomLaneOutcome: string | null;
  pickBans: PickBan[];
  players: Player[];
}

type MatchResponse = {
  data: {
    match: Match;
  };
}

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

function getVariablesForGetMatch(matchId: number) {
  return {
    "matchId": matchId
  }
}

export async function getMatch(matchId: number): Promise<MatchResponse | undefined> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": 'STRATZ_API',
      "Authorization": `Bearer ${STRATZ_API_KEY}`
    },
    body: JSON.stringify({ query: QUERY, variables: getVariablesForGetMatch(matchId) })
  });

  const matchData = await response.json() as MatchResponse;

  if ('errors' in matchData) {
    console.error("GraphQL Error:", matchData.errors);
    return;
  }

  return matchData;
}

function getMatchIdFromCommandLine(): number {
  const matchIdArg = process.argv[2];

  if (!matchIdArg) {
    console.error("Error: Match ID is required");
    console.log("Usage: tsx parse-match.ts <matchId>");
    process.exit(1);
  }

  const matchId = parseInt(matchIdArg, 10);

  if (isNaN(matchId)) {
    console.error(`Error: Invalid match ID "${matchIdArg}". Must be a number.`);
    process.exit(1);
  }

  return matchId;
}

export function convertMatchDataToDbSchema(matchData: Match) {
  // TODO: Implement conversion logic
  return matchData;
}

function getLaneOutcome(match: Match, player: Player): string | null {
  if (!player.lane) return null;

  const lane = player.lane.toLowerCase();

  // Map lane to outcome based on whether player is radiant or dire
  // In Dota 2 map layout:
  // - Top lane: Radiant off lane / Dire safe lane
  // - Mid lane: Mid for both teams
  // - Bottom lane: Radiant safe lane / Dire off lane
  if (lane.includes('mid')) {
    return match.midLaneOutcome;
  }

  if (player.isRadiant) {
    if (lane.includes('safe')) {
      return match.bottomLaneOutcome;
    } else if (lane.includes('off')) {
      return match.topLaneOutcome;
    }
  } else {
    // Dire team
    if (lane.includes('safe')) {
      return match.topLaneOutcome;
    } else if (lane.includes('off')) {
      return match.bottomLaneOutcome;
    }
  }

  // For jungle/roaming positions, no specific lane outcome
  return null;
}

export async function convertMatchDataToMatchPlayersTable(matchData: Match): Promise<MatchPlayerRow[]> {
  const winningTeamId = matchData.didRadiantWin
    ? matchData.radiantTeam?.id ?? null
    : matchData.direTeam?.id ?? null;

  const matchPlayerRows: MatchPlayerRow[] = matchData.players.map((player) => ({
    player_id: player.steamAccount?.id ?? 0,
    match_id: matchData.id,
    team_id: player.isRadiant ? matchData.radiantTeam?.id ?? null : matchData.direTeam?.id ?? null,
    league_id: matchData.leagueId,
    winning_team_id: winningTeamId,
    radiant_team_id: matchData.radiantTeam?.id ?? null,
    dire_team_id: matchData.direTeam?.id ?? null,
    player_name: player.steamAccount?.name ?? null,
    hero_id: player.heroId,
    position: player.position,
    lane_outcome: getLaneOutcome(matchData, player),
    lane: player.lane,
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    last_hits: player.numLastHits,
    denies: player.numDenies,
    gpm: player.goldPerMinute,
    xpm: player.experiencePerMinute,
    hero_damage: player.heroDamage,
    tower_damage: player.towerDamage,
  }));

  const { data, error } = await supabase
    .from('match_player')
    .insert(matchPlayerRows)
    .select();

  if (error) {
    console.error("Error inserting match player:", error);
    throw error;
  }

  console.log(`Successfully inserted ${String(matchPlayerRows.length)} players for match ${String(matchData.id)}`);
  return data as MatchPlayerRow[];
}

export async function convertMatchDataToMatchDraftTable(matchData: Match): Promise<MatchDraftRow[]> {
  const winningTeamId = matchData.didRadiantWin
    ? matchData.radiantTeam?.id ?? null
    : matchData.direTeam?.id ?? null;

  const matchDraftRows: MatchDraftRow[] = matchData.pickBans.map((pickBan) => ({
    match_id: matchData.id,
    league_id: matchData.leagueId,
    winning_team_id: winningTeamId,
    radiant_team_id: matchData.radiantTeam?.id ?? null,
    dire_team_id: matchData.direTeam?.id ?? null,
    order: pickBan.order,
    hero_id: pickBan.heroId,
    team_id: pickBan.isRadiant
      ? matchData.radiantTeam?.id ?? null
      : matchData.direTeam?.id ?? null,
    is_pick: pickBan.isPick,
  }));

  const { data, error } = await supabase
    .from('match_draft')
    .insert(matchDraftRows)
    .select();

  if (error) {
    console.error("Error inserting match draft:", error);
    throw error;
  }

  console.log(`Successfully inserted ${String(matchDraftRows.length)} picks/bans for match ${String(matchData.id)}`);
  return data as MatchDraftRow[];
}

// Main execution
const matchId = getMatchIdFromCommandLine();
const matchData = await getMatch(matchId);
convertMatchDataToMatchPlayersTable(matchData?.data.match ?? {} as Match).catch(console.error);
convertMatchDataToMatchDraftTable(matchData?.data.match ?? {} as Match).catch(console.error);
// console.log(JSON.stringify(matchData, null, 2));


