import { createClient } from "@supabase/supabase-js"

const OPENDOTA_API_KEY = process.env.OPENDOTA_API_TOKEN ?? ""
const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type HeroStatRaw = {
  id: number
  localized_name: string
  "1_pick": number
  "1_win": number
  "2_pick": number
  "2_win": number
  "3_pick": number
  "3_win": number
  "4_pick": number
  "4_win": number
  "5_pick": number
  "5_win": number
  "6_pick": number
  "6_win": number
  "7_pick": number
  "7_win": number
  "8_pick": number
  "8_win": number
  pro_pick: number
  pro_win: number
}

type HeroStatsRow = {
  hero_id: number
  hero_name: string
  all_pick: number
  all_win: number
  legend_plus_pick: number
  legend_plus_win: number
  legend_surrounding_pick: number
  legend_surrounding_win: number
  legend_pick: number
  legend_win: number
  updated_at: string
}

function sumPick(hero: HeroStatRaw, keys: string[]): number {
  const h = hero as unknown as Record<string, number>
  return keys.reduce((acc, k) => acc + (h[k] ?? 0), 0)
}

async function fetchHeroStats(): Promise<HeroStatRaw[]> {
  const url = OPENDOTA_API_KEY
    ? `https://api.opendota.com/api/heroStats?api_key=${OPENDOTA_API_KEY}`
    : "https://api.opendota.com/api/heroStats"
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch hero stats: ${res.status}`)
  return res.json() as Promise<HeroStatRaw[]>
}

function toRow(hero: HeroStatRaw, updatedAt: string): HeroStatsRow {
  const p = (ns: string[]) => ns.map((n) => `${n}_pick`)
  const w = (ns: string[]) => ns.map((n) => `${n}_win`)
  const all = ["1", "2", "3", "4", "5", "6", "7", "8"]

  return {
    hero_id: hero.id,
    hero_name: hero.localized_name,
    all_pick: sumPick(hero, [...p(all), "pro_pick"]),
    all_win: sumPick(hero, [...w(all), "pro_win"]),
    legend_plus_pick: sumPick(hero, [...p(["5", "6", "7", "8"]), "pro_pick"]),
    legend_plus_win: sumPick(hero, [...w(["5", "6", "7", "8"]), "pro_win"]),
    legend_surrounding_pick: sumPick(hero, p(["4", "5", "6"])),
    legend_surrounding_win: sumPick(hero, w(["4", "5", "6"])),
    legend_pick: hero["5_pick"],
    legend_win: hero["5_win"],
    updated_at: updatedAt,
  }
}

async function main() {
  console.log("Fetching hero stats from OpenDota...")
  const raw = await fetchHeroStats()
  console.log(`Got stats for ${raw.length} heroes`)

  const updatedAt = new Date().toISOString()
  const rows = raw.map((h) => toRow(h, updatedAt))

  console.log("Upserting into hero_stats table...")
  const { error } = await supabase
    .from("hero_stats")
    .upsert(rows, { onConflict: "hero_id" })
  if (error) throw new Error(`Supabase upsert failed: ${error.message}`)

  console.log(`Done. Upserted ${rows.length} rows.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
