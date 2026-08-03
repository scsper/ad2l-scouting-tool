import type { Action, ThunkAction } from "@reduxjs/toolkit"
import { combineSlices, configureStore } from "@reduxjs/toolkit"
import { setupListeners } from "@reduxjs/toolkit/query"
import { matchesApiSlice } from "../features/matches/matches-api"
import { leagueApiSlice } from "../features/league-and-team-picker/league-api"
import { teamsApiSlice } from "../features/league-and-team-picker/teams-api"
import { playersApiSlice } from "../features/players/players-api"
import { leagueStatsApiSlice } from "../features/league-stats/league-stats-api"
import { wardsApiSlice } from "../features/wards/wards-api"
import { objectivesApiSlice } from "../features/objectives/objectives-api"
import { positionsApiSlice } from "../features/movement/positions-api"

// `combineSlices` automatically combines the reducers using
// their `reducerPath`s, therefore we no longer need to call `combineReducers`.
const rootReducer = combineSlices(
  matchesApiSlice,
  leagueApiSlice,
  teamsApiSlice,
  playersApiSlice,
  leagueStatsApiSlice,
  wardsApiSlice,
  objectivesApiSlice,
  positionsApiSlice,
)
// Infer the `RootState` type from the root reducer
export type RootState = ReturnType<typeof rootReducer>

// The league and team pickers read `league` and `league_teams` live. They used to
// be seeded from a hardcoded copy injected here as a fake fulfilled query, which
// drifted from the database (the same team was "GigaDads" under one league and
// "Gigadadz" under another) and hid any league missing from the list — S45 and
// DreamLeague S27 were unreachable despite having 66 matches between them.
// Onboarding a new season is now just the add-teams-to-league script, with no
// code change or deploy.

// The store setup is wrapped in `makeStore` to allow reuse
// when setting up tests that need the same store config
export const makeStore = (preloadedState?: Partial<RootState>) => {
  const store = configureStore({
    reducer: rootReducer,
    // Adding the api middleware enables caching, invalidation, polling,
    // and other useful features of `rtk-query`.
    middleware: getDefaultMiddleware => {
      return getDefaultMiddleware().concat(
        matchesApiSlice.middleware,
        leagueApiSlice.middleware,
        teamsApiSlice.middleware,
        playersApiSlice.middleware,
        leagueStatsApiSlice.middleware,
        wardsApiSlice.middleware,
        objectivesApiSlice.middleware,
        positionsApiSlice.middleware,
      )
    },
    preloadedState,
  })
  // configure listeners using the provided defaults
  // optional, but required for `refetchOnFocus`/`refetchOnReconnect` behaviors
  setupListeners(store.dispatch)
  return store
}

export const store = makeStore()

// Infer the type of `store`
export type AppStore = typeof store
// Infer the `AppDispatch` type from the store itself
export type AppDispatch = AppStore["dispatch"]
export type AppThunk<ThunkReturnType = void> = ThunkAction<
  ThunkReturnType,
  RootState,
  unknown,
  Action
>
