import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"
import type { PlayerRow, PlayerPubMatchStatsRow } from "../../../types/db"

type CreatePlayerRequest = {
  id: number
  name: string
  rank: string
  role: string
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
    getPlayersByTeam: build.query<PlayerRow[], { teamId: number }>({
      query: ({ teamId }) => `api/player?teamId=${String(teamId)}`,
      providesTags: ["Players"],
    }),
    createPlayer: build.mutation<PlayerRow, CreatePlayerRequest>({
      query: playerData => ({
        url: "api/player",
        method: "POST",
        body: playerData,
      }),
      invalidatesTags: ["Players"],
    }),
    deletePlayer: build.mutation<void, { playerId: number }>({
      query: ({ playerId }) => ({
        url: `api/player?playerId=${String(playerId)}`,
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
  useGetPlayersByTeamQuery,
  useCreatePlayerMutation,
  useDeletePlayerMutation,
  useFetchPlayerPubMatchesMutation,
  useGetPlayerPubMatchesQuery,
} = playersApiSlice
