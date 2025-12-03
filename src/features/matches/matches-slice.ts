import type { PayloadAction } from "@reduxjs/toolkit"
import { createAppSlice } from "../../app/createAppSlice"
import type { AppThunk } from "../../app/store"
import { fetchCount } from "./counterAPI"
import type { Match, RecordStatus } from "../../utils/types"


export type MatchesSliceState = {
  matches: Match[]
  status: RecordStatus
}

const initialState: MatchesSliceState = {
  matches: [],
  status: 'does_not_exist',
}

export const matchesSlice = createAppSlice({
  name: "matches",
  initialState,
  reducers: create => ({
    fetchMatches: create.asyncThunk(
      async ({leagueId, teamId}: {leagueId: string, teamId: string}) => {
        const response = await fetchCount(amount)
        // The value we return becomes the `fulfilled` action payload
        return response.data
      },
      {
        pending: state => {
          state.status = "loading"
        },
        fulfilled: (state, action) => {
          state.status = "loaded"
          state.matches = action.payload
        },
        rejected: state => {
          state.status = "failed"
        },
      },
    ),
  }),
})
