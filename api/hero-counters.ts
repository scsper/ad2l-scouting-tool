import { createClient } from "@supabase/supabase-js"
import type { HeroCounterRow } from "../types/db"

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""
const STRATZ_API_TOKEN = process.env.STRATZ_API_TOKEN ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const API_URL = "https://api.stratz.com/graphql"
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

type StratzCounterEntry = {
  heroId2: number
  synergy: number
}

type StratzCountersResponse = {
  data?: {
    heroStats: {
      heroVsHeroMatchup: {
        advantage: Array<{
          vs: StratzCounterEntry[]
        }>
      }
    }
  }
  errors?: Array<{ message: string }>
}

async function fetchCountersFromStratz(heroId: number): Promise<StratzCounterEntry[]> {
  const query = `{
    heroStats {
      heroVsHeroMatchup(heroId: ${heroId}) {
        advantage {
          vs {
            heroId2
            synergy
          }
        }
      }
    }
  }`

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "STRATZ_API",
      Authorization: `Bearer ${STRATZ_API_TOKEN}`,
    },
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    throw new Error(`Stratz API returned ${response.status}: ${response.statusText}`)
  }

  const data: StratzCountersResponse = await response.json()

  if (data.errors) {
    throw new Error(`Stratz GraphQL Error: ${data.errors.map(e => e.message).join(", ")}`)
  }

  const advantage = data.data?.heroStats?.heroVsHeroMatchup?.advantage
  if (!advantage || advantage.length === 0) {
    return []
  }

  // Flatten all advantage entries and deduplicate by heroId2, averaging synergy
  const synergyMap = new Map<number, { sum: number; count: number }>()
  for (const entry of advantage) {
    for (const vs of entry.vs) {
      const existing = synergyMap.get(vs.heroId2)
      if (existing) {
        existing.sum += vs.synergy
        existing.count++
      } else {
        synergyMap.set(vs.heroId2, { sum: vs.synergy, count: 1 })
      }
    }
  }

  return Array.from(synergyMap.entries()).map(([heroId2, { sum, count }]) => ({
    heroId2,
    synergy: sum / count,
  }))
}

async function upsertCounters(heroId: number, counters: StratzCounterEntry[]): Promise<HeroCounterRow[]> {
  if (counters.length === 0) {
    return []
  }

  const now = new Date().toISOString()
  const rows = counters.map(c => ({
    hero_id: heroId,
    counter_hero_id: c.heroId2,
    synergy: c.synergy,
    updated_at: now,
  }))

  const { data, error } = await supabase
    .from("hero_counters")
    .upsert(rows, { onConflict: "hero_id,counter_hero_id" })
    .select()

  if (error) {
    console.error("Error upserting hero counters:", error)
    throw error
  }

  return data as HeroCounterRow[]
}

async function getCountersFromDB(heroId: number): Promise<HeroCounterRow[]> {
  const { data, error } = await supabase
    .from("hero_counters")
    .select("*")
    .eq("hero_id", heroId)

  if (error) {
    console.error("Error fetching hero counters:", error)
    throw error
  }

  return data as HeroCounterRow[]
}

function getUpdatedAt(rows: HeroCounterRow[]): string | null {
  if (rows.length === 0) return null
  return rows.reduce((max, row) => (row.updated_at > max ? row.updated_at : max), rows[0].updated_at)
}

function isStale(rows: HeroCounterRow[]): boolean {
  const updatedAt = getUpdatedAt(rows)
  if (!updatedAt) return true
  return Date.now() - new Date(updatedAt).getTime() > SEVEN_DAYS_MS
}

async function getOrFetchCounters(heroId: number): Promise<{ data: HeroCounterRow[]; updatedAt: string }> {
  let rows = await getCountersFromDB(heroId)

  if (isStale(rows)) {
    const counters = await fetchCountersFromStratz(heroId)
    rows = await upsertCounters(heroId, counters)
  }

  const updatedAt = getUpdatedAt(rows) ?? new Date().toISOString()
  return { data: rows, updatedAt }
}

async function forceRefreshCounters(heroId: number): Promise<{ data: HeroCounterRow[]; updatedAt: string }> {
  const counters = await fetchCountersFromStratz(heroId)
  const rows = await upsertCounters(heroId, counters)
  const updatedAt = getUpdatedAt(rows) ?? new Date().toISOString()
  return { data: rows, updatedAt }
}

export default async function handler(
  req: {
    method: string
    body: { heroId?: number }
    query: { heroId?: string }
  },
  res: {
    status: (code: number) => { json: (data: unknown) => void }
  },
) {
  if (req.method === "GET") {
    const { heroId } = req.query

    if (!heroId) {
      res.status(400).json({ error: "heroId is required" })
      return
    }

    const heroIdNum = parseInt(heroId, 10)
    if (isNaN(heroIdNum)) {
      res.status(400).json({ error: "heroId must be a valid number" })
      return
    }

    try {
      const result = await getOrFetchCounters(heroIdNum)
      res.status(200).json(result)
    } catch (error) {
      console.error("Error in hero-counters GET handler:", error)
      res.status(500).json({ error: "Failed to fetch hero counters" })
    }
    return
  }

  if (req.method === "POST") {
    const { heroId } = req.body

    if (!heroId || typeof heroId !== "number") {
      res.status(400).json({ error: "heroId must be a number" })
      return
    }

    try {
      const result = await forceRefreshCounters(heroId)
      res.status(200).json(result)
    } catch (error) {
      console.error("Error in hero-counters POST handler:", error)
      res.status(500).json({ error: "Failed to refresh hero counters" })
    }
    return
  }

  res.status(405).json({ error: "Method not allowed" })
}
