/**
 * Matches played inside a division: both teams registered in it.
 *
 * A division's meta is a statement about games played within it, so a game is
 * only a sample of one if both sides belong to it. AD2L divisions don't play
 * each other, so this should never drop a real league game — it's here to stop a
 * stray division-less or cross-division team from averaging two skill tiers into
 * one contest rate, which is the whole reason for scoping the aggregate.
 *
 * Excluded matches are untouched everywhere else: `api/matches`,
 * `api/match-wards` and `api/roster` are keyed on a team and are not
 * division-filtered, so a team's own tabs still show every game they played.
 *
 * Lives here rather than beside its one caller because Vercel turns every file
 * under `api/` into a function, tests included — see commit 3b9aed7.
 */
export function matchesWithinDivision<
  T extends { radiant_team_id: number | null; dire_team_id: number | null },
>(matches: T[], divisionTeamIds: Set<number>): T[] {
  return matches.filter(
    match =>
      match.radiant_team_id !== null &&
      divisionTeamIds.has(match.radiant_team_id) &&
      match.dire_team_id !== null &&
      divisionTeamIds.has(match.dire_team_id),
  )
}
