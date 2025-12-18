// Need to use the React-specific entry point to import `createApi`
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

// Types for Supabase API response
export type MatchPlayerRow = {
  player_id: number;
  match_id: number;
  league_id: number;
  team_id: number | null;
  start_date_time: number;
  end_date_time: number;
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

export type MatchDraftRow = {
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

export type SupabaseMatchData = {
  match_id: number;
  league_id: number;
  winning_team_id: number | null;
  radiant_team_id: number | null;
  dire_team_id: number | null;
  players: MatchPlayerRow[];
  draft: MatchDraftRow[];
}

export type SupabaseMatchesTransformedResponse = {
  matches: SupabaseMatchData[];
  aggregate: {
    bansAgainst: Record<string, number>;
    heroesPlayedByPosition: Record<string, Record<string, number>>;
  }
}


// Define a service using a base URL and expected endpoints
export const matchesApiSlice = createApi({
  baseQuery: fetchBaseQuery({ baseUrl: "/" }),
  reducerPath: "matches",
  // Tag types are used for caching and invalidation.
  tagTypes: ["Matches"],
  endpoints: build => ({
    getMatches: build.query<SupabaseMatchesTransformedResponse, { leagueId: number; teamId: number }>({
      query: ({ leagueId, teamId }) =>
        `api/matches?leagueId=${String(leagueId)}&teamId=${String(teamId)}`,
      transformResponse: (response: SupabaseMatchData[], _, arg: { leagueId: number; teamId: number }) => {
        const { teamId } = arg;

        return {
          matches: response,
          aggregate: {
            bansAgainst: getBansAgainst(response, teamId),
            heroesPlayedByPosition: accumulateHeroesPlayedByPosition(response, teamId),
          }
        }
      }
    }),
  }),
})

function getBansAgainst(matches: SupabaseMatchData[], scoutedTeamId: number) {
  const bansAgainst: Record<string, number> = {};

  for (const match of matches) {
    if (match.draft.length === 0) {
      continue;
    }

    match.draft.forEach(draft => {
      if (draft.team_id === scoutedTeamId) {
        return;
      }

      if (draft.is_pick) {
        return;
      }

      const { hero_id } = draft;
      if (!bansAgainst[hero_id]) {
        bansAgainst[hero_id] = 0;
      }

      bansAgainst[hero_id]++;
    })
  }

  return bansAgainst;
}

function accumulateHeroesPlayedByPosition(matches: SupabaseMatchData[], scoutedTeamId: number): Record<string, Record<string, number>> {
  const heroesPlayedByPosition: Record<string, Record<string, number>> = {
    "POSITION_1": {},
    "POSITION_2": {},
    "POSITION_3": {},
    "POSITION_4": {},
    "POSITION_5": {},
    "UNCATEGORIZED": {},
  };

  for (const match of matches) {
    for (const player of match.players) {
      if (player.team_id !== scoutedTeamId) {
        continue;
      }

      const { hero_id } = player;
      const position = player.position ?? "UNCATEGORIZED";

      if (!heroesPlayedByPosition[position][hero_id]) {
        heroesPlayedByPosition[position][hero_id] = 0;
      }
      heroesPlayedByPosition[position][hero_id]++;
    }
  }

  return heroesPlayedByPosition;
}

export const { useLazyGetMatchesQuery, useGetMatchesQuery } = matchesApiSlice
