/**
 * The `league_teams.division` values, weakest bracket first.
 *
 * A closed vocabulary rather than free text because the order is load-bearing
 * and unrecoverable from the strings: sorting skill tiers alphabetically gives
 * "Challenger, Conqueror, Voyager, Warrior", which reads as a ranking and isn't
 * one. Shared because three callers need it: the division dropdown, the team
 * dropdown's grouping, and the add-team route's validation.
 *
 * No DB CHECK constraint backs this, matching `roster_member.role` — AD2L can
 * rename or add a bracket between seasons, and that should cost an edit here,
 * not a migration.
 */
export const DIVISIONS = ["Voyager", "Challenger", "Warrior", "Conqueror"] as const

export type Division = (typeof DIVISIONS)[number]

/** The label for teams in a divisioned league that have no division recorded. */
export const UNASSIGNED_DIVISION = "Unassigned"

export function isDivision(value: unknown): value is Division {
  return typeof value === "string" && (DIVISIONS as readonly string[]).includes(value)
}

/**
 * Divisions present in a league, in vocabulary order.
 *
 * An empty result is what "this league has no divisions" means — the dropdown
 * and the "Division Aggregate" label are both gated on it. Unrecognised values
 * are dropped rather than appended: a typo shouldn't invent a bracket, and the
 * team it belongs to still reaches the picker under "Unassigned".
 */
export function divisionsIn(values: readonly (string | null)[]): Division[] {
  const present = new Set(values.filter(isDivision))
  return DIVISIONS.filter(division => present.has(division))
}
