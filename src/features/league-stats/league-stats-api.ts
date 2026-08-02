import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { LeagueMatchesApiResponse } from "../../../api/league-matches";
export type { LeagueHeroDraftMap, LeaguePicksByPosition } from "../../../api/league-matches";
export type { DivisionPlayerRow } from "../../../server/division-players";

/**
 * The route returns exactly what the screen reads, so there is nothing left to
 * transform. It used to also ship the joined matches — 456 KB of them on S46 —
 * which this slice threw away on arrival; they are no longer sent.
 */
export type LeagueStatsData = LeagueMatchesApiResponse;

export const leagueStatsApiSlice = createApi({
  baseQuery: fetchBaseQuery({ baseUrl: "/" }),
  reducerPath: "leagueStats",
  tagTypes: ["LeagueStats"],
  endpoints: build => ({
    // Omitting `division` means the whole league, which is what a single-bracket
    // tournament (PGL, ESL, Scrims) wants and what every season before 48 gets.
    //
    // One entry serves both stats boards. They share a screen, a division
    // and a query, so splitting them would fetch the same rows twice.
    getLeagueStats: build.query<LeagueStatsData, { leagueId: number; division?: string }>({
      query: ({ leagueId, division }) =>
        `api/league-matches?leagueId=${String(leagueId)}${division ? `&division=${encodeURIComponent(division)}` : ""}`,
      providesTags: ["LeagueStats"],
    }),
  }),
});

export const { useGetLeagueStatsQuery } = leagueStatsApiSlice;
