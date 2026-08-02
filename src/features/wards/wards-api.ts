import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"
import type { MatchWardsApiResponse } from "../../../api/match-wards"
export type { WardMatch, WardMatchPlayer } from "../../../api/match-wards"

// Kept off the shared matches endpoint on purpose: the ward blob is ~14KB per
// match and only this tab needs it, so it loads when the tab is opened rather
// than on every Team/Lanes/Players fetch.
export const wardsApiSlice = createApi({
  baseQuery: fetchBaseQuery({ baseUrl: "/" }),
  reducerPath: "wards",
  tagTypes: ["Wards"],
  endpoints: build => ({
    getMatchWards: build.query<
      MatchWardsApiResponse,
      { leagueId: number; teamId: number }
    >({
      query: ({ leagueId, teamId }) =>
        `api/match-wards?leagueId=${String(leagueId)}&teamId=${String(teamId)}`,
      providesTags: ["Wards"],
    }),
  }),
})

export const { useGetMatchWardsQuery } = wardsApiSlice
