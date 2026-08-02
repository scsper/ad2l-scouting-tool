import { createClient } from "@supabase/supabase-js"
import type { MatchRow, MatchPlayerRow, MatchDraftRow } from "../types/db.js"

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Sharkhorse vs FOR GLORT!, AD2L Season 47 week 3, 2026-05-21.
//
// OpenDota never ingested either match (`/api/matches/<id>` returns 404), so
// `parseMatch` cannot reach them and the series is the one hole in Sharkhorse's
// S47 record. Everything below is transcribed from the post-game screenshots in
// .context/attachments — see the header comments on each section for what is
// observed and what is inferred.

const LEAGUE_ID = 19554 // AD2L Season 47
const FOR_GLORT = 5079697 // "FOR GLORTTT" — the team id the rest of S47 uses
const SHARKHORSE = 9403219

/** Steam account ids, taken from `match_player` rows of the teams' other S47 games. */
const P = {
  dopeLemon: 136148096,
  billButtlicker: 131414643,
  jishba: 100804703,
  jord: 80623424,
  jajoby: 100729880,
  alca: 29594581,
  scsper: 29084710,
  aeroman: 123653819,
  maroso: 234756575,
  fishc: 77781531,
} as const

type PlayerLine = {
  playerId: number
  playerName: string
  teamId: number
  heroId: number
  position: string
  kills: number
  deaths: number
  assists: number
  lastHits: number
  denies: number
  gpm: number
  xpm: number
  heroDamage: number
  towerDamage: number
}

type DraftSide = {
  teamId: number
  /** Bans top-to-bottom off the draft screen's side column, i.e. ban order. */
  bans: number[]
  /** Picks left-to-right off the draft screen, i.e. that team's pick order. */
  picks: number[]
}

type GameInput = {
  matchId: number
  startDateTime: number
  endDateTime: number
  /** Team that banned and picked first — "A" in the Captains Mode order below. */
  firstPickTeamId: number
  radiantTeamId: number
  direTeamId: number
  winningTeamId: number
  players: PlayerLine[]
  draft: [DraftSide, DraftSide]
}

// Captains Mode slot order as it appears in every other parsed match in the DB
// (verified identical across 9 of them). "A" is the team that bans and picks
// first; "B" is the team that picks last.
const CM_ORDER: { isPick: boolean; isFirstPickTeam: boolean }[] = [
  { isPick: false, isFirstPickTeam: true }, //  0
  { isPick: false, isFirstPickTeam: true }, //  1
  { isPick: false, isFirstPickTeam: false }, //  2
  { isPick: false, isFirstPickTeam: false }, //  3
  { isPick: false, isFirstPickTeam: true }, //  4
  { isPick: false, isFirstPickTeam: false }, //  5
  { isPick: false, isFirstPickTeam: false }, //  6
  { isPick: true, isFirstPickTeam: true }, //  7
  { isPick: true, isFirstPickTeam: false }, //  8
  { isPick: false, isFirstPickTeam: true }, //  9
  { isPick: false, isFirstPickTeam: true }, // 10
  { isPick: false, isFirstPickTeam: false }, // 11
  { isPick: true, isFirstPickTeam: false }, // 12
  { isPick: true, isFirstPickTeam: true }, // 13
  { isPick: true, isFirstPickTeam: true }, // 14
  { isPick: true, isFirstPickTeam: false }, // 15
  { isPick: true, isFirstPickTeam: false }, // 16
  { isPick: true, isFirstPickTeam: true }, // 17
  { isPick: false, isFirstPickTeam: true }, // 18
  { isPick: false, isFirstPickTeam: false }, // 19
  { isPick: false, isFirstPickTeam: true }, // 20
  { isPick: false, isFirstPickTeam: false }, // 21
  { isPick: true, isFirstPickTeam: true }, // 22
  { isPick: true, isFirstPickTeam: false }, // 23
]

