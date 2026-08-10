import { createApi } from "@reduxjs/toolkit/query/react";
import { authedBaseQuery } from "../../app/authed-base-query"
import type { League } from "../../../api/league";

export const leagueApiSlice = createApi({
  baseQuery: authedBaseQuery,
  reducerPath: "league",
  // Tag types are used for caching and invalidation.
  tagTypes: ["League"],
  endpoints: build => ({
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    getLeagues: build.query<League[], void>({
      query: () => "api/league",
    }),
  }),
})

export const { useGetLeaguesQuery } = leagueApiSlice;
