import { useOutletContext } from "react-router"

/** AD2L Season 48 — where `/` lands until a newer season becomes the default. */
export const DEFAULT_LEAGUE_ID = 20077

/** The division `/` lands in — the one Sharkhorse plays in this season. */
export const DEFAULT_DIVISION = "Challenger"

export type Tab =
  | "team"
  | "players"
  | "pub-stats"
  | "lanes"
  | "wards"
  | "movement"
  | "tempo"

export const TABS: { id: Tab; label: string }[] = [
  { id: "team", label: "Team" },
  { id: "players", label: "Players" },
  { id: "pub-stats", label: "Pub Stats" },
  { id: "lanes", label: "Lanes" },
  { id: "wards", label: "Wards" },
  { id: "movement", label: "Movement" },
  { id: "tempo", label: "Tempo" },
]

export type StatsTab = "heroes" | "players"

/**
 * The two questions a division can be asked: what it drafts, and who plays in
 * it. Routes rather than a query param, on the same reasoning that made the
 * team tabs routes — they are different datasets, not two views of one screen.
 */
export const STATS_TABS: { id: StatsTab; label: string }[] = [
  { id: "heroes", label: "Heroes" },
  { id: "players", label: "Players" },
]

/**
 * `?division=` is threaded through links by hand rather than by copying the
 * whole query string, because it is the only param that outlives the screen
 * that set it. The ward filters are scoped to the wards tab and must not
 * follow you onto another team's lanes, and the player board's position and
 * sort must not follow you onto the hero board.
 */
export function divisionSearch(division: string | undefined) {
  return division ? `?division=${encodeURIComponent(division)}` : ""
}

export type TeamScope = { leagueId: number; teamId: number }

/**
 * Handed down by `TeamLayout`. A tab route can take these as given: reaching
 * one means the route matched, and the route cannot match without both ids.
 */
export function useTeamScope() {
  return useOutletContext<TeamScope>()
}

export type StatsScope = {
  leagueId: number
  division: string | undefined
  hasDivisions: boolean
}

/**
 * Handed down by `StatsRoute`. `hasDivisions` rides along because both
 * boards refuse to query without a division once a league has them, and asking
 * again below would mean a second copy of the same derivation.
 */
export function useStatsScope() {
  return useOutletContext<StatsScope>()
}
