import { createClient } from "@supabase/supabase-js";
import type { MatchDraftRow, MatchPlayerRow, MatchRow } from "../types/db.js";
import { selectAll } from "../server/select-all.js";
import { matchesWithinDivision } from "../server/division-scope.js";
import {
  requireAggregateAccess,
  requireScope,
  respondToAccessError,
} from "../server/access.js";
import { buildDivisionPlayerRows, type DivisionPlayerRow } from "../server/division-players.js";
import {
  buildLeagueHeroStats,
  type LeagueHeroDraftMap,
  type LeaguePicksByPosition,
} from "../server/league-heroes.js";

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? "";
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? "";

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

/**
 * Every column both aggregates need. The draft counts want hero and side; the
 * player board wants the rest, including the clock-independent `@10` block.
 */
export type LeagueMatchPlayer = Pick<
  MatchPlayerRow,
  | 'match_id'
  | 'player_id'
  | 'player_name'
  | 'hero_id'
  | 'position'
  | 'team_id'
  | 'gpm'
  | 'xpm'
  | 'kills'
  | 'deaths'
  | 'assists'
  | 'hero_damage'
  | 'obs_placed'
  | 'sen_placed'
  | 'gold_at_10'
  | 'xp_at_10'
  | 'lh_at_10'
>;

const PLAYER_COLUMNS = [
  'match_id', 'player_id', 'player_name', 'hero_id', 'position', 'team_id',
  'gpm', 'xpm', 'kills', 'deaths', 'assists', 'hero_damage',
  'obs_placed', 'sen_placed', 'gold_at_10', 'xp_at_10', 'lh_at_10',
].join(', ');

/**
 * Timestamps are selected for the player board's per-minute stats, and are the
 * only reason this isn't just the four ids the draft counts need.
 */
export type LeagueMatch = Pick<
  MatchRow,
  'id' | 'winning_team_id' | 'radiant_team_id' | 'dire_team_id' | 'start_date_time' | 'end_date_time'
>;

export type {
  LeagueHeroBanRecord,
  LeagueHeroDraftMap,
  LeagueHeroDraftStats,
  LeagueHeroPickRecord,
  LeagueHeroPositionStats,
  LeaguePicksByPosition,
} from "../server/league-heroes.js";

/**
 * Aggregates and no raw rows.
 *
 * The joined matches used to ship too — 456 KB of them on S46 — and the single
 * caller discarded every one in `transformResponse`. Everything a screen reads
 * is computed here, so sending the inputs as well was pure weight.
 *
 * The breakdown records inside `heroDraftStats` are the expensive part: they
 * take S46's hero aggregates from 11 KB to 101 KB. That buys the only answer to
 * "24 picks by whom" — whether a hero is a metagame or one player's pocket — and
 * it is still a fifth of what the joined matches cost to answer nothing.
 *
 * The two name maps are the one exception to "no lookups on the client", and
 * they exist to keep that cost down: a season's 60-odd players and 20-odd teams
 * are named once here instead of inside every one of the ~1500 records.
 */
export type LeagueMatchesApiResponse = {
  picksByPosition: LeaguePicksByPosition;
  heroDraftStats: LeagueHeroDraftMap;
  playerStats: DivisionPlayerRow[];
  /** Latest name observed per player id — handles change mid-season. */
  playerNames: Record<string, string>;
  /**
   * Only ids with a `team` row. Ten of the 57 teams that appear in matches have
   * never been registered anywhere, so callers need a fallback either way.
   */
  teamNames: Record<string, string>;
};

/**
 * The teams a division fields, or null when no division was asked for.
 *
 * Paged like everything else here: a league's membership is small today, but it
 * gates which matches count, so silently reading the first 1000 rows would be
 * the same class of bug as truncating the drafts.
 */
async function getDivisionTeamIds(leagueId: number, division: string): Promise<Set<number>> {
  const rows = await selectAll<{ team_id: number }>((from, to) => supabase
    .from('league_teams')
    .select('team_id')
    .eq('league_id', leagueId)
    .eq('division', division)
    .range(from, to));

  return new Set(rows.map(row => row.team_id));
}

/**
 * Display names for the team ids a division's matches actually reference.
 *
 * Keyed on the ids in the match rows rather than on league membership, because
 * the two disagree: teams are registered lazily, one scrim opponent at a time,
 * so plenty of sides that show up in a draft have no `league_teams` row. Ten of
 * them have no `team` row either, which is why callers still need a fallback.
 */
