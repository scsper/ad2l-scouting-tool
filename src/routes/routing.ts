import { useOutletContext } from "react-router"

/** AD2L Season 47 — where `/` lands until a newer season becomes the default. */
export const DEFAULT_LEAGUE_ID = 19554

export type Tab = "team" | "players" | "pub-stats" | "lanes" | "wards"

export const TABS: { id: Tab; label: string }[] = [
  { id: "team", label: "Team" },
  { id: "players", label: "Players" },
  { id: "pub-stats", label: "Pub Stats" },
  { id: "lanes", label: "Lanes" },
  { id: "wards", label: "Wards" },
]

/**
 * `?division=` is threaded through links by hand rather than by copying the
 * whole query string, because it is the only param that outlives the screen
 * that set it. The ward filters are scoped to the wards tab and must not
 * follow you onto another team's lanes.
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
