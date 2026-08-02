import type { LeagueHeroDraftStats, LeagueHeroPickRecord } from "../../../api/league-matches"
import { POSITION_LABELS } from "../../utils/ward-aggregation"

/**
 * Hover text for the hero boards: the names behind a count.
 *
 * A league board is a claim about a metagame, and "Faceless Void, 24 picks, 63%"
 * is only useful once you know whether that is twelve teams agreeing or one
 * player's pocket pick. The counts are the same arithmetic either way, so the
 * breakdown goes in a `title` rather than on the row — it answers the question
 * you ask second, not the one the board already answers.
 *
 * Every line is shown. A hero can reach twenty distinct players in a season and
 * truncating the tail would quietly turn "who plays this" into "who plays this,
 * mostly", which is the failure the boards exist to avoid.
 */
export type HeroNameLookup = {
  playerNames: Record<string, string>
  teamNames: Record<string, string>
}

/**
 * Ids fall back to their number rather than to "Unknown". Ten of the teams that
 * appear in matches have never been registered, so an unnamed team is routine
 * here, and the id is the thing you'd search for to fix it.
 */
function playerLabel(playerId: number, names: HeroNameLookup): string {
  return names.playerNames[String(playerId)] ?? `Player ${String(playerId)}`
}

function teamLabel(teamId: number | null, names: HeroNameLookup): string {
  if (teamId === null) return "no team"
  return names.teamNames[String(teamId)] ?? `Team ${String(teamId)}`
}

function positionLabel(position: string | null): string {
  if (position === null) return "no position"
  return POSITION_LABELS[position] ?? position
}

function record(wins: number, losses: number): string {
  return `${String(wins)}-${String(losses)}`
}

/**
 * The percentage is on the summary line only. Per-player records run to three or
 * four games, where "1-1 (50%)" says nothing "1-1" doesn't and costs a third of
 * the line to say it.
 */
function recordWithPct(wins: number, losses: number): string {
  const games = wins + losses
  const pct = games > 0 ? Math.round((wins / games) * 100) : 0
  return `${record(wins, losses)} (${String(pct)}%)`
}

type PickLine = {
  playerId: number
  teamId: number | null
  positions: string[]
  wins: number
  losses: number
}

/**
 * One line per player per team, with their positions listed rather than split
 * across rows. The server keys records by position too — a pos 4 game and a pos 5
 * game on the same hero are different facts — but a tooltip that repeated a
 * player's name three times would read as three players.
 */
function groupByPlayer(records: LeagueHeroPickRecord[]): PickLine[] {
  const lines = new Map<string, PickLine>()

  for (const pick of records) {
    const key = `${String(pick.teamId)}|${String(pick.playerId)}`
    const line = lines.get(key) ?? {
      playerId: pick.playerId,
      teamId: pick.teamId,
      positions: [],
      wins: 0,
      losses: 0,
    }
    // Records arrive sorted by games, so the position a player uses the hero at
    // most often is named first.
    if (!line.positions.includes(pick.position ?? "")) line.positions.push(pick.position ?? "")
    line.wins += pick.wins
    line.losses += pick.losses
    lines.set(key, line)
  }

  return Array.from(lines.values()).sort((a, b) => b.wins + b.losses - (a.wins + a.losses))
}

function pickLines(records: LeagueHeroPickRecord[], names: HeroNameLookup, showPositions: boolean): string[] {
  return groupByPlayer(records).map(line => {
    const positions = line.positions.map(position => positionLabel(position || null)).join(", ")
    const suffix = showPositions ? ` · ${positions}` : ""
    return `  ${playerLabel(line.playerId, names)} (${teamLabel(line.teamId, names)}) ${record(line.wins, line.losses)}${suffix}`
  })
}

function pickSection(records: LeagueHeroPickRecord[], names: HeroNameLookup, showPositions: boolean): string[] {
  if (records.length === 0) return ["Picked by: nobody"]

  const wins = records.reduce((total, pick) => total + pick.wins, 0)
  const losses = records.reduce((total, pick) => total + pick.losses, 0)
  return [
    `Picked ${String(wins + losses)}×, ${recordWithPct(wins, losses)}`,
    ...pickLines(records, names, showPositions),
  ]
}

function banSection(stats: LeagueHeroDraftStats, names: HeroNameLookup): string[] {
  if (stats.bannedBy.length === 0) return ["Banned by: nobody"]

  return [
    `Banned ${String(stats.bans)}×`,
    ...stats.bannedBy.map(ban => `  ${teamLabel(ban.teamId, names)} ${String(ban.bans)}`),
  ]
}

/** Who played the hero, league-wide. */
export function pickedByTitle(
  heroName: string,
  stats: LeagueHeroDraftStats,
  names: HeroNameLookup,
): string {
  return [heroName, "", ...pickSection(stats.pickedBy, names, true)].join("\n")
}

/** Who played the hero at one position — the position cards' tooltip. */
export function pickedByPositionTitle(
  heroName: string,
  stats: LeagueHeroDraftStats,
  names: HeroNameLookup,
  position: string,
): string {
  const records = stats.pickedBy.filter(pick => pick.position === position)
  return [
    `${heroName} — ${positionLabel(position)}`,
    "",
    ...pickSection(records, names, false),
  ].join("\n")
}

/** Which teams banned the hero. */
export function bannedByTitle(
  heroName: string,
  stats: LeagueHeroDraftStats,
  names: HeroNameLookup,
): string {
  return [heroName, "", ...banSection(stats, names)].join("\n")
}

/** Both halves of the contest rate, since the row's number is their sum. */
export function contestedByTitle(
  heroName: string,
  stats: LeagueHeroDraftStats,
  names: HeroNameLookup,
): string {
  return [
    heroName,
    "",
    ...pickSection(stats.pickedBy, names, true),
    "",
    ...banSection(stats, names),
  ].join("\n")
}
