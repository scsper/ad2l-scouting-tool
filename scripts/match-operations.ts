import { createClient } from "@supabase/supabase-js";
import type { MatchRow, MatchPlayerRow, MatchDraftRow } from "../types/db";

const API_URL = "https://api.opendota.com/api/matches";
const OPENDOTA_API_KEY = process.env.OPENDOTA_API_TOKEN ?? "";
const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? "";
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? "";

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// OpenDota API response types
type OpenDotaTeam = {
  team_id?: number;
  name?: string;
}

type OpenDotaPickBan = {
  is_pick: boolean;
  hero_id: number;
  team: 0 | 1; // 0 = radiant, 1 = dire
  order: number;
}

type OpenDotaPlayer = {
  account_id?: number;
  personaname?: string;
  hero_id: number;
  player_slot: number; // 0-127 = radiant, 128-255 = dire
  kills: number;
  deaths: number;
  assists: number;
  last_hits: number;
  denies: number;
  gold_per_min: number;
  xp_per_min: number;
  hero_damage: number;
  tower_damage: number;
  lane?: number;
  lane_role?: number;
  is_roaming?: boolean;
}

// OpenDota match response
type OpenDotaMatch = {
  match_id: number;
  radiant_win: boolean;
  start_time: number;
  duration: number;
  leagueid?: number;
  radiant_team_id?: number;
  dire_team_id?: number;
  radiant_team?: OpenDotaTeam;
  dire_team?: OpenDotaTeam;
  picks_bans?: OpenDotaPickBan[];
  players: OpenDotaPlayer[];
}

// Internal types (matching Stratz structure for compatibility)
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

export type Match = {
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

// Helper to convert lane number to lane string
function getLaneString(lane?: number, isRoaming?: boolean): string | null {
  if (isRoaming) return "ROAMING";
  if (lane === undefined || lane === null) return null;

  // OpenDota lane values: 1=safe, 2=mid, 3=off, 4=jungle
  switch (lane) {
    case 1: return "SAFE_LANE";
    case 2: return "MID_LANE";
    case 3: return "OFF_LANE";
    case 4: return "JUNGLE";
    default: return null;
  }
}

// Helper to convert lane_role to position string
function getPositionString(laneRole?: number): string | null {
  if (laneRole === undefined || laneRole === null) return null;

  // OpenDota lane_role values: 1=carry, 2=mid, 3=offlane, 4=support, 5=hard support
  switch (laneRole) {
    case 1: return "POSITION_1";
    case 2: return "POSITION_2";
    case 3: return "POSITION_3";
    case 4: return "POSITION_4";
    case 5: return "POSITION_5";
    default: return null;
  }
}

// Transform OpenDota match to internal Match format
function transformOpenDotaMatch(openDotaMatch: OpenDotaMatch): Match {
  const endDateTime = openDotaMatch.start_time + openDotaMatch.duration;

  // Transform players
  const players: Player[] = openDotaMatch.players.map(player => {
    const isRadiant = player.player_slot < 128;
    const isVictory = (isRadiant && openDotaMatch.radiant_win) || (!isRadiant && !openDotaMatch.radiant_win);

    return {
      steamAccount: player.account_id ? {
        id: player.account_id,
        name: player.personaname ?? null
      } : null,
      heroId: player.hero_id,
      isVictory,
      isRadiant,
      lane: getLaneString(player.lane, player.is_roaming),
      position: getPositionString(player.lane_role),
      kills: player.kills,
      deaths: player.deaths,
      assists: player.assists,
      numLastHits: player.last_hits,
      numDenies: player.denies,
      goldPerMinute: player.gold_per_min,
      experiencePerMinute: player.xp_per_min,
      heroDamage: player.hero_damage,
      towerDamage: player.tower_damage
    };
  });

  // Transform picks and bans
  const pickBans: PickBan[] = (openDotaMatch.picks_bans ?? []).map(pb => ({
    isPick: pb.is_pick,
    heroId: pb.hero_id,
    order: pb.order,
    isRadiant: pb.team === 0
  }));

  // Transform teams - prioritize direct team IDs, fall back to nested team object
  const radiantTeamId = openDotaMatch.radiant_team_id ?? openDotaMatch.radiant_team?.team_id;
  const direTeamId = openDotaMatch.dire_team_id ?? openDotaMatch.dire_team?.team_id;

  const radiantTeam: Team | null = radiantTeamId ? {
    id: radiantTeamId,
    name: openDotaMatch.radiant_team?.name ?? "Radiant"
  } : null;

  const direTeam: Team | null = direTeamId ? {
    id: direTeamId,
    name: openDotaMatch.dire_team?.name ?? "Dire"
  } : null;

  return {
    id: openDotaMatch.match_id,
    didRadiantWin: openDotaMatch.radiant_win,
    startDateTime: openDotaMatch.start_time,
    endDateTime,
    leagueId: openDotaMatch.leagueid ?? 0,
    radiantTeam,
    direTeam,
    topLaneOutcome: null, // OpenDota doesn't provide lane outcomes
    midLaneOutcome: null,
    bottomLaneOutcome: null,
    pickBans,
    players
  };
}

export async function getMatch(matchId: number): Promise<MatchResponse | undefined> {
  const url = `${API_URL}/${matchId}${OPENDOTA_API_KEY ? `?api_key=${OPENDOTA_API_KEY}` : ''}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    }
  });

  if (!response.ok) {
    console.error(`API Error: ${response.status} ${response.statusText}`);
    return;
  }

  const openDotaMatch = await response.json() as OpenDotaMatch;

  if ('error' in openDotaMatch) {
    console.error("OpenDota API Error:", openDotaMatch.error);
    return;
  }

  const match = transformOpenDotaMatch(openDotaMatch);

  return {
    data: {
      match
    }
  };
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
  const matchPlayerRows: MatchPlayerRow[] = matchData.players.map((player) => ({
    player_id: player.steamAccount?.id ?? 0,
    match_id: matchData.id,
    team_id: player.isRadiant ? matchData.radiantTeam?.id ?? null : matchData.direTeam?.id ?? null,
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
  const matchDraftRows: MatchDraftRow[] = matchData.pickBans.map((pickBan) => ({
    match_id: matchData.id,
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

export async function convertMatchDataToMatchTable(matchData: Match): Promise<MatchRow[]> {
  const matchRow: MatchRow = {
    id: matchData.id,
    league_id: matchData.leagueId,
    winning_team_id: matchData.didRadiantWin ? matchData.radiantTeam?.id ?? null : matchData.direTeam?.id ?? null,
    radiant_team_id: matchData.radiantTeam?.id ?? null,
    dire_team_id: matchData.direTeam?.id ?? null,
    start_date_time: matchData.startDateTime,
    end_date_time: matchData.endDateTime,
  };

  const { data, error } = await supabase
    .from('match')
    .insert(matchRow)
    .select();

  if (error) {
    console.error("Error inserting match:", error);
    throw error;
  }

  console.log(`Successfully inserted match ${String(matchData.id)}`);
  return data as MatchRow[];
}


