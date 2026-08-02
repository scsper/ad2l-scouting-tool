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
    // Omitting `division` means the whole league, which is what a single-bracket
    // tournament (PGL, ESL, Scrims) wants and what every season before 48 gets.
    getLeagueAggregate: build.query<LeagueAggregateData, { leagueId: number; division?: string }>({
      query: ({ leagueId, division }) =>
        `api/league-matches?leagueId=${String(leagueId)}${division ? `&division=${encodeURIComponent(division)}` : ""}`,
      providesTags: ["LeagueAggregate"],
      transformResponse: ({ heroDraftStats, picksByPosition }: LeagueMatchesApiResponse) => ({
        heroDraftStats,
        picksByPosition,
      }),
    }),
  }),
});

export const { useGetLeagueAggregateQuery } = leagueAggregateApiSlice;
