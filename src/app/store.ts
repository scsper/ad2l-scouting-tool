import type { Action, ThunkAction } from "@reduxjs/toolkit"
import { combineSlices, configureStore } from "@reduxjs/toolkit"
import { setupListeners } from "@reduxjs/toolkit/query"
import { matchesApiSlice } from "../features/matches/matches-api"
import { leagueApiSlice } from "../features/league-and-team-picker/league-api"
import { teamsApiSlice } from "../features/league-and-team-picker/teams-api"
import { playersApiSlice } from "../features/players/players-api"
import { draftCountersSlice } from "../features/draft-counters/draft-counters-slice"
import { leagueAggregateApiSlice } from "../features/league-aggregate/league-aggregate-api"
import type { League } from "../../api/league"
import type { LeagueTeamsResponse } from "../../api/team"

// `combineSlices` automatically combines the reducers using
// their `reducerPath`s, therefore we no longer need to call `combineReducers`.
const rootReducer = combineSlices(matchesApiSlice, leagueApiSlice, teamsApiSlice, playersApiSlice, draftCountersSlice, leagueAggregateApiSlice)
// Infer the `RootState` type from the root reducer
export type RootState = ReturnType<typeof rootReducer>

// Preloaded data
const preloadedLeagues: League[] = [
  {
    id: 19137,
    created_at: "2026-01-20T18:31:06.521396+00:00",
    updated_at: "2026-01-20T18:31:06.521396",
    name: "AD2L Season 46",
    has_divisions: true
  },
  {
    id: 19422,
    created_at: "2025-12-11T17:11:25.230376+00:00",
    updated_at: "2025-12-11T17:11:25.230376",
    name: "ESL One Birmingham",
    has_divisions: false
  },
  {
    id: 19543,
    created_at: "2026-04-20T17:11:25.230376+00:00",
    updated_at: "2026-04-20T17:11:25.230376",
    name: "PGL Wallachia 2026",
    has_divisions: false
  }

]

const preloadedTeams: LeagueTeamsResponse = {
  19137: {
    7957380: "Savage Sabres",
    8290779: "Sandshrew and Associates",
    8326846: "Team Unrivaled",
    8750033: "BUTCUM",
    9175179: "Disinformation Campaign",
    9181133: "Quasar Dreams",
    9403219: "Sharkhorse",
    9408493: "Random Gaming",
    9622244: "Solar Gravity",
    10014373: "Gigadadz",
    10027404: "Cyber Cloud",
    9186949: "Team Blunder",
    10020060: "Not Quite Largos Tempo",
  },

  19422: {
    9828897: "REKONIX",
    8291895: "Tundra Esports",
    9823272: "Team Yandex",
    9338413: "MOUZ",
    9572001: "Parivision",
    9351740: "Yakult Brothers",
    9964962: "GamerLegion",
    8255888: "BetBoom",
    9895392: "Virtus.pro",
    9467224: "Aurora Gaming",
    7554697: "Nigma Galaxy",
    67: "paiN Gaming",
    2586976: "OG",
    7119388: "Team Spirit"
  },

  19543: {
    8255888: "BetBoom",
    9467224: "Aurora Gaming",
    9572001: "Parivision",
    9964962: "GamerLegion",
    9247354: "Team Falcons",
    9303484: "Heroic",
    2163: "Team Liquid",
    10108947: "SouthAmericaRejects",
    726228: "Vici Gaming",
    36: "Natus Vincere",
    8261500: "Xtreme Gaming",
    7119388: "Team Spirit",
    8291895: "Tundra Esports",
    9895392: "Virtus.pro",
    9823272: "Team Yandex",
    9338413: "MOUZ",
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
      return getDefaultMiddleware().concat(matchesApiSlice.middleware, leagueApiSlice.middleware, teamsApiSlice.middleware, playersApiSlice.middleware, leagueAggregateApiSlice.middleware)
      // draftCountersSlice uses createAppSlice (not RTK Query), so no middleware needed
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
