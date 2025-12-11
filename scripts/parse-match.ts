const API_URL = "https://api.stratz.com/graphql";
const STRATZ_API_KEY = process.env.STRATZ_API_TOKEN ?? "";

const QUERY = `query GetMatch($matchId: Long!) {
	match(id: $matchId) {
    id
    didRadiantWin
    startDateTime
    endDateTime
    leagueId
    radiantTeam {
      id
      name
    }
    direTeam {
      id
      name
    }
    topLaneOutcome
    midLaneOutcome
    bottomLaneOutcome
    pickBans {
      isPick
      heroId
      order
      isRadiant
    }
		players {
      steamAccount {
        id
        name
      }
      heroId
      isVictory
      isRadiant
      lane
      kills
      deaths
      assists
      numLastHits
      numDenies
      goldPerMinute
      experiencePerMinute
      heroDamage
      towerDamage
    }
  }
}`

function getVariablesForGetMatch(matchId: number) {
  return {
    "matchId": matchId
  }
}

export async function getMatch(matchId: number) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": 'STRATZ_API',
      "Authorization": `Bearer ${STRATZ_API_KEY}`
    },
    body: JSON.stringify({ query: QUERY, variables: getVariablesForGetMatch(matchId) })
  });

  const matchData = await response.json();

  if (matchData.errors) {
    console.error("GraphQL Error:", matchData.errors);
    return;
  }

  return matchData;
}
