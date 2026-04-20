import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { LeagueMatchesApiResponse, LeagueHeroDraftMap, LeaguePicksByPosition } from "../../../api/league-matches";
export type { LeagueHeroDraftMap, LeaguePicksByPosition } from "../../../api/league-matches";

export type LeagueAggregateData = {
  heroDraftStats: LeagueHeroDraftMap;
  picksByPosition: LeaguePicksByPosition;
};

export const leagueAggregateApiSlice = createApi({
  baseQuery: fetchBaseQuery({ baseUrl: "/" }),
  reducerPath: "leagueAggregate",
  tagTypes: ["LeagueAggregate"],
  endpoints: build => ({
    getLeagueAggregate: build.query<LeagueAggregateData, { leagueId: number }>({
      query: ({ leagueId }) => `api/league-matches?leagueId=${String(leagueId)}`,
      transformResponse: ({ heroDraftStats, picksByPosition }: LeagueMatchesApiResponse) => ({
        heroDraftStats,
        picksByPosition,
      }),
    }),
  }),
});

export const { useGetLeagueAggregateQuery } = leagueAggregateApiSlice;
