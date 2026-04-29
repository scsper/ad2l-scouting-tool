import { createClient } from "@supabase/supabase-js"

const OPENDOTA_API_KEY = process.env.OPENDOTA_API_TOKEN ?? ""
const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type OpenDotaHero = {
  id: number
  name: string
  localized_name: string
}

type OpenDotaMatchup = {
  hero_id: number
  games_played: number
  wins: number
}

type HeroMatchupRow = {
  hero_id: number
  versus_hero_id: number
  games_played: number
  wins: number
  updated_at: string
}

async function fetchWithRateLimit(url: string): Promise<Response> {
  const fullUrl = OPENDOTA_API_KEY ? `${url}?api_key=${OPENDOTA_API_KEY}` : url
  const res = await fetch(fullUrl)
  if (res.status === 429) {
    console.log("Rate limited, waiting 60s...")
    await new Promise((r) => setTimeout(r, 60_000))
    return fetchWithRateLimit(url)
  }
  return res
}

async function getAllHeroes(): Promise<OpenDotaHero[]> {
  const res = await fetchWithRateLimit("https://api.opendota.com/api/heroes")
  if (!res.ok) throw new Error(`Failed to fetch heroes: ${res.status}`)
  return res.json()
}

async function getHeroMatchups(heroId: number): Promise<OpenDotaMatchup[]> {
  const res = await fetchWithRateLimit(
    `https://api.opendota.com/api/heroes/${heroId}/matchups`
  )
  if (!res.ok) throw new Error(`Failed to fetch matchups for hero ${heroId}: ${res.status}`)
  return res.json()
}

async function upsertMatchups(rows: HeroMatchupRow[]) {
  const { error } = await supabase
    .from("hero_matchups")
    .upsert(rows, { onConflict: "hero_id,versus_hero_id" })
  if (error) throw new Error(`Supabase upsert failed: ${error.message}`)
}

async function main() {
  console.log("Fetching all heroes...")
  const heroes = await getAllHeroes()
  console.log(`Found ${heroes.length} heroes`)

  const updatedAt = new Date().toISOString()
  const DELAY_MS = OPENDOTA_API_KEY ? 200 : 1_200 // ~5 req/s with key, ~1 req/s without

  for (let i = 0; i < heroes.length; i++) {
    const hero = heroes[i]
    console.log(`[${i + 1}/${heroes.length}] Fetching matchups for ${hero.localized_name} (${hero.id})`)

    const matchups = await getHeroMatchups(hero.id)

    const rows: HeroMatchupRow[] = matchups.map((m) => ({
      hero_id: hero.id,
      versus_hero_id: m.hero_id,
      games_played: m.games_played,
      wins: m.wins,
      updated_at: updatedAt,
    }))

    await upsertMatchups(rows)
    console.log(`  -> Upserted ${rows.length} matchups`)

    if (i < heroes.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS))
    }
  }

  console.log("Done.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
