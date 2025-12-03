const STRATZ_API_KEY = process.env.STRATZ_API_TOKEN ?? ""
const API_URL = "https://api.stratz.com/graphql"

const HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "STRATZ_API",
  Authorization: `Bearer ${STRATZ_API_KEY}`,
}

const FETCH_MATCHES_FOR_LEAGUE_QUERY = `
query ($leagueId: Int!, $teamId: Int!) {
  league(id: $leagueId) {
    id
    name
    matches(request:{ teamId: $teamId, take:100, skip:0 }) {
      id
      didRadiantWin
      durationSeconds
      radiantTeam {
        id
        name
      }
      direTeam {
        id
        name
      }
      players {
        heroId
        steamAccountId
        isRadiant
        position
      }
      pickBans {
        isPick
        heroId
        order
        isRadiant
      }
    }
  }
}
`

type GraphQLResponse<T = unknown> = {
  data?: T
  errors?: { message: string }[]
}

export default async function handler(
  req: { query: { leagueId: string; teamId: string } },
  res: {
    status: (code: number) => { json: (data: unknown) => void }
  },
) {
  const { leagueId, teamId } = req.query

  const response = await fetch(API_URL, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      query: FETCH_MATCHES_FOR_LEAGUE_QUERY,
      variables: { leagueId: Number(leagueId), teamId: Number(teamId) },
    }),
  })

  const data = (await response.json()) as GraphQLResponse

  if (data.errors) {
    res.status(500).json({ error: data.errors[0].message })
    return
  }

  res.status(200).json(data)
}

