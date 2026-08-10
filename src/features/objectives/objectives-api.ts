import { createApi } from "@reduxjs/toolkit/query/react"
import { authedBaseQuery } from "../../app/authed-base-query"
import type { MatchObjectivesApiResponse } from "../../../api/match-objectives"
export type {
  ObjectiveMatch,
  ObjectiveEvent,
  LeagueBuildingTiming,
} from "../../../api/match-objectives"

/**
 * Kept off the wards endpoint even though the Wards tab consumes both.
 *
 * They answer different questions and the Tempo tab needs objectives without
 * ever wanting the ~14KB-per-match ward blob. Folding them together would make
 * the cheaper screen pay for the expensive one, which is the same reasoning that
 * put wards on their own slice to begin with.
 */
export const objectivesApiSlice = createApi({
  baseQuery: authedBaseQuery,
  reducerPath: "objectives",
  tagTypes: ["Objectives"],
  endpoints: build => ({
    getMatchObjectives: build.query<
      MatchObjectivesApiResponse,
      { leagueId: number; teamId: number }
    >({
      query: ({ leagueId, teamId }) =>
        `api/match-objectives?leagueId=${String(leagueId)}&teamId=${String(teamId)}`,
      providesTags: ["Objectives"],
    }),
  }),
})

export const { useGetMatchObjectivesQuery } = objectivesApiSlice
