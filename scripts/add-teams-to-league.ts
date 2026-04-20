import { createClient } from "@supabase/supabase-js"

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const LEAGUE = { id: 19543, name: "PGL Wallachia 2026" }

const TEAMS = [
  { id: 8255888, name: "BetBoom" },
  { id: 9467224, name: "Aurora Gaming" },
  { id: 9572001, name: "Parivision" },
  { id: 9964962, name: "GamerLegion" },
  { id: 9247354, name: "Team Falcons" },
  { id: 9303484, name: "Heroic" },
  { id: 2163, name: "Team Liquid" },
  { id: 10108947, name: "SouthAmericaRejects" },
  { id: 726228, name: "Vici Gaming" },
  { id: 36, name: "Natus Vincere" },
  { id: 8261500, name: "Xtreme Gaming" },
  { id: 7119388, name: "Team Spirit" },
  { id: 8291895, name: "Tundra Esports" },
  { id: 9895392, name: "Virtus.pro" },
  { id: 9823272, name: "Team Yandex" },
  { id: 9338413, name: "MOUZ" },
]

async function addTeams() {
  console.log("Adding teams...")
  for (const team of TEAMS) {
    const { error } = await supabase.from("team").insert({ id: team.id, name: team.name })
    if (error) {
      if (error.code === "23505") {
        console.log(`  Team already exists, skipping: ${team.name} (${team.id})`)
      } else {
        console.error(`  Error inserting team ${team.name}:`, error)
      }
    } else {
      console.log(`  Added team: ${team.name} (${team.id})`)
    }
  }
}

async function addLeague() {
  console.log("Adding league...")
  const { error } = await supabase
    .from("league")
    .insert({ id: LEAGUE.id, name: LEAGUE.name, has_divisions: false })
  if (error) {
    if (error.code === "23505") {
      console.log(`  League already exists, skipping: ${LEAGUE.name} (${LEAGUE.id})`)
    } else {
      console.error(`  Error inserting league ${LEAGUE.name}:`, error)
      throw error
    }
  } else {
    console.log(`  Added league: ${LEAGUE.name} (${LEAGUE.id})`)
  }
}

async function addTeamsToLeague() {
  console.log("Adding teams to league...")
  for (const team of TEAMS) {
    const { error } = await supabase
      .from("league_teams")
      .insert({ league_id: LEAGUE.id, team_id: team.id })
    if (error) {
      if (error.code === "23505") {
        console.log(`  Team already in league, skipping: ${team.name}`)
      } else {
        console.error(`  Error adding team ${team.name} to league:`, error)
      }
    } else {
      console.log(`  Added ${team.name} to ${LEAGUE.name}`)
    }
  }
}

async function main() {
  if (!SUPABASE_DOTA2_URL || !SUPABASE_DOTA2_SECRET_KEY) {
    console.error("Missing SUPABASE_DOTA2_URL or SUPABASE_DOTA2_SECRET_KEY env vars")
    process.exit(1)
  }

  await addTeams()
  await addLeague()
  await addTeamsToLeague()

  console.log("Done.")
}

main().catch(err => {
  console.error("Fatal error:", err)
  process.exit(1)
})
