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
    createPlayer: build.mutation<PlayerRow, CreatePlayerRequest>({
      query: (playerData) => ({
        url: 'api/player',
        method: 'POST',
        body: playerData,
      }),
      invalidatesTags: ["Players"],
    }),
  }),
})

export const { useCreatePlayerMutation } = playersApiSlice;