async function getTeamNames(teamIds: Set<number>): Promise<Record<string, string>> {
  if (teamIds.size === 0) return {};

  const ids = Array.from(teamIds);
  const rows = await selectAll<{ id: number; name: string }>((from, to) => supabase
    .from('team')
    .select('id, name')
    .in('id', ids)
    .range(from, to));

  return Object.fromEntries(rows.map(row => [String(row.id), row.name]));
}

/**
 * Each player's most recent handle.
 *
 * Six S46 players used more than one name across a season, so a first-seen name
 * would label a hero's record with a handle nobody would recognise today. Same
 * rule as the division player board, which is the other place this matters.
 */
function getPlayerNames(matches: LeagueMatch[], players: LeagueMatchPlayer[]): Record<string, string> {
  const startedAt = new Map(matches.map(match => [match.id, match.start_date_time]));
  const latest = new Map<number, { name: string; at: number }>();

  for (const player of players) {
    if (!player.player_name) continue;
    const at = startedAt.get(player.match_id);
    if (at === undefined) continue;

    const current = latest.get(player.player_id);
    if (!current || at > current.at) latest.set(player.player_id, { name: player.player_name, at });
  }

  return Object.fromEntries(
    Array.from(latest.entries()).map(([playerId, { name }]) => [String(playerId), name]),
  );
}

async function getMatchesByLeague(
  leagueId: string,
  division: string | undefined,
): Promise<LeagueMatchesApiResponse> {
  const leagueIdNum = parseInt(leagueId, 10);

  // Every read here is paged. A whole league's drafts run to 2782 rows, well
  // past PostgREST's silent 1000-row ceiling, and they feed pick/ban counts that
  // are meaningless if they cover an arbitrary subset of the league.
  const allMatches = await selectAll<LeagueMatch>((from, to) => supabase
    .from('match')
    .select('id, winning_team_id, radiant_team_id, dire_team_id, start_date_time, end_date_time')
    .eq('league_id', leagueIdNum)
    .range(from, to));

  const matches = division === undefined
    ? allMatches
    : matchesWithinDivision(allMatches, await getDivisionTeamIds(leagueIdNum, division));

  if (matches.length === 0) {
    return { picksByPosition: {}, heroDraftStats: {}, playerStats: [], playerNames: {}, teamNames: {} };
  }

  const matchIds = matches.map(m => m.id);

  const [drafts, players] = await Promise.all([
    selectAll<MatchDraftRow>((from, to) => supabase
      .from('match_draft').select('*').in('match_id', matchIds).range(from, to)),
    selectAll<LeagueMatchPlayer>((from, to) => supabase
      .from('match_player').select(PLAYER_COLUMNS).in('match_id', matchIds).range(from, to)),
  ]);

  // Both builders join on match id, so the division-scoped matches are what
  // decides which drafts and players count — nothing is filtered twice.
  const { picksByPosition, heroDraftStats } = buildLeagueHeroStats(matches, drafts, players);
  const playerStats = buildDivisionPlayerRows(matches, players);

  const referencedTeamIds = new Set<number>();
  for (const player of players) if (player.team_id !== null) referencedTeamIds.add(player.team_id);
  for (const draft of drafts) if (draft.team_id !== null) referencedTeamIds.add(draft.team_id);

  return {
    picksByPosition,
    heroDraftStats,
    playerStats,
    playerNames: getPlayerNames(matches, players),
    teamNames: await getTeamNames(referencedTeamIds),
  };
}

export default async function handler(
  req: {
    query: { leagueId: string; division?: string }
    headers: Record<string, string | string[] | undefined>
  },
  res: { status: (code: number) => { json: (data: unknown) => void } },
) {
  const { leagueId, division } = req.query;
  const requested = division === "" ? undefined : division;
  try {
    // This route has always taken `division` from the client; the only change
    // is that it is now a claim rather than a preference. A scoped user must
    // name a division they hold — omitting it used to mean "the whole league",
    // which for them is both the leak and the mixed-skill-tier average that
    // matchesWithinDivision exists to prevent.
    const scope = await requireScope(req.headers.authorization);
    requireAggregateAccess(scope, parseInt(leagueId, 10), requested);
    const data = await getMatchesByLeague(leagueId, requested);
    res.status(200).json(data);
  } catch (error) {
    if (respondToAccessError(error, res)) return;
    console.error("Error in handler:", error);
    res.status(500).json({ error: "Failed to fetch league match data" });
  }
}
