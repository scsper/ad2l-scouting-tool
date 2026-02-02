import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { PlayerRow } from "../../../types/db";

type CreatePlayerRequest = {
  id: number;
  name: string;
  rank: string;
  role: string;
  team_id: number;
}

export const playersApiSlice = createApi({
  baseQuery: fetchBaseQuery({ baseUrl: "/" }),
  reducerPath: "players",
  // Tag types are used for caching and invalidation.
  tagTypes: ["Players"],
  endpoints: build => ({
    getPlayersByTeam: build.query<PlayerRow[], { teamId: number }>({
      query: ({ teamId }) => `api/player?teamId=${String(teamId)}`,
      providesTags: ["Players"],
    }),
    createPlayer: build.mutation<PlayerRow, CreatePlayerRequest>({
      query: (playerData) => ({
        url: 'api/player',
        method: 'POST',
        body: playerData,
      }),
      invalidatesTags: ["Players"],
    }),
    deletePlayer: build.mutation<void, { playerId: number }>({
      query: ({ playerId }) => ({
        url: `api/player?playerId=${String(playerId)}`,
        method: 'DELETE',
      }),
      invalidatesTags: ["Players"],
    }),
  }),
})

export const { useGetPlayersByTeamQuery, useCreatePlayerMutation, useDeletePlayerMutation } = playersApiSlice;