// Game 1 — match 8820291089, 2026-05-21 8:06 PM CDT, 25:33, Sharkhorse 41-10.
const GAME_1: GameInput = {
  matchId: 8820291089,
  startDateTime: 1779411960,
  endDateTime: 1779413493,
  firstPickTeamId: FOR_GLORT,
  radiantTeamId: FOR_GLORT,
  direTeamId: SHARKHORSE,
  winningTeamId: SHARKHORSE,
  players: [
    // FOR GLORT!
    {
      playerId: P.jishba,
      playerName: "Jishba",
      teamId: FOR_GLORT,
      heroId: 67,
      position: "POSITION_1",
      kills: 1,
      deaths: 6,
      assists: 7,
      lastHits: 162,
      denies: 16,
      gpm: 401,
      xpm: 483,
      heroDamage: 15425,
      towerDamage: 82,
    },
    {
      playerId: P.jajoby,
      playerName: "Jajoby",
      teamId: FOR_GLORT,
      heroId: 36,
      position: "POSITION_2",
      kills: 6,
      deaths: 7,
      assists: 4,
      lastHits: 115,
      denies: 18,
      gpm: 417,
      xpm: 517,
      heroDamage: 22995,
      towerDamage: 0,
    },
    {
      playerId: P.billButtlicker,
      playerName: "Bill buttlicker",
      teamId: FOR_GLORT,
      heroId: 16,
      position: "POSITION_3",
      kills: 0,
      deaths: 9,
      assists: 2,
      lastHits: 108,
      denies: 3,
      gpm: 295,
      xpm: 375,
      heroDamage: 13786,
      towerDamage: 0,
    },
    {
      playerId: P.jord,
      playerName: "Jord",
      teamId: FOR_GLORT,
      heroId: 20,
      position: "POSITION_4",
      kills: 2,
      deaths: 8,
      assists: 5,
      lastHits: 11,
      denies: 1,
      gpm: 197,
      xpm: 249,
      heroDamage: 5897,
      towerDamage: 50,
    },
    {
      playerId: P.dopeLemon,
      playerName: "Dope Lemon",
      teamId: FOR_GLORT,
      heroId: 27,
      position: "POSITION_5",
      kills: 1,
      deaths: 12,
      assists: 6,
      lastHits: 25,
      denies: 2,
      gpm: 206,
      xpm: 244,
      heroDamage: 5613,
      towerDamage: 140,
    },
    // Sharkhorse
    {
      playerId: P.scsper,
      playerName: "scsper",
      teamId: SHARKHORSE,
      heroId: 54,
      position: "POSITION_1",
      kills: 11,
      deaths: 0,
      assists: 10,
      lastHits: 239,
      denies: 24,
      gpm: 633,
      xpm: 784,
      heroDamage: 16996,
      towerDamage: 2333,
    },
    {
      playerId: P.maroso,
      playerName: "Maroso",
      teamId: SHARKHORSE,
      heroId: 135,
      position: "POSITION_2",
      kills: 12,
      deaths: 1,
      assists: 15,
      lastHits: 137,
      denies: 3,
      gpm: 539,
      xpm: 654,
      heroDamage: 23436,
      towerDamage: 711,
    },
    {
      playerId: P.fishc,
      playerName: "FishC",
      teamId: SHARKHORSE,
      heroId: 96,
      position: "POSITION_3",
      kills: 5,
      deaths: 3,
      assists: 16,
      lastHits: 101,
      denies: 8,
      gpm: 412,
      xpm: 541,
      heroDamage: 9146,
      towerDamage: 517,
    },
    {
      playerId: P.aeroman,
      playerName: "the aeroman",
      teamId: SHARKHORSE,
      heroId: 107,
      position: "POSITION_4",
      kills: 7,
      deaths: 2,
      assists: 25,
      lastHits: 41,
      denies: 8,
      gpm: 351,
      xpm: 563,
      heroDamage: 18481,
      towerDamage: 265,
    },
    {
      playerId: P.alca,
      playerName: "Alca",
      teamId: SHARKHORSE,
      heroId: 26,
      position: "POSITION_5",
      kills: 6,
      deaths: 4,
      assists: 13,
      lastHits: 23,
      denies: 5,
      gpm: 278,
      xpm: 427,
      heroDamage: 8348,
      towerDamage: 619,
    },
  ],
  draft: [
    {
      teamId: FOR_GLORT,
      bans: [123, 25, 105, 87, 12, 47, 22], // Hoodwink, Lina, Techies, Disruptor, Phantom Lancer, Viper, Zeus
      picks: [27, 20, 16, 67, 36], // Shadow Shaman, Vengeful Spirit, Sand King, Spectre, Necrophos
    },
    {
      teamId: SHARKHORSE,
      bans: [39, 35, 70, 6, 75, 21, 76], // Queen of Pain, Sniper, Ursa, Drow Ranger, Silencer, Windranger, Outworld Destroyer
      picks: [26, 135, 54, 107, 96], // Lion, Dawnbreaker, Lifestealer, Earth Spirit, Centaur Warrunner
    },
  ],
}

