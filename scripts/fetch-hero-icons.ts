/**
 * Vendor Valve's minimap hero icons into `public/heroes/<heroId>.png`.
 *
 * Run once, and again when a new hero ships:
 *
 *   npx tsx scripts/fetch-hero-icons.ts
 *
 * Keyed by hero id, not by slug, and that is the point. Valve's asset paths use
 * an internal name that does not follow from the display name we already have —
 * Shadow Fiend is `nevermore`, Windranger is `windrunner`, Zeus is `zuus`,
 * Outworld Destroyer is `obsidian_destroyer`. Resolving that map here rather
 * than in app code means the browser never needs it, and `getHero`'s id-to-name
 * table stays the only hero table the app ships.
 *
 * The icons are committed rather than hotlinked so the map renders offline, the
 * tests exercise real paths instead of URLs that silently 404 in jsdom, and a
 * Valve path change breaks this script rather than production.
 */
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

const HEROES_API = "https://api.opendota.com/api/heroes"
const ICON_BASE =
  "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/icons"

const OUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "heroes",
)

type OpenDotaHero = {
  id: number
  /** `npc_dota_hero_antimage` — the slug is everything after the prefix. */
  name: string
  localized_name: string
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const response = await fetch(HEROES_API)
  if (!response.ok) {
    throw new Error(`hero list: ${String(response.status)}`)
  }
  const heroes = (await response.json()) as OpenDotaHero[]
  console.log(`${String(heroes.length)} heroes`)

  let written = 0
  const missing: string[] = []

  for (const hero of heroes) {
    const slug = hero.name.replace("npc_dota_hero_", "")
    const url = `${ICON_BASE}/${slug}.png`
    const icon = await fetch(url)

    // Valve's CDN answers 200 with an HTML error page for unknown paths on some
    // hosts, so the content type is checked rather than just the status.
    const contentType = icon.headers.get("content-type") ?? ""
    if (!icon.ok || !contentType.startsWith("image/")) {
      missing.push(`${hero.localized_name} (${slug})`)
      continue
    }

    const bytes = Buffer.from(await icon.arrayBuffer())
    await writeFile(path.join(OUT_DIR, `${String(hero.id)}.png`), bytes)
    written++
  }

  console.log(`wrote ${String(written)} icons to public/heroes`)
  if (missing.length > 0) {
    // Not fatal. A hero without an icon falls back to a plain coloured dot on
    // the map, so a missing file degrades the mark rather than breaking it.
    console.warn(`no icon for ${String(missing.length)}:`, missing.join(", "))
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
