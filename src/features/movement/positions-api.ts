import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"
import type { MatchPositionsApiResponse } from "../../../api/match-positions"
export type {
  PositionMatch,
  PositionSlot,
  PositionEvent,
} from "../../../api/match-positions"

/**
 * Its own slice, on the same reasoning as `wards-api`: a team's season of
 * position blobs is ~1.1 MB on the wire, which no other tab should pay for.
 *
 * `keepUnusedDataFor` is raised well above the 60s default because this is the
 * most expensive fetch in the app and the data is immutable — a parsed replay
 * never changes. Switching to Playback and back should not re-download a
 * megabyte.
 */
export const positionsApiSlice = createApi({
  baseQuery: fetchBaseQuery({ baseUrl: "/" }),
  reducerPath: "positions",
  tagTypes: ["Positions"],
  keepUnusedDataFor: 600,
  endpoints: build => ({
    getTeamPositions: build.query<
      MatchPositionsApiResponse,
      { leagueId: number; teamId: number }
    >({
      query: ({ leagueId, teamId }) =>
        `api/match-positions?leagueId=${String(leagueId)}&teamId=${String(teamId)}`,
      providesTags: ["Positions"],
    }),
  }),
})

export const { useGetTeamPositionsQuery } = positionsApiSlice
