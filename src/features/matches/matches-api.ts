// Need to use the React-specific entry point to import `createApi`
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"
import type { MatchApiResponse } from "../../utils/types"
import { getHero } from "../../utils/get-hero"

type ApiResponse = {
  data: {
    league: {
      id: number
      name: string
      matches: MatchApiResponse[]
    }
  }
}

type Player = {
  heroId: string
  heroName: string
  position: string
  name: string
  id: string
}

type PickBan = {
  heroId: string
  heroName: string
  order: number
}

type Match = {
  id: string
  winningTeamName: string
  duration: string
  radiant: {
    id: string
    name: string
    players: Player[]
    picks: PickBan[]
    bans: PickBan[]
  }
  dire: {
    id: string
    name: string
    players: Player[]
    picks: PickBan[]
    bans: PickBan[]
  }
}

type TransformedMatchResponse = {
  league: {
    id: string
    name: string
    matches: Match[],
    heroesPlayedByPosition: Record<string, Record<string, number>>,
    bansAgainst: Record<string, number>,
  }
}

// Define a service using a base URL and expected endpoints
export const matchesApiSlice = createApi({
  baseQuery: fetchBaseQuery({ baseUrl: "/" }),
  reducerPath: "matches",
  // Tag types are used for caching and invalidation.
  tagTypes: ["Matches"],
  endpoints: build => ({
    getMatches: build.query<TransformedMatchResponse, { leagueId: string; teamId: string }>({
      query: ({ leagueId, teamId }) =>
        `api/matches?leagueId=${leagueId}&teamId=${teamId}`,
      transformResponse: (response: ApiResponse, _, arg: { leagueId: string; teamId: string }) => {
        const scoutedTeamId = arg.teamId;
        const matches = response.data.league.matches.map(match => parseMatch(match));
        const heroesPlayedByPosition = accumulateHeroesPlayedByPosition(matches, scoutedTeamId);
        const bansAgainst = getBansAgainst(matches, scoutedTeamId);

        return {
          league: {
            id: response.data.league.id.toString(),
            name: response.data.league.name,
            matches,
            heroesPlayedByPosition,
            bansAgainst,
          }
        }
      }
    }),
  }),
})

function getBansAgainst(matches: Match[], scoutedTeamId: string) {
  const bansAgainst: Record<string, number> = {};

  for (const match of matches) {
    const scoutedSide = match.radiant.id === scoutedTeamId ? "radiant" : "dire";
    const otherSide = scoutedSide === "radiant" ? "dire" : "radiant";

    for (const ban of match[otherSide].bans) {
      const { heroName } = ban;
      if (!bansAgainst[heroName]) {
        bansAgainst[heroName] = 0;
      }

      bansAgainst[heroName]++;
    }
  }

  return bansAgainst;
}

function accumulateHeroesPlayedByPosition(matches: Match[], scoutedTeamId: string) {
  const heroesPlayedByPosition: Record<string, Record<string, number>> = {
    "POSITION_1": {},
    "POSITION_2": {},
    "POSITION_3": {},
    "POSITION_4": {},
    "POSITION_5": {},
    "UNCATEGORIZED": {},
  };

  for (const match of matches) {
    const scoutedSide = match.radiant.id === scoutedTeamId ? "radiant" : "dire";

    for (const player of match[scoutedSide].players) {
      const { heroName } = player;
      let { position } = player;
      if (!position) {
        position = "UNCATEGORIZED";
      }
      if (!heroesPlayedByPosition[position][heroName]) {
        heroesPlayedByPosition[position][heroName] = 0;
      }
      heroesPlayedByPosition[position][heroName]++;
    }
  }

  return heroesPlayedByPosition;
}

function convertDurationToMinutesAndSeconds(duration: number): string {
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  return `${minutes.toString()}:${seconds.toString().padStart(2, "0")}`;
}

function parseMatch(match: MatchApiResponse): Match {
  return {
    id: match.id.toString(),
    winningTeamName: match.didRadiantWin ? match.radiantTeam.name : match.direTeam.name,
    duration: convertDurationToMinutesAndSeconds(match.durationSeconds),
    radiant: {
      id: match.radiantTeam.id.toString(),
      name: match.radiantTeam.name,
      players: match.players.filter(player => player.isRadiant).map(player => ({
        heroId: player.heroId.toString(),
        heroName: getHero(player.heroId),
        position: player.position,
        name: player.steamAccount.name,
        id: player.steamAccount.id.toString(),
      })),
      picks: match.pickBans ? match.pickBans.filter(pickBan => pickBan.isPick && pickBan.isRadiant).map(pickBan => ({
        heroId: pickBan.heroId.toString(),
        heroName: getHero(pickBan.heroId),
        order: pickBan.order,
      })) : [], // TODO: Handle null case
      bans: match.pickBans ? match.pickBans.filter(pickBan => !pickBan.isPick && pickBan.isRadiant).map(pickBan => ({
        heroId: pickBan.heroId.toString(),
        heroName: getHero(pickBan.heroId),
        order: pickBan.order,
      })) : [],
    },
    dire: {
      id: match.direTeam.id.toString(),
      name: match.direTeam.name,
      players: match.players.filter(player => !player.isRadiant).map(player => ({
        heroId: player.heroId.toString(),
        heroName: getHero(player.heroId),
        position: player.position,
        name: player.steamAccount.name,
        id: player.steamAccount.id.toString(),
      })),
      picks: match.pickBans ? match.pickBans.filter(pickBan => pickBan.isPick && !pickBan.isRadiant).map(pickBan => ({
        heroId: pickBan.heroId.toString(),
        heroName: getHero(pickBan.heroId),
        order: pickBan.order,
      })) : [],
      bans: match.pickBans ? match.pickBans.filter(pickBan => !pickBan.isPick && !pickBan.isRadiant).map(pickBan => ({
        heroId: pickBan.heroId.toString(),
        heroName: getHero(pickBan.heroId),
        order: pickBan.order,
      })) : [],
    }
  }
}

export const { useLazyGetMatchesQuery } = matchesApiSlice