// Game 2 — match 8820316468, 2026-05-21 8:57 PM CDT, 25:46, Sharkhorse 43-7.
const GAME_2: GameInput = {
  matchId: 8820316468,
  startDateTime: 1779415020,
  endDateTime: 1779416566,
  firstPickTeamId: FOR_GLORT,
  radiantTeamId: FOR_GLORT,
  direTeamId: SHARKHORSE,
  winningTeamId: SHARKHORSE,
  players: [
    // FOR GLORT!
    {
      playerId: P.jishba,
      playerName: "Jishba",
      teamId: FOR_GLORT,
      heroId: 69,
      position: "POSITION_1",
      kills: 0,
      deaths: 5,
      assists: 1,
      lastHits: 195,
      denies: 5,
      gpm: 509,
      xpm: 455,
      heroDamage: 4799,
      towerDamage: 0,
    },
    {
      playerId: P.jajoby,
      playerName: "Jajoby",
      teamId: FOR_GLORT,
      heroId: 110,
      position: "POSITION_2",
      kills: 3,
      deaths: 6,
      assists: 4,
      lastHits: 102,
      denies: 6,
      gpm: 354,
      xpm: 473,
      heroDamage: 15707,
      towerDamage: 126,
    },
    {
      playerId: P.billButtlicker,
      playerName: "Bill buttlicker",
      teamId: FOR_GLORT,
      heroId: 14,
      position: "POSITION_3",
      kills: 2,
      deaths: 11,
      assists: 4,
      lastHits: 38,
      denies: 1,
      gpm: 251,
      xpm: 278,
      heroDamage: 6575,
      towerDamage: 0,
    },
    {
      playerId: P.jord,
      playerName: "Jord",
      teamId: FOR_GLORT,
      heroId: 87,
      position: "POSITION_4",
      kills: 1,
      deaths: 8,
      assists: 6,
      lastHits: 17,
      denies: 1,
      gpm: 180,
      xpm: 247,
      heroDamage: 5236,
      towerDamage: 18,
    },
    {
      playerId: P.dopeLemon,
      playerName: "Dope Lemon",
      teamId: FOR_GLORT,
      heroId: 64,
      position: "POSITION_5",
      kills: 1,
      deaths: 13,
      assists: 1,
      lastHits: 55,
      denies: 0,
      gpm: 228,
      xpm: 297,
      heroDamage: 4628,
      towerDamage: 1167,
    },
    // Sharkhorse
    {
      playerId: P.scsper,
      playerName: "scsper",
      teamId: SHARKHORSE,
      heroId: 48,
      position: "POSITION_1",
      kills: 8,
      deaths: 1,
      assists: 10,
      lastHits: 313,
      denies: 12,
      gpm: 716,
      xpm: 883,
      heroDamage: 8327,
      towerDamage: 3973,
    },
    {
      playerId: P.maroso,
      playerName: "Maroso",
      teamId: SHARKHORSE,
      heroId: 74,
      position: "POSITION_2",
      kills: 9,
      deaths: 3,
      assists: 17,
      lastHits: 132,
      denies: 16,
      gpm: 482,
      xpm: 594,
      heroDamage: 14545,
      towerDamage: 2350,
    },
    {
      playerId: P.fishc,
      playerName: "FishC",
      teamId: SHARKHORSE,
      heroId: 60,
      position: "POSITION_3",
      kills: 14,
      deaths: 0,
      assists: 12,
      lastHits: 164,
      denies: 6,
      gpm: 585,
      xpm: 730,
      heroDamage: 16933,
      towerDamage: 2032,
    },
    {
      playerId: P.aeroman,
      playerName: "the aeroman",
      teamId: SHARKHORSE,
      heroId: 103,
      position: "POSITION_4",
      kills: 8,
      deaths: 0,
      assists: 23,
      lastHits: 21,
      denies: 2,
      gpm: 372,
      xpm: 535,
      heroDamage: 11076,
      towerDamage: 742,
    },
    {
      playerId: P.alca,
      playerName: "Alca",
      teamId: SHARKHORSE,
      heroId: 30,
      position: "POSITION_5",
      kills: 4,
      deaths: 3,
      assists: 22,
      lastHits: 35,
      denies: 5,
      gpm: 331,
      xpm: 519,
      heroDamage: 10398,
      towerDamage: 95,
    },
  ],
  draft: [
    {
      teamId: FOR_GLORT,
      bans: [105, 25, 123, 54, 12, 22, 59], // Techies, Lina, Hoodwink, Lifestealer, Phantom Lancer, Zeus, Huskar
      picks: [87, 14, 64, 69, 110], // Disruptor, Pudge, Jakiro, Doom, Phoenix
    },
    {
      teamId: SHARKHORSE,
      bans: [39, 35, 70, 6, 21, 41, 106], // Queen of Pain, Sniper, Ursa, Drow Ranger, Windranger, Faceless Void, Ember Spirit
      picks: [30, 103, 60, 48, 74], // Witch Doctor, Elder Titan, Night Stalker, Luna, Invoker
    },
  ],
}

