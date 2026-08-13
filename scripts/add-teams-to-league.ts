import { createClient } from "@supabase/supabase-js"
import type { Division } from "../shared/divisions"

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const LEAGUE = { id: 19719, name: "The International 2026" }

// The division these teams play in, or null for a league that has none. A
// league's divisions are derived from the rows this writes, so a value here is
// what makes the division picker appear at all — and a name outside
// shared/divisions.ts would become a bracket of its own in it.
const DIVISION: Division | null = null

// The 16 attendees, cross-checked between OpenDota's /leagues/19719/teams and
// Dotabuff's league page — the two agree on the full field, so no invitee is
// missing merely for not having played yet.
//
// Names are as the sources spell them today. Three ids were stored under
// older ones — 8255888 as "BetBoom Team", 9572001 as "Parivision", and 726228
// under no name at all (it read "726228") — and were renamed by hand, because
// this script inserts and skips on conflict rather than renaming. That stays
// deliberate: `team.name` is global, so a rebrand between seasons rewrites how
// every earlier league reads, which is a decision to make once and not a side
// effect of registering the next tournament.
const TEAMS = [
  { id: 9467224, name: "Aurora Gaming" },
  { id: 8255888, name: "BoomBoys" },
  { id: 9964962, name: "GamerLegion" },
  { id: 10149530, name: "HULIGANI" },
  { id: 10150413, name: "Iron Wing" },
  { id: 10150538, name: "LGD Gaming" },
  { id: 10136357, name: "Nigma Galaxy" },
  { id: 2586976, name: "OG" },
  { id: 9247354, name: "Team Falcons" },
  { id: 2163, name: "Team Liquid" },
  { id: 5017210, name: "Team Resilience" },
  { id: 7119388, name: "Team Spirit" },
  { id: 9823272, name: "Team Yandex" },
  { id: 9572001, name: "TEAM VISION" },
  { id: 726228, name: "Vici Gaming" },
  { id: 8261500, name: "Xtreme Gaming" },
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
    .insert({ id: LEAGUE.id, name: LEAGUE.name })
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
      .insert({ league_id: LEAGUE.id, team_id: team.id, division: DIVISION })
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
