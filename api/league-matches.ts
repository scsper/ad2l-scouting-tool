import { createClient } from "@supabase/supabase-js";
import type { MatchDraftRow, MatchPlayerRow, MatchRow } from "../types/db.js";
import { selectAll } from "../server/select-all.js";

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? "";
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? "";

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

export type LeagueMatchPlayer = Pick<MatchPlayerRow, 'match_id' | 'hero_id' | 'position' | 'team_id'>;

export type LeagueMatch = Pick<MatchRow, 'id' | 'winning_team_id' | 'radiant_team_id' | 'dire_team_id'>;

export type LeagueMatchResponse = LeagueMatch & {
  draft: MatchDraftRow[];
  players: LeagueMatchPlayer[];
};

export type LeagueHeroPositionStats = {
  picks: number;
  wins: number;
};

export type LeaguePicksByPosition = Record<string, Record<string, LeagueHeroPositionStats>>;

export type LeagueHeroDraftStats = {
  picks: number;
  bans: number;
  wins: number;
};

export type LeagueHeroDraftMap = Record<string, LeagueHeroDraftStats>;

export type LeagueMatchesApiResponse = {
  matches: LeagueMatchResponse[];
  picksByPosition: LeaguePicksByPosition;
  heroDraftStats: LeagueHeroDraftMap;
};

async function getMatchesByLeague(leagueId: string): Promise<LeagueMatchesApiResponse> {
  // Every read here is paged. A whole league's drafts run to 2782 rows, well
  // past PostgREST's silent 1000-row ceiling, and they feed pick/ban counts that
  // are meaningless if they cover an arbitrary subset of the league.
  const matches = await selectAll<LeagueMatch>((from, to) => supabase
    .from('match')
    .select('id, winning_team_id, radiant_team_id, dire_team_id')
    .eq('league_id', parseInt(leagueId, 10))
    .range(from, to));

  if (matches.length === 0) return { matches: [], picksByPosition: {}, heroDraftStats: {} };

  const matchIds = matches.map(m => m.id);

  const [drafts, players] = await Promise.all([
    selectAll<MatchDraftRow>((from, to) => supabase
      .from('match_draft').select('*').in('match_id', matchIds).range(from, to)),
    selectAll<LeagueMatchPlayer>((from, to) => supabase
      .from('match_player').select('match_id, hero_id, position, team_id').in('match_id', matchIds).range(from, to)),
  ]);

  const matchesMap = new Map<number, LeagueMatchResponse>();
  matches.forEach(match => {
    matchesMap.set(match.id, { ...match, draft: [], players: [] });
  });

  drafts.forEach(draft => {
    const match = matchesMap.get(draft.match_id);
    if (match) match.draft.push(draft);
  });

  players.forEach(player => {
    const match = matchesMap.get(player.match_id);
    if (match) match.players.push(player);
  });

  const picksByPosition: LeaguePicksByPosition = {};
  const heroDraftStats: LeagueHeroDraftMap = {};

  for (const match of matchesMap.values()) {
    for (const draft of match.draft) {
      if (draft.is_pick) continue;
      const heroId = String(draft.hero_id);
      if (!heroDraftStats[heroId]) heroDraftStats[heroId] = { picks: 0, bans: 0, wins: 0 };
      heroDraftStats[heroId].bans++;
    }

    for (const player of match.players) {
      const heroId = String(player.hero_id);
      const teamWon = player.team_id === match.winning_team_id;

      if (!heroDraftStats[heroId]) heroDraftStats[heroId] = { picks: 0, bans: 0, wins: 0 };
      heroDraftStats[heroId].picks++;
      if (teamWon) heroDraftStats[heroId].wins++;

      if (!player.position) continue;
      if (!picksByPosition[player.position]) picksByPosition[player.position] = {};
      const posMap = picksByPosition[player.position];
      if (!posMap[heroId]) posMap[heroId] = { picks: 0, wins: 0 };
      posMap[heroId].picks++;
      if (teamWon) posMap[heroId].wins++;
    }
  }

  return { matches: Array.from(matchesMap.values()), picksByPosition, heroDraftStats };
}

export default async function handler(
  req: { query: { leagueId: string } },
  res: { status: (code: number) => { json: (data: unknown) => void } },
) {
  const { leagueId } = req.query;
  try {
    const data = await getMatchesByLeague(leagueId);
    res.status(200).json(data);
  } catch (error) {
    console.error("Error in handler:", error);
    res.status(500).json({ error: "Failed to fetch league match data" });
  }
}
