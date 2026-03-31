import { createClient } from "@supabase/supabase-js"

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** OpenDota league id for AD2L Season 46 (see src/app/store.ts). */
const LEAGUE_ID = 19137
const LEAGUE_NAME = "AD2L Season 46"

const TEAM = { id: 9181133, name: "Quasar Dreams" }

async function addTeam() {
  console.log("Adding team...")
  const { error } = await supabase.from("team").insert({ id: TEAM.id, name: TEAM.name })
  if (error) {
    if (error.code === "23505") {
      console.log(`  Team already exists, skipping: ${TEAM.name} (${TEAM.id})`)
    } else {
      console.error(`  Error inserting team ${TEAM.name}:`, error)
      throw error
    }
  } else {
    console.log(`  Added team: ${TEAM.name} (${TEAM.id})`)
  }
}

async function addTeamToLeague() {
  console.log(`Adding team to ${LEAGUE_NAME}...`)
  const { error } = await supabase
    .from("league_teams")
    .insert({ league_id: LEAGUE_ID, team_id: TEAM.id })
  if (error) {
    if (error.code === "23505") {
      console.log(`  Team already in league, skipping: ${TEAM.name}`)
    } else {
      console.error(`  Error adding team ${TEAM.name} to league:`, error)
      throw error
    }
  } else {
    console.log(`  Added ${TEAM.name} to ${LEAGUE_NAME}`)
  }
}

async function main() {
  if (!SUPABASE_DOTA2_URL || !SUPABASE_DOTA2_SECRET_KEY) {
    console.error("Missing SUPABASE_DOTA2_URL or SUPABASE_DOTA2_SECRET_KEY env vars")
    process.exit(1)
  }

  await addTeam()
  await addTeamToLeague()

  console.log("Done.")
}

main().catch(err => {
  console.error("Fatal error:", err)
  process.exit(1)
})
