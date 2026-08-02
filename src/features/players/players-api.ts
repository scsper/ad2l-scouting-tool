import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"
import type {
  PlayerRow,
  PlayerPubMatchStatsRow,
  RosterEntry,
} from "../../../types/db"

type CreateRosterMemberRequest = {
  league_id: number
  team_id: number
  player_id: number
  name: string
  role: string
  rank?: string | null
  original_rank?: string | null
  is_stand_in?: boolean
}

type CopyRosterRequest = {
  from_league_id: number
  league_id: number
  team_id: number
}

type FetchPlayerPubMatchesRequest = {
  playerId: number
  positions?: string[]
}

type FetchPlayerPubMatchesResponse = {
  success: boolean
  data: {
    recentMatches: PlayerPubMatchStatsRow[]
    topHeroesByPosition: PlayerPubMatchStatsRow[]
    topHeroesOverall: PlayerPubMatchStatsRow[]
  }
}

export const playersApiSlice = createApi({
  baseQuery: fetchBaseQuery({ baseUrl: "/" }),
  reducerPath: "players",
  // Tag types are used for caching and invalidation.
  tagTypes: ["Players", "PlayerPubMatches"],
  endpoints: build => ({
    /** A team's roster for one league. Both ids are required — see api/roster.ts. */
    getRoster: build.query<RosterEntry[], { leagueId: number; teamId: number }>(
      {
        query: ({ leagueId, teamId }) =>
          `api/roster?leagueId=${String(leagueId)}&teamId=${String(teamId)}`,
        providesTags: ["Players"],
      },
    ),
    /** Looks a person up by steam id so the add form can prefill a known name. */
    getPlayerById: build.query<PlayerRow, { playerId: number }>({
      query: ({ playerId }) => `api/player?playerId=${String(playerId)}`,
    }),
    /** Upserts, so re-submitting for an existing member edits them in place. */
    addRosterMember: build.mutation<RosterEntry, CreateRosterMemberRequest>({
      query: body => ({
        url: "api/roster",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Players"],
    }),
    copyRoster: build.mutation<RosterEntry[], CopyRosterRequest>({
      query: body => ({
        url: "api/roster",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Players"],
    }),
    /** Removes the membership row only — the person and their pub stats stay. */
    removeRosterMember: build.mutation<
      void,
      { leagueId: number; teamId: number; playerId: number }
    >({
      query: ({ leagueId, teamId, playerId }) => ({
        url: `api/roster?leagueId=${String(leagueId)}&teamId=${String(teamId)}&playerId=${String(playerId)}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Players"],
    }),
    fetchPlayerPubMatches: build.mutation<
      FetchPlayerPubMatchesResponse,
      FetchPlayerPubMatchesRequest
    >({
      query: body => ({
        url: "api/player-pub-matches",
        method: "POST",
        body,
      }),
      invalidatesTags: ["PlayerPubMatches"],
    }),
    getPlayerPubMatches: build.query<
      FetchPlayerPubMatchesResponse,
      { playerId: number }
    >({
      query: ({ playerId }) =>
        `api/player-pub-matches?playerId=${String(playerId)}`,
      providesTags: ["PlayerPubMatches"],
    }),
  }),
})

export const {
  useGetRosterQuery,
  useLazyGetPlayerByIdQuery,
  useAddRosterMemberMutation,
  useCopyRosterMutation,
  useRemoveRosterMemberMutation,
  useFetchPlayerPubMatchesMutation,
  useGetPlayerPubMatchesQuery,
} = playersApiSlice
