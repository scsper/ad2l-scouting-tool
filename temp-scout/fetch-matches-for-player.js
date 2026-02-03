const PLAYER_ID = 29084710;
const API_URL = "https://api.stratz.com/graphql";
const STRATZ_API_KEY = process.env.STRATZ_API_TOKEN;

const THREE_MONTHS_AGO = 60 * 60 * 24 * 30 * 3;

const FETCH_TOP_HEROES_BY_POSITION_QUERY = `
query GetPlayerHeroesStats($steamId: Long!, $heroesGroupByRequest: PlayerMatchesGroupByRequestType!, $heroesPerformanceGroupByRequest: PlayerMatchesGroupByRequestType!, $skipPlayedHeroes: Boolean!, $skipDotaPlus: Boolean!) {
  player(steamAccountId: $steamId) {
    steamAccountId
    matchCount
    heroesGroupBy: matchesGroupBy(request: $heroesGroupByRequest) {
      ... on MatchGroupByHeroType {
        heroId
        matchCount
        winCount
        avgGoldPerMinute
        avgExperiencePerMinute
        lastMatchDateTime
        avgAssists
        avgKills
        avgDeaths
        __typename
      }
      __typename
    }
    heroesPerformanceGroupBy: matchesGroupBy(
      request: $heroesPerformanceGroupByRequest
    ) {
      ... on MatchGroupByHeroPerformanceType {
        heroId
        position
        matchCount
        winCount
        __typename
      }
      __typename
    }
    dotaPlus @skip(if: $skipDotaPlus) {
      heroId
      level
      __typename
    }
    ...PlayedHeroesAndGameVersionsFragment
    __typename
  }
}

fragment PlayedHeroesAndGameVersionsFragment on PlayerType {
  playedHeroes: matchesGroupBy(
    request: {groupBy: HERO, playerList: SINGLE, take: 1000000}
  ) @skip(if: $skipPlayedHeroes) {
    ... on MatchGroupByHeroType {
      heroId
      __typename
    }
    __typename
  }
  __typename
}`

const FETCH_TOP_HEROES_QUERY = `query GetPlayerHeroesStats($steamId: Long!, $heroesGroupByRequest: PlayerMatchesGroupByRequestType!, $heroesPerformanceGroupByRequest: PlayerMatchesGroupByRequestType!, $skipPlayedHeroes: Boolean!, $skipDotaPlus: Boolean!) {
  player(steamAccountId: $steamId) {
    steamAccountId
    matchCount
    heroesGroupBy: matchesGroupBy(request: $heroesGroupByRequest) {
      ... on MatchGroupByHeroType {
        heroId
        matchCount
        winCount
        avgGoldPerMinute
        avgExperiencePerMinute
        lastMatchDateTime
        avgAssists
        avgKills
        avgDeaths
        __typename
      }
      __typename
    }
    heroesPerformanceGroupBy: matchesGroupBy(
      request: $heroesPerformanceGroupByRequest
    ) {
      ... on MatchGroupByHeroPerformanceType {
        heroId
        position
        matchCount
        winCount
        __typename
      }
      __typename
    }
    dotaPlus @skip(if: $skipDotaPlus) {
      heroId
      level
      __typename
    }
    ...PlayedHeroesAndGameVersionsFragment
    __typename
  }
}

fragment PlayedHeroesAndGameVersionsFragment on PlayerType {
  playedHeroes: matchesGroupBy(
    request: {groupBy: HERO, playerList: SINGLE, take: 1000000}
  ) @skip(if: $skipPlayedHeroes) {
    ... on MatchGroupByHeroType {
      heroId
      __typename
    }
    __typename
  }
  __typename
}`
const FETCH_TOP_HEROES_VARIABLES = `{
  "steamId": 106632908,
  "heroesGroupByRequest": {
    "groupBy": "HERO",
    "playerList": "SINGLE",
    "skip": 0,
    "take": 10000
  },
  "heroesPerformanceGroupByRequest": {
    "groupBy": "HERO_PERFORMANCE",
    "playerList": "SINGLE",
    "skip": 0,
    "take": 10000
  },
  "skipPlayedHeroes": false,
  "skipDotaPlus": false
}`