function buildMatchRow(game: GameInput): MatchRow {
  return {
    id: game.matchId,
    league_id: LEAGUE_ID,
    winning_team_id: game.winningTeamId,
    radiant_team_id: game.radiantTeamId,
    dire_team_id: game.direTeamId,
    start_date_time: game.startDateTime,
    end_date_time: game.endDateTime,
  }
}

function buildMatchPlayerRows(game: GameInput): MatchPlayerRow[] {
  return game.players.map(player => ({
    player_id: player.playerId,
    match_id: game.matchId,
    team_id: player.teamId,
    player_name: player.playerName,
    hero_id: player.heroId,
    position: player.position,
    // The screenshots carry no timeline, so lane, lane outcome, and the at-10
    // splits stay null rather than being guessed — the lane tab reads them.
    lane: null,
    lane_outcome: null,
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    last_hits: player.lastHits,
    denies: player.denies,
    gpm: player.gpm,
    xpm: player.xpm,
    hero_damage: player.heroDamage,
    tower_damage: player.towerDamage,
    // Post-game screenshots don't show ward counts, so these are null — meaning
    // "unknown", not "placed none". Ward averages skip nulls, so leaving them
    // null keeps these two games out of the ward numbers instead of zeroing
    // them. Written explicitly so it reads as a decision, not an omission.
    obs_placed: null,
    sen_placed: null,
    gold_at_10: null,
    xp_at_10: null,
    lh_at_10: null,
    denies_at_10: null,
  }))
}

function buildMatchDraftRows(game: GameInput): MatchDraftRow[] {
  const queues = new Map<string, number[]>()
  for (const side of game.draft) {
    const isFirstPickTeam = side.teamId === game.firstPickTeamId
    queues.set(`ban:${String(isFirstPickTeam)}`, [...side.bans])
    queues.set(`pick:${String(isFirstPickTeam)}`, [...side.picks])
  }

  return CM_ORDER.map((slot, order) => {
    const queue = queues.get(
      `${slot.isPick ? "pick" : "ban"}:${String(slot.isFirstPickTeam)}`,
    )
    const heroId = queue?.shift()
    if (heroId === undefined) {
      throw new Error(
        `Ran out of heroes for slot ${String(order)} of match ${String(game.matchId)}`,
      )
    }
    const side = game.draft.find(
      s => (s.teamId === game.firstPickTeamId) === slot.isFirstPickTeam,
    )
    if (!side) throw new Error("Draft side missing")
    return {
      match_id: game.matchId,
      order,
      hero_id: heroId,
      team_id: side.teamId,
      is_pick: slot.isPick,
    }
  })
}

async function insertGame(game: GameInput, commit: boolean) {
  const matchRow = buildMatchRow(game)
  const playerRows = buildMatchPlayerRows(game)
  const draftRows = buildMatchDraftRows(game)

  console.log(`\n=== match ${String(game.matchId)} ===`)
  console.log(JSON.stringify(matchRow))
  playerRows.forEach(row => {
    console.log(
      `  ${row.position ?? "?"} ${row.player_name ?? "?"} hero=${String(row.hero_id)} ${String(row.kills)}/${String(row.deaths)}/${String(row.assists)} ${String(row.gpm)}gpm`,
    )
  })
  console.log(
    `  draft: ${draftRows.map(row => `${String(row.order)}${row.is_pick ? "P" : "b"}${String(row.hero_id)}`).join(" ")}`,
  )

  const { data: existing } = await supabase
    .from("match")
    .select("id")
    .eq("id", game.matchId)
  if (existing && existing.length > 0) {
    console.log(`  SKIP: match ${String(game.matchId)} is already in the DB.`)
    return
  }

  if (!commit) {
    console.log("  dry run — pass --commit to insert")
    return
  }

  const { error: matchError } = await supabase.from("match").insert(matchRow)
  if (matchError) throw matchError
  const { error: playerError } = await supabase
    .from("match_player")
    .insert(playerRows)
  if (playerError) throw playerError
  const { error: draftError } = await supabase
    .from("match_draft")
    .insert(draftRows)
  if (draftError) throw draftError
  console.log(
    `  inserted match, ${String(playerRows.length)} players, ${String(draftRows.length)} picks/bans`,
  )
}

async function main() {
  if (!SUPABASE_DOTA2_URL || !SUPABASE_DOTA2_SECRET_KEY) {
    console.error(
      "Missing SUPABASE_DOTA2_URL or SUPABASE_DOTA2_SECRET_KEY env vars",
    )
    process.exit(1)
  }

  const commit = process.argv.includes("--commit")
  for (const game of [GAME_1, GAME_2]) {
    await insertGame(game, commit)
  }
  console.log(commit ? "\nDone." : "\nDry run complete.")
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
