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

type Team = {
  id: number;
  name: string;
}

type PickBan = {
  isPick: boolean;
  heroId: number;
  order: number;
  isRadiant: boolean;
}

type SteamAccount = {
  id: number;
  name: string | null;
}

type Player = {
  steamAccount: SteamAccount | null;
  heroId: number;
  isVictory: boolean;
  isRadiant: boolean;
  lane: string | null;
  kills: number;
  deaths: number;
  assists: number;
  numLastHits: number;
  numDenies: number;
  goldPerMinute: number;
  experiencePerMinute: number;
  heroDamage: number;
  towerDamage: number;
}

type Match = {
  id: number;
  didRadiantWin: boolean;
  startDateTime: number;
  endDateTime: number;
  leagueId: number;
  radiantTeam: Team | null;
  direTeam: Team | null;
  topLaneOutcome: string | null;
  midLaneOutcome: string | null;
  bottomLaneOutcome: string | null;
  pickBans: PickBan[];
  players: Player[];
}

type MatchResponse = {
  data: {
    match: Match;
  };
}

function getVariablesForGetMatch(matchId: number) {
  return {
    "matchId": matchId
  }
}

export async function getMatch(matchId: number): Promise<MatchResponse | undefined> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": 'STRATZ_API',
      "Authorization": `Bearer ${STRATZ_API_KEY}`
    },
    body: JSON.stringify({ query: QUERY, variables: getVariablesForGetMatch(matchId) })
  });

  const matchData = await response.json() as MatchResponse;

  if ('errors' in matchData) {
    console.error("GraphQL Error:", matchData.errors);
    return;
  }

  return matchData;
}

function getMatchIdFromCommandLine(): number {
  const matchIdArg = process.argv[2];

  if (!matchIdArg) {
    console.error("Error: Match ID is required");
    console.log("Usage: tsx parse-match.ts <matchId>");
    process.exit(1);
  }

  const matchId = parseInt(matchIdArg, 10);

  if (isNaN(matchId)) {
    console.error(`Error: Invalid match ID "${matchIdArg}". Must be a number.`);
    process.exit(1);
  }

  return matchId;
}

export function convertMatchDataToDbSchema(matchData: Match) {
  // TODO: Implement conversion logic
  return matchData;
}

// Main execution
const matchId = getMatchIdFromCommandLine();
const matchData = await getMatch(matchId);
console.log(JSON.stringify(matchData, null, 2));


