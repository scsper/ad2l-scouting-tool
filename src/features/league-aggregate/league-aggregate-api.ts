import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { LeagueMatchResponse } from "../../../api/league-matches";

export type LeagueHeroPickStats = {
  count: number;
  wins: number;
};

export type LeagueHeroBanStats = {
  count: number;
  bannerWins: number;
};

export type LeagueHeroContestedStats = {
  count: number;
  picks: number;
  bans: number;
  pickWins: number;
};

export type LeagueAggregateData = {
  picks: Record<string, LeagueHeroPickStats>;
  bans: Record<string, LeagueHeroBanStats>;
  contested: Record<string, LeagueHeroContestedStats>;
  picksByPosition: Record<string, Record<string, LeagueHeroPickStats>>;
};

export const leagueAggregateApiSlice = createApi({
  baseQuery: fetchBaseQuery({ baseUrl: "/" }),
  reducerPath: "leagueAggregate",
  tagTypes: ["LeagueAggregate"],
  endpoints: build => ({
    getLeagueAggregate: build.query<LeagueAggregateData, { leagueId: number }>({
      query: ({ leagueId }) => `api/league-matches?leagueId=${String(leagueId)}`,
      transformResponse: (response: LeagueMatchResponse[]) => {
        const picks: Record<string, LeagueHeroPickStats> = {};
        const bans: Record<string, LeagueHeroBanStats> = {};
        const contested: Record<string, LeagueHeroContestedStats> = {};
        const picksByPosition: Record<string, Record<string, LeagueHeroPickStats>> = {};

        for (const match of response) {
          for (const draft of match.draft) {
            const heroId = String(draft.hero_id);
            const teamWon = draft.team_id !== null && draft.team_id === match.winning_team_id;

            if (draft.is_pick) {
              if (!picks[heroId]) picks[heroId] = { count: 0, wins: 0 };
              picks[heroId].count++;
              if (teamWon) picks[heroId].wins++;

              if (!contested[heroId]) contested[heroId] = { count: 0, picks: 0, bans: 0, pickWins: 0 };
              contested[heroId].count++;
              contested[heroId].picks++;
              if (teamWon) contested[heroId].pickWins++;
            } else {
              if (!bans[heroId]) bans[heroId] = { count: 0, bannerWins: 0 };
              bans[heroId].count++;
              if (teamWon) bans[heroId].bannerWins++;

              if (!contested[heroId]) contested[heroId] = { count: 0, picks: 0, bans: 0, pickWins: 0 };
              contested[heroId].count++;
              contested[heroId].bans++;
            }
          }

          for (const player of match.players) {
            if (!player.position) continue;
            const heroId = String(player.hero_id);
            const teamWon = player.team_id !== null && player.team_id === match.winning_team_id;

            if (!picksByPosition[player.position]) picksByPosition[player.position] = {};
            const posMap = picksByPosition[player.position];
            if (!posMap[heroId]) posMap[heroId] = { count: 0, wins: 0 };
            posMap[heroId].count++;
            if (teamWon) posMap[heroId].wins++;
          }
        }

        return { picks, bans, contested, picksByPosition };
      },
    }),
  }),
});

export const { useGetLeagueAggregateQuery } = leagueAggregateApiSlice;
