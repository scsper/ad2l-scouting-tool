import { createAppSlice } from "../../app/createAppSlice"
import type { HeroCounterRow, PlayerRow } from "../../../types/db"
import type { MatchApiResponse } from "../../../types/api"

type RecordStatus = "idle" | "loading" | "loaded" | "failed"

type CounterEntry = {
  data: HeroCounterRow[]
  updatedAt: string
  status: RecordStatus
}

type TeamBMatchesEntry = {
  data: MatchApiResponse[]
  status: RecordStatus
}

type TeamBPlayersEntry = {
  data: PlayerRow[]
  status: RecordStatus
}

type DraftCountersState = {
  selectedTeamBId: number | undefined
  selectedPlayerId: number | undefined
  selectedHeroId: number | undefined
  counters: Record<number, CounterEntry>
  teamBMatches: Record<number, TeamBMatchesEntry>
  teamBPlayers: Record<number, TeamBPlayersEntry>
}

const initialState: DraftCountersState = {
  selectedTeamBId: undefined,
  selectedPlayerId: undefined,
  selectedHeroId: undefined,
  counters: {},
  teamBMatches: {},
  teamBPlayers: {},
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export const draftCountersSlice = createAppSlice({
  name: "draftCounters",
  initialState,
  reducers: create => ({
    setSelectedTeamB: create.reducer<number | undefined>((state, action) => {
      state.selectedTeamBId = action.payload
    }),
    setSelectedPlayer: create.reducer<number | undefined>((state, action) => {
      state.selectedPlayerId = action.payload
      state.selectedHeroId = undefined
    }),
    setSelectedHero: create.reducer<number | undefined>((state, action) => {
      state.selectedHeroId = action.payload
    }),

    fetchCounters: create.asyncThunk(
      async (heroId: number) => {
        const res = await fetch(`/api/hero-counters?heroId=${heroId}`)
        if (!res.ok) throw new Error(`Failed to fetch counters: ${res.status}`)
        const json: { data: HeroCounterRow[]; updatedAt: string } = await res.json()
        return { heroId, data: json.data, updatedAt: json.updatedAt }
      },
      {
        options: {
          condition: (heroId: number, { getState }) => {
            const state = getState() as { draftCounters: DraftCountersState }
            const entry = state.draftCounters.counters[heroId]
            if (!entry || entry.status === "idle") return true
            if (entry.status === "loading") return false
            if (entry.status === "loaded" && entry.updatedAt) {
              const age = Date.now() - new Date(entry.updatedAt).getTime()
              if (age < SEVEN_DAYS_MS) return false
            }
            return true
          },
        },
        pending: (state, action) => {
          const heroId = action.meta.arg
          if (!state.counters[heroId]) {
            state.counters[heroId] = { data: [], updatedAt: "", status: "loading" }
          } else {
            state.counters[heroId].status = "loading"
          }
        },
        fulfilled: (state, action) => {
          const { heroId, data, updatedAt } = action.payload
          state.counters[heroId] = { data, updatedAt, status: "loaded" }
        },
        rejected: (state, action) => {
          const heroId = action.meta.arg
          if (state.counters[heroId]) {
            state.counters[heroId].status = "failed"
          }
        },
      },
    ),

    refreshCounters: create.asyncThunk(
      async (heroId: number) => {
        const res = await fetch("/api/hero-counters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ heroId }),
        })
        if (!res.ok) throw new Error(`Failed to refresh counters: ${res.status}`)
        const json: { data: HeroCounterRow[]; updatedAt: string } = await res.json()
        return { heroId, data: json.data, updatedAt: json.updatedAt }
      },
      {
        pending: (state, action) => {
          const heroId = action.meta.arg
          if (!state.counters[heroId]) {
            state.counters[heroId] = { data: [], updatedAt: "", status: "loading" }
          } else {
            state.counters[heroId].status = "loading"
          }
        },
        fulfilled: (state, action) => {
          const { heroId, data, updatedAt } = action.payload
          state.counters[heroId] = { data, updatedAt, status: "loaded" }
        },
        rejected: (state, action) => {
          const heroId = action.meta.arg
          if (state.counters[heroId]) {
            state.counters[heroId].status = "failed"
          }
        },
      },
    ),

    fetchTeamBMatches: create.asyncThunk(
      async ({ leagueId, teamId }: { leagueId: number; teamId: number }) => {
        const res = await fetch(`/api/matches?leagueId=${leagueId}&teamId=${teamId}`)
        if (!res.ok) throw new Error(`Failed to fetch team B matches: ${res.status}`)
        const matches: MatchApiResponse[] = await res.json()
        return { teamId, matches }
      },
      {
        pending: (state, action) => {
          const { teamId } = action.meta.arg
          state.teamBMatches[teamId] = { data: [], status: "loading" }
        },
        fulfilled: (state, action) => {
          const { teamId, matches } = action.payload
          state.teamBMatches[teamId] = { data: matches, status: "loaded" }
        },
        rejected: (state, action) => {
          const { teamId } = action.meta.arg
          state.teamBMatches[teamId] = { data: [], status: "failed" }
        },
      },
    ),

    fetchTeamBPlayers: create.asyncThunk(
      async (teamId: number) => {
        const res = await fetch(`/api/player?teamId=${teamId}`)
        if (!res.ok) throw new Error(`Failed to fetch team B players: ${res.status}`)
        const players: PlayerRow[] = await res.json()
        return { teamId, players }
      },
      {
        pending: (state, action) => {
          const teamId = action.meta.arg
          state.teamBPlayers[teamId] = { data: [], status: "loading" }
        },
        fulfilled: (state, action) => {
          const { teamId, players } = action.payload
          state.teamBPlayers[teamId] = { data: players, status: "loaded" }
        },
        rejected: (state, action) => {
          const teamId = action.meta.arg
          state.teamBPlayers[teamId] = { data: [], status: "failed" }
        },
      },
    ),
  }),
  selectors: {
    selectSelectedTeamBId: state => state.selectedTeamBId,
    selectSelectedPlayerId: state => state.selectedPlayerId,
    selectSelectedHeroId: state => state.selectedHeroId,
    selectCounters: state => state.counters,
    selectTeamBMatches: state => state.teamBMatches,
    selectTeamBPlayers: state => state.teamBPlayers,
  },
})

export const {
  setSelectedTeamB,
  setSelectedPlayer,
  setSelectedHero,
  fetchCounters,
  refreshCounters,
  fetchTeamBMatches,
  fetchTeamBPlayers,
} = draftCountersSlice.actions

export const {
  selectSelectedTeamBId,
  selectSelectedPlayerId,
  selectSelectedHeroId,
  selectCounters,
  selectTeamBMatches,
  selectTeamBPlayers,
} = draftCountersSlice.selectors
