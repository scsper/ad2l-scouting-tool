import { createClient } from "@supabase/supabase-js"
import type { PlayerPubMatchStatsRow } from "../types/db"

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""
const STRATZ_API_TOKEN = process.env.STRATZ_API_TOKEN ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const API_URL = "https://api.stratz.com/graphql"
const THREE_MONTHS_IN_SECONDS = 60 * 60 * 24 * 30 * 3

// GraphQL Queries
const FETCH_HEROES_QUERY = `
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

// Stratz API Types
type StratzHeroData = {
  heroId: number
  matchCount: number
  winCount: number
  avgGoldPerMinute: number
  avgExperiencePerMinute: number
  lastMatchDateTime: number
  avgAssists: number
  avgKills: number
  avgDeaths: number
}

type StratzResponse = {
  data?: {
    player: {
      steamAccountId: number
      matchCount: number
      heroesGroupBy: StratzHeroData[]
    }
  }
  errors?: Array<{ message: string }>
}

// Request/Response Types
type FetchPlayerPubMatchesRequest = {
  playerId: number
  positions?: string[]
}

type FetchPlayerPubMatchesResponse = {
  success: boolean
  data: {
    recentMatches: PlayerPubMatchStatsRow[]
    topHeroesByPosition: PlayerPubMatchStatsRow[]
    topHeroesOverall: PlayerPubMatchStatsRow[]
  }
}

// Helper function to build variables for recent matches query
function getVariablesForRecentMatches(
  playerId: number,
  positionIds?: string[],
) {
  const now = Math.floor(Date.now() / 1000)
  const threeMonthsAgo = now - THREE_MONTHS_IN_SECONDS

  const baseRequest = {
    gameModeIds: [1, 22, 2],
    startDateTime: threeMonthsAgo,
    endDateTime: now,
    groupBy: "HERO" as const,
    playerList: "SINGLE" as const,
    skip: 0,
    take: 10000,
  }

  return {
    steamId: playerId,
    heroesGroupByRequest: positionIds
      ? { ...baseRequest, positionIds }
      : baseRequest,
    heroesPerformanceGroupByRequest: positionIds
      ? { ...baseRequest, positionIds, groupBy: "HERO_PERFORMANCE" as const }
      : { ...baseRequest, groupBy: "HERO_PERFORMANCE" as const },
    skipPlayedHeroes: false,
    skipDotaPlus: false,
  }
}

// Helper function to build variables for top heroes by position
function getVariablesForTopHeroesByPosition(
  playerId: number,
  positionIds?: string[],
) {
  const baseRequest = {
    groupBy: "HERO" as const,
    playerList: "SINGLE" as const,
    skip: 0,
    take: 10000,
  }

  return {
    steamId: playerId,
    heroesGroupByRequest: positionIds
      ? { ...baseRequest, positionIds }
      : baseRequest,
    heroesPerformanceGroupByRequest: positionIds
      ? { ...baseRequest, positionIds, groupBy: "HERO_PERFORMANCE" as const }
      : { ...baseRequest, groupBy: "HERO_PERFORMANCE" as const },
    skipPlayedHeroes: false,
    skipDotaPlus: false,
  }
}

// Helper function to build variables for top heroes overall
function getVariablesForTopHeroes(playerId: number) {
  return {
    steamId: playerId,
    heroesGroupByRequest: {
      groupBy: "HERO",
      playerList: "SINGLE",
      skip: 0,
      take: 10000,
    },
    heroesPerformanceGroupByRequest: {
      groupBy: "HERO_PERFORMANCE",
      playerList: "SINGLE",
      skip: 0,
      take: 10000,
    },
    skipPlayedHeroes: false,
    skipDotaPlus: false,
  }
}

// Stratz API Functions
async function fetchFromStratz(variables: unknown): Promise<StratzResponse> {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "STRATZ_API",
        Authorization: `Bearer ${STRATZ_API_TOKEN}`,
      },
      body: JSON.stringify({ query: FETCH_HEROES_QUERY, variables }),
    })

    if (!response.ok) {
      throw new Error(
        `Stratz API returned ${response.status}: ${response.statusText}`,
      )
    }

    const data = await response.json()

    if (data.errors) {
      console.error("GraphQL Error:", data.errors)
      throw new Error(
        `Stratz GraphQL Error: ${data.errors.map((e: { message: string }) => e.message).join(", ")}`,
      )
    }

    return data
  } catch (error) {
    console.error("Error fetching from Stratz:", error)
    throw error
  }
}

async function getRecentMatches(
  playerId: number,
  positionIds?: string[],
): Promise<StratzHeroData[]> {
  const variables = getVariablesForRecentMatches(playerId, positionIds)
  const response = await fetchFromStratz(variables)

  if (!response.data?.player?.heroesGroupBy) {
    return []
  }

  return response.data.player.heroesGroupBy
}

async function getTopHeroesByPosition(
  playerId: number,
  positionIds?: string[],
): Promise<StratzHeroData[]> {
  const variables = getVariablesForTopHeroesByPosition(playerId, positionIds)
  const response = await fetchFromStratz(variables)

  if (!response.data?.player?.heroesGroupBy) {
    return []
  }

  // Sort by match count and take top 10
  return response.data.player.heroesGroupBy
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, 10)
}

async function getTopHeroes(playerId: number): Promise<StratzHeroData[]> {
  const variables = getVariablesForTopHeroes(playerId)
  const response = await fetchFromStratz(variables)

  if (!response.data?.player?.heroesGroupBy) {
    return []
  }

  // Sort by match count and take top 10
  return response.data.player.heroesGroupBy
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, 10)
}

// Database Helper Functions
async function verifyPlayerExists(playerId: number): Promise<boolean> {
  const result = await supabase
    .from("player")
    .select("id")
    .eq("id", playerId)
    .single()

  return !result.error && result.data !== null
}

async function deleteExistingStats(playerId: number): Promise<void> {
  const result = await supabase
    .from("player_pub_match_stats")
    .delete()
    .eq("player_id", playerId)

  if (result.error) {
    console.error("Error deleting existing stats:", result.error)
    throw result.error
  }
}

function transformStratzData(
  heroesGroupBy: StratzHeroData[],
  playerId: number,
  type: "RECENT_MATCH" | "TOP_10_HEROES_BY_POSITION" | "TOP_10_HEROES_OVERALL",
): Omit<PlayerPubMatchStatsRow, "id" | "created_at">[] {
  return heroesGroupBy.map(hero => {
    // Convert Unix timestamp to ISO string for PostgreSQL timestamptz
    let lastMatchDateTime = null
    if (hero.lastMatchDateTime) {
      const date = new Date(hero.lastMatchDateTime * 1000)
      lastMatchDateTime = date.toISOString()
    }

    return {
      player_id: playerId,
      hero_id: hero.heroId,
      wins: hero.winCount,
      losses: hero.matchCount - hero.winCount,
      type,
      last_match_date_time: lastMatchDateTime,
    }
  })
}

async function insertStats(
  stats: Omit<PlayerPubMatchStatsRow, "id" | "created_at">[],
): Promise<PlayerPubMatchStatsRow[]> {
  if (stats.length === 0) {
    return []
  }

  const result = await supabase
    .from("player_pub_match_stats")
    .insert(stats)
    .select()

  if (result.error) {
    console.error("Error inserting stats:", result.error)
    throw result.error
  }

  return result.data as PlayerPubMatchStatsRow[]
}

async function fetchAndStorePlayerStats(
  playerId: number,
  positions?: string[],
): Promise<FetchPlayerPubMatchesResponse> {
  // Verify player exists
  const playerExists = await verifyPlayerExists(playerId)
  if (!playerExists) {
    throw new Error("Player not found")
  }

  // Fetch data from Stratz in parallel
  const [recentHeroesData, topHeroesByPositionData, topHeroesData] =
    await Promise.all([
      getRecentMatches(playerId, positions),
      getTopHeroesByPosition(playerId, positions),
      getTopHeroes(playerId),
    ])

  // Transform data
  const recentMatchesTransformed = transformStratzData(
    recentHeroesData,
    playerId,
    "RECENT_MATCH",
  )
  const topHeroesByPositionTransformed = transformStratzData(
    topHeroesByPositionData,
    playerId,
    "TOP_10_HEROES_BY_POSITION",
  )
  const topHeroesTransformed = transformStratzData(
    topHeroesData,
    playerId,
    "TOP_10_HEROES_OVERALL",
  )

  // Combine all stats
  const allStats = [
    ...recentMatchesTransformed,
    ...topHeroesByPositionTransformed,
    ...topHeroesTransformed,
  ]

  // Delete existing stats and insert new ones
  await deleteExistingStats(playerId)
  const insertedStats = await insertStats(allStats)

  // Group results by type
  const recentMatches = insertedStats.filter(s => s.type === "RECENT_MATCH")
  const topHeroesByPosition = insertedStats.filter(
    s => s.type === "TOP_10_HEROES_BY_POSITION",
  )
  const topHeroesOverall = insertedStats.filter(
    s => s.type === "TOP_10_HEROES_OVERALL",
  )

  return {
    success: true,
    data: {
      recentMatches,
      topHeroesByPosition,
      topHeroesOverall,
    },
  }
}

async function getPlayerStats(
  playerId: number,
): Promise<FetchPlayerPubMatchesResponse> {
  const result = await supabase
    .from("player_pub_match_stats")
    .select("*")
    .eq("player_id", playerId)

  if (result.error) {
    console.error("Error fetching player stats:", result.error)
    throw result.error
  }

  const stats = result.data as PlayerPubMatchStatsRow[]

  // Group results by type
  const recentMatches = stats.filter(s => s.type === "RECENT_MATCH")
  const topHeroesByPosition = stats.filter(
    s => s.type === "TOP_10_HEROES_BY_POSITION",
  )
  const topHeroesOverall = stats.filter(s => s.type === "TOP_10_HEROES_OVERALL")

  return {
    success: true,
    data: {
      recentMatches,
      topHeroesByPosition,
      topHeroesOverall,
    },
  }
}

// Main Handler
export default async function handler(
  req: {
    method: string
    body: FetchPlayerPubMatchesRequest
    query: { playerId: string }
  },
  res: {
    status: (code: number) => { json: (data: unknown) => void }
  },
) {
  if (req.method === "GET") {
    const { playerId } = req.query

    if (!playerId) {
      res.status(400).json({ error: "playerId is required" })
      return
    }

    const playerIdNum = parseInt(playerId, 10)

    if (isNaN(playerIdNum)) {
      res.status(400).json({ error: "playerId must be a valid number" })
      return
    }

    try {
      const result = await getPlayerStats(playerIdNum)
      res.status(200).json(result)
    } catch (error) {
      console.error("Error in handler:", error)
      res.status(500).json({ error: "Failed to fetch player stats" })
    }
    return
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  const { playerId, positions } = req.body

  // Validate input
  if (!playerId) {
    res.status(400).json({ error: "playerId is required" })
    return
  }

  if (typeof playerId !== "number") {
    res.status(400).json({ error: "playerId must be a number" })
    return
  }

  if (positions && !Array.isArray(positions)) {
    res.status(400).json({ error: "positions must be an array" })
    return
  }

  try {
    const result = await fetchAndStorePlayerStats(playerId, positions)
    res.status(200).json(result)
  } catch (error) {
    console.error("Error in handler:", error)

    if (error instanceof Error) {
      if (error.message === "Player not found") {
        res.status(404).json({ error: "Player not found" })
        return
      }

      if (error.message.includes("Stratz")) {
        res.status(502).json({ error: "Failed to fetch data from Stratz API" })
        return
      }
    }

    res.status(500).json({ error: "Failed to fetch and store player stats" })
  }
}