const FETCH_RECENT_MATCHES_QUERY = `
query GetPlayerHeroesStats($steamId: Long!, $heroesGroupByRequest: PlayerMatchesGroupByRequestType!, $heroesPerformanceGroupByRequest: PlayerMatchesGroupByRequestType!, $skipPlayedHeroes: Boolean!, $skipDotaPlus: Boolean!) {
  player(steamAccountId: $steamId) {
    steamAccountId
    matchCount
    heroesGroupBy: matchesGroupBy(request: $heroesGroupByRequest) {
      ... on MatchGroupByHeroType {
        heroId
        matchCount
        winCount
        avgGoldPerMinute
        avgExperiencePerMinute
        lastMatchDateTime
        avgAssists
        avgKills
        avgDeaths
        __typename
      }
      __typename
    }
    heroesPerformanceGroupBy: matchesGroupBy(
      request: $heroesPerformanceGroupByRequest
    ) {
      ... on MatchGroupByHeroPerformanceType {
        heroId
        position
        matchCount
        winCount
        __typename
      }
      __typename
    }
    dotaPlus @skip(if: $skipDotaPlus) {
      heroId
      level
      __typename
    }
    ...PlayedHeroesAndGameVersionsFragment
    __typename
  }
}

fragment PlayedHeroesAndGameVersionsFragment on PlayerType {
  playedHeroes: matchesGroupBy(
    request: {groupBy: HERO, playerList: SINGLE, take: 1000000}
  ) @skip(if: $skipPlayedHeroes) {
    ... on MatchGroupByHeroType {
      heroId
      __typename
    }
    __typename
  }
  __typename
}`

function getVariablesForTopHeroesByPosition(playerId, positionIds) {
  return {
    "steamId": playerId,
    "heroesGroupByRequest": {
      "positionIds": positionIds,
      "groupBy": "HERO",
      "playerList": "SINGLE",
      "skip": 0,
      "take": 10000
    },
    "heroesPerformanceGroupByRequest": {
      "positionIds": positionIds,
      "groupBy": "HERO_PERFORMANCE",
      "playerList": "SINGLE",
      "skip": 0,
      "take": 10000
    },
    "skipPlayedHeroes": false,
    "skipDotaPlus": false
  }
}

function getVariablesForTopHeroes(playerId) {
  return {
    "steamId": playerId,
    "heroesGroupByRequest": {
      "groupBy": "HERO",
      "playerList": "SINGLE",
      "skip": 0,
      "take": 10000
    },
    "heroesPerformanceGroupByRequest": {
      "groupBy": "HERO_PERFORMANCE",
      "playerList": "SINGLE",
      "skip": 0,
      "take": 10000
    },
    "skipPlayedHeroes": false,
    "skipDotaPlus": false
  }
}


function getVariablesForRecentMatches (playerId, positionIds) {
  const now = Math.floor(Date.now() / 1000)
  const threeMonthsAgo = now - THREE_MONTHS_AGO;

  return {
    "steamId": playerId,
    "heroesGroupByRequest": {
      "positionIds": positionIds,
      "gameModeIds": [
        1,
        22,
        2
      ],
      "startDateTime": threeMonthsAgo,
      "endDateTime": now,
      "groupBy": "HERO",
      "playerList": "SINGLE",
      "skip": 0,
      "take": 10000
    },
    "heroesPerformanceGroupByRequest": {
      "positionIds": positionIds,
      "gameModeIds": [
        1,
        22,
        2
      ],
      "startDateTime": threeMonthsAgo,
      "endDateTime": now,
      "groupBy": "HERO_PERFORMANCE",
      "playerList": "SINGLE",
      "skip": 0,
      "take": 10000
    },
    "skipPlayedHeroes": false,
    "skipDotaPlus": false
  }
}
export async function getRecentMatches(playerId, positionIds) {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": 'STRATZ_API',
        "Authorization": `Bearer ${STRATZ_API_KEY}`
      },
      body: JSON.stringify({ query: FETCH_RECENT_MATCHES_QUERY, variables: getVariablesForRecentMatches(playerId, positionIds) })
    });

    const matchData = await response.json();

    if (matchData.errors) {
      console.error("GraphQL Error:", matchData.errors);
      return;
    }

    return matchData;
  } catch (error) {
    console.error("Error fetching matches:", error);
  }
}

export async function getTopHeroes(playerId) {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": 'STRATZ_API',
        "Authorization": `Bearer ${STRATZ_API_KEY}`
      },
      body: JSON.stringify({ query: FETCH_TOP_HEROES_QUERY, variables: getVariablesForTopHeroes(playerId) })
    });

    const topHeroesData = await response.json();

    if (topHeroesData.errors) {
      console.error("GraphQL Error:", topHeroesData.errors);
      return;
    }

    return topHeroesData;
  } catch (error) {
    console.error("Error fetching top heroes:", error);
  }
}

export async function getTopHeroesByPosition(playerId, positionIds) {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": 'STRATZ_API',
        "Authorization": `Bearer ${STRATZ_API_KEY}`
      },
      body: JSON.stringify({ query: FETCH_TOP_HEROES_QUERY, variables: getVariablesForTopHeroesByPosition(playerId, positionIds) })
    });

    const topHeroesData = await response.json();

    if (topHeroesData.errors) {
      console.error("GraphQL Error:", topHeroesData.errors);
      return;
    }

    return topHeroesData;
  } catch (error) {
    console.error("Error fetching top heroes:", error);
  }
}
