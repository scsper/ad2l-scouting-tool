import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { League } from "../../../api/league";

export const leagueApiSlice = createApi({
  baseQuery: fetchBaseQuery({ baseUrl: "/" }),
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
