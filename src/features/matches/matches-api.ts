import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'




const response = await fetch(API_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "User-Agent": 'STRATZ_API',
    "Authorization": `Bearer ${STRATZ_API_KEY}`
  },
  body: JSON.stringify({ query: FETCH_TOP_HEROES_QUERY, variables: getVariablesForTopHeroesByPosition(playerId, positionIds) })
});

export function fetchMatches(leagueId: string, teamId: string) {

}
