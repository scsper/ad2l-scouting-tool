import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { AddTeamToLeagueRequest, LeagueTeamEntry, LeagueTeamsResponse } from "../../../api/team";
import { divisionsIn } from "../../../shared/divisions";
export type { LeagueTeamEntry } from "../../../api/team";

export const teamsApiSlice = createApi({
  baseQuery: fetchBaseQuery({ baseUrl: "/" }),
  reducerPath: "teams",
  // Tag types are used for caching and invalidation.
  tagTypes: ["Teams"],
  endpoints: build => ({
    getTeamsByLeague: build.query<LeagueTeamsResponse, { leagueId: number }>({
      query: ({ leagueId }) => `api/team?leagueId=${String(leagueId)}`,
      providesTags: ["Teams"],
    }),
    // Registering a team is a routine operation, not a once-a-season one: teams
    // are added lazily, one scrim opponent at a time. Invalidating Teams gets
    // the new team into the picker without the page reload that seeding by
    // script used to require.
    addTeamToLeague: build.mutation<
      LeagueTeamEntry,
      AddTeamToLeagueRequest & { token: string | null }
    >({
      query: ({ token, ...body }) => ({
        url: "api/team",
        method: "POST",
        body,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }),
      invalidatesTags: ["Teams"],
    }),
  }),
})

export const {
  useLazyGetTeamsByLeagueQuery,
  useGetTeamsByLeagueQuery,
  useAddTeamToLeagueMutation,
} = teamsApiSlice;

/**
 * The divisions a league fields, in vocabulary order.
 *
 * Derived from the team rows rather than a flag on the league. A stored boolean
 * was tried and drifted — it was wrong on all three AD2L seasons — because
 * nothing forced it to agree with the rows it described. This shares the picker's
 * cache entry, so asking costs no extra request.
 */
export function useLeagueDivisions(leagueId: number | undefined) {
  const { data } = useGetTeamsByLeagueQuery({ leagueId: leagueId ?? 0 }, { skip: !leagueId });
  const teams = leagueId ? data?.[leagueId] : undefined;
  return divisionsIn(Object.values(teams ?? {}).map(team => team.division));
}
