import type { Action, ThunkAction } from "@reduxjs/toolkit"
import { combineSlices, configureStore } from "@reduxjs/toolkit"
import { setupListeners } from "@reduxjs/toolkit/query"
import { matchesApiSlice } from "../features/matches/matches-api"
import { leagueApiSlice } from "../features/league-and-team-picker/league-api"
import { teamsApiSlice } from "../features/league-and-team-picker/teams-api"
import type { League } from "../../api/league"
import type { LeagueTeamsResponse } from "../../api/team"

// `combineSlices` automatically combines the reducers using
// their `reducerPath`s, therefore we no longer need to call `combineReducers`.
const rootReducer = combineSlices(matchesApiSlice, leagueApiSlice, teamsApiSlice)
// Infer the `RootState` type from the root reducer
export type RootState = ReturnType<typeof rootReducer>

// Preloaded data
const preloadedLeagues: League[] = [
  {
    id: 18604,
    created_at: "2025-12-11T17:06:11.58572+00:00",
    updated_at: "2025-12-11T17:06:11.58572",
    name: "AD2L Season 45",
    has_divisions: true
  },
  {
    id: 18988,
    created_at: "2025-12-11T17:11:25.230376+00:00",
    updated_at: "2025-12-11T17:11:25.230376",
    name: "DreamLeague Season 27 - Playoffs",
    has_divisions: false
  },
  {
    id: 19137,
    created_at: "2026-01-20T18:31:06.521396+00:00",
    updated_at: "2026-01-20T18:31:06.521396",
    name: "AD2L Season 46",
    has_divisions: true
  }
]

const preloadedTeams: LeagueTeamsResponse = {
  19137: {
    7957380: "Savage Sabres",
    8290779: "Sandshrew and Associates",
    8326846: "Team Unrivaled",
    8750033: "BUTCUM",
    9175179: "Disinformation Campaign",
    9403219: "Sharkhorse",
    9408493: "Random Gaming",
    9622244: "Solar Gravity",
    10014373: "Gigadadz",
    10027404: "Cyber Cloud",
    9186949: "Team Blunder"
  }
}

// The store setup is wrapped in `makeStore` to allow reuse
// when setting up tests that need the same store config
export const makeStore = (preloadedState?: Partial<RootState>) => {
  const store = configureStore({
    reducer: rootReducer,
    // Adding the api middleware enables caching, invalidation, polling,
    // and other useful features of `rtk-query`.
    middleware: getDefaultMiddleware => {
      return getDefaultMiddleware().concat(matchesApiSlice.middleware, leagueApiSlice.middleware, teamsApiSlice.middleware)
    },
    preloadedState,
  })
  // configure listeners using the provided defaults
  // optional, but required for `refetchOnFocus`/`refetchOnReconnect` behaviors
  setupListeners(store.dispatch)
  return store
}

// Create initial state with preloaded data
const initialState = {
  [leagueApiSlice.reducerPath]: {
    queries: {
      'getLeagues(undefined)': {
        status: 'fulfilled',
        endpointName: 'getLeagues',
        requestId: 'preloaded',
        originalArgs: undefined,
        data: preloadedLeagues,
        error: undefined,
        startedTimeStamp: Date.now(),
        fulfilledTimeStamp: Date.now()
      }
    },
    mutations: {},
    provided: {},
    subscriptions: {},
    config: {
      online: true,
      focused: true,
      middlewareRegistered: true,
      refetchOnFocus: false,
      refetchOnReconnect: false,
      refetchOnMountOrArgChange: false,
      keepUnusedDataFor: 60,
      reducerPath: 'league',
      invalidationBehavior: 'delayed' as const
    }
  },
  [teamsApiSlice.reducerPath]: {
    queries: {
      'getTeamsByLeague({"leagueId":19137})': {
        status: 'fulfilled',
        endpointName: 'getTeamsByLeague',
        requestId: 'preloaded',
        originalArgs: { leagueId: 19137 },
        data: preloadedTeams,
        error: undefined,
        startedTimeStamp: Date.now(),
        fulfilledTimeStamp: Date.now()
      }
    },
    mutations: {},
    provided: {},
    subscriptions: {},
    config: {
      online: true,
      focused: true,
      middlewareRegistered: true,
      refetchOnFocus: false,
      refetchOnReconnect: false,
      refetchOnMountOrArgChange: false,
      keepUnusedDataFor: 60,
      reducerPath: 'teams',
      invalidationBehavior: 'delayed' as const
    }
  }
} as unknown as Partial<RootState>

export const store = makeStore(initialState)

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
