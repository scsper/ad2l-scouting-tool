import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { LeagueTeamsResponse } from "../../../api/team";

export const teamsApiSlice = createApi({
  baseQuery: fetchBaseQuery({ baseUrl: "/" }),
  reducerPath: "teams",
  // Tag types are used for caching and invalidation.
  tagTypes: ["Teams"],
  endpoints: build => ({
    getTeamsByLeague: build.query<LeagueTeamsResponse, { leagueId: number }>({
      query: ({ leagueId }) => `api/team?leagueId=${String(leagueId)}`,
    }),
  }),
})

export const { useLazyGetTeamsByLeagueQuery, useGetTeamsByLeagueQuery } = teamsApiSlice;

