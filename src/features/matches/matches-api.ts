// Need to use the React-specific entry point to import `createApi`
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"
import type { MatchApiResponse } from "../../../types/api"

export type HeroStats = {
  games: number;
  wins: number;
  losses: number;
}

export type BanStats = {
  count: number;
  wins: number;
  losses: number;
}

export type ContestRateStats = {
  count: number;
  picks: number;
  bans: number;
  breakdown: {
    scoutedTeamPicks: number;
    opponentPicks: number;
    scoutedTeamBans: number;
    opponentBans: number;
  }
}

export type TransformedMatchesApiResponse = {
  matches: MatchApiResponse[];
  aggregate: {
    bansAgainst: Record<string, BanStats>;
    heroesPlayedByPosition: Record<string, Record<string, HeroStats>>;
    contestRate: Record<string, ContestRateStats>;
  }
}


// Define a service using a base URL and expected endpoints
export const matchesApiSlice = createApi({
  baseQuery: fetchBaseQuery({ baseUrl: "/" }),
  reducerPath: "matches",
  // Tag types are used for caching and invalidation.
  tagTypes: ["Matches"],
  endpoints: build => ({
    getMatches: build.query<TransformedMatchesApiResponse, { leagueId: number; teamId: number }>({
      query: ({ leagueId, teamId }) =>
        `api/matches?leagueId=${String(leagueId)}&teamId=${String(teamId)}`,
      transformResponse: (response: MatchApiResponse[], _, arg: { leagueId: number; teamId: number }) => {
        const { teamId } = arg;

        return {
          matches: response,
          aggregate: {
            bansAgainst: getBansAgainst(response, teamId),
            heroesPlayedByPosition: accumulateHeroesPlayedByPosition(response, teamId),
            contestRate: getContestRate(response, teamId),
          }
        }
      }
    }),
  }),
})

function getBansAgainst(matches: MatchApiResponse[], scoutedTeamId: number) {
  const bansAgainst: Record<string, BanStats> = {};

  for (const match of matches) {
    if (match.draft.length === 0) {
      continue;
    }

    const teamWon = match.winning_team_id === scoutedTeamId;

    match.draft.forEach(draft => {
      if (draft.team_id === scoutedTeamId) {
        return;
      }

      if (draft.is_pick) {
        return;
      }

      const { hero_id } = draft;
      if (!bansAgainst[hero_id]) {
        bansAgainst[hero_id] = {
          count: 0,
          wins: 0,
          losses: 0,
        };
      }

      bansAgainst[hero_id].count++;
      if (teamWon) {
        bansAgainst[hero_id].wins++;
      } else {
        bansAgainst[hero_id].losses++;
      }
    })
  }

  return bansAgainst;
}

function accumulateHeroesPlayedByPosition(matches: MatchApiResponse[], scoutedTeamId: number): Record<string, Record<string, HeroStats>> {
  const heroesPlayedByPosition: Record<string, Record<string, HeroStats>> = {
    "POSITION_1": {},
    "POSITION_2": {},
    "POSITION_3": {},
    "POSITION_4": {},
    "POSITION_5": {},
    "UNCATEGORIZED": {},
  };

  for (const match of matches) {
    const teamWon = match.winning_team_id === scoutedTeamId;

    for (const player of match.players) {
      if (player.team_id !== scoutedTeamId) {
        continue;
      }

      const { hero_id } = player;
      const position = player.position ?? "UNCATEGORIZED";

      if (!heroesPlayedByPosition[position][hero_id]) {
        heroesPlayedByPosition[position][hero_id] = {
          games: 0,
          wins: 0,
          losses: 0,
        };
      }
      
      heroesPlayedByPosition[position][hero_id].games++;
      if (teamWon) {
        heroesPlayedByPosition[position][hero_id].wins++;
      } else {
        heroesPlayedByPosition[position][hero_id].losses++;
      }
    }
  }

  return heroesPlayedByPosition;
}

function getContestRate(matches: MatchApiResponse[], scoutedTeamId: number): Record<string, ContestRateStats> {
  const contestRate: Record<string, ContestRateStats> = {};

  for (const match of matches) {
    // Track heroes picked
    for (const player of match.players) {
      const { hero_id, team_id } = player;
      if (!contestRate[hero_id]) {
        contestRate[hero_id] = {
          count: 0,
          picks: 0,
          bans: 0,
          breakdown: {
            scoutedTeamPicks: 0,
            opponentPicks: 0,
            scoutedTeamBans: 0,
            opponentBans: 0,
          }
        };
      }
      contestRate[hero_id].count++;
      contestRate[hero_id].picks++;
      
      if (team_id === scoutedTeamId) {
        contestRate[hero_id].breakdown.scoutedTeamPicks++;
      } else {
        contestRate[hero_id].breakdown.opponentPicks++;
      }
    }

    // Track heroes banned
    for (const draft of match.draft) {
      if (!draft.is_pick) {
        const { hero_id, team_id } = draft;
        if (!contestRate[hero_id]) {
          contestRate[hero_id] = {
            count: 0,
            picks: 0,
            bans: 0,
            breakdown: {
              scoutedTeamPicks: 0,
              opponentPicks: 0,
              scoutedTeamBans: 0,
              opponentBans: 0,
            }
          };
        }
        contestRate[hero_id].count++;
        contestRate[hero_id].bans++;
        
        if (team_id === scoutedTeamId) {
          contestRate[hero_id].breakdown.scoutedTeamBans++;
        } else {
          contestRate[hero_id].breakdown.opponentBans++;
        }
      }
    }
  }

  return contestRate;
}

export const { useLazyGetMatchesQuery, useGetMatchesQuery } = matchesApiSlice
