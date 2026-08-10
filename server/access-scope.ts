import { DIVISIONS } from "../shared/divisions.js"

/**
 * One slice a user may read: a division of a league.
 *
 * `division` is a plain string rather than a `Division` because it arrives from
 * the database, and the vocabulary in shared/divisions.ts is not backed by a
 * CHECK constraint. A grant naming a bracket that no longer exists matches no
 * team and therefore grants nothing, which is the correct outcome and needs no
 * special case.
 */
export type Grant = { leagueId: number; division: string }

/**
 * Everything an authorization decision needs, resolved once per request.
 *
 * `isAdmin` short-circuits every function here. It is not "a grant for all
 * leagues" — see the migration for why that distinction is in the schema rather
 * than encoded as a wildcard row.
 */
export type AccessScope = { isAdmin: boolean; grants: Grant[] }

/** Used by the tests and by any future server-side caller with no user. */
export const ADMIN_SCOPE: AccessScope = { isAdmin: true, grants: [] }

/**
 * A signed-in user who has been given nothing.
 *
 * The normal state of an account between sign-up and provisioning, and the
 * permanent state of a revoked one. Every read below returns false for it, so
 * the API answers with empty lists and 403s rather than anything half-visible;
 * `api/me` reports it so the client can say so in words instead of rendering
 * empty dropdowns that look like an outage.
 */
export function hasAnyAccess(scope: AccessScope): boolean {
  return scope.isAdmin || scope.grants.length > 0
}

/** Whether a league should appear at all — the league dropdown's filter. */
export function canReadLeague(scope: AccessScope, leagueId: number): boolean {
  return (
    scope.isAdmin || scope.grants.some(grant => grant.leagueId === leagueId)
  )
}

/**
 * Whether a specific division of a league is readable.
 *
 * `null` means the team carries no division, and a scoped user never sees those.
 * That is what closed-by-default means here — NULL is not a bracket anyone was
 * granted — but it has a failure mode worth knowing about: a Season 48 team
 * seeded without a division is invisible to the very people who need it, while
 * looking perfectly fine from an admin account, which sees it under
 * "Unassigned". The team dropdown labels that group accordingly.
 */
export function canReadDivision(
  scope: AccessScope,
  leagueId: number,
  division: string | null,
): boolean {
  if (scope.isAdmin) return true
  if (division === null) return false
  return scope.grants.some(
    grant => grant.leagueId === leagueId && grant.division === division,
  )
}

/**
 * The divisions of one league this scope covers, in vocabulary order.
 *
 * Admins get an empty array rather than every division, because "all of them"
 * is not a list this can know — a league's divisions are derived from its team
 * rows, which live in the database. Callers that need the real list already
 * have the teams in hand and should use `divisionsIn`. Only `api/me` uses this,
 * to tell the client what it may ask for.
 */
export function grantedDivisions(
  scope: AccessScope,
  leagueId: number,
): string[] {
  const granted = new Set(
    scope.grants
      .filter(grant => grant.leagueId === leagueId)
      .map(grant => grant.division),
  )
  // Vocabulary order, for the same reason divisionsIn uses it: these names sort
  // alphabetically into something that reads like a ranking and isn't one.
  const known = DIVISIONS.filter(division => granted.has(division))
  const unknown = [...granted].filter(
    division => !(DIVISIONS as readonly string[]).includes(division),
  )
  return [...known, ...unknown.sort()]
}

/** The league ids in this scope, for filtering `api/league`. */
export function visibleLeagueIds(scope: AccessScope): number[] {
  return [...new Set(scope.grants.map(grant => grant.leagueId))]
}

/**
 * The subset of a league's teams this scope may see.
 *
 * Generic over the row because two callers shape it differently: `api/team`
 * filters its joined `league_teams` rows before building the response, and the
 * division-scoped aggregates filter a plainer list.
 */
export function teamsVisibleTo<T extends { division: string | null }>(
  scope: AccessScope,
  leagueId: number,
  teams: readonly T[],
): T[] {
  if (scope.isAdmin) return [...teams]
  return teams.filter(team => canReadDivision(scope, leagueId, team.division))
}

/**
 * Whether a caller may ask for a division-scoped aggregate.
 *
 * `api/league-matches` takes `division` from the client and always has — it was
 * a filter, and this turns it into a claim. `undefined` means "the whole
 * league", which only an admin can ask for: a scoped user requesting it would
 * otherwise get every division's matches averaged together, which is both the
 * leak and the statistical mistake `matchesWithinDivision` exists to prevent.
 */
export function canReadAggregate(
  scope: AccessScope,
  leagueId: number,
  division: string | undefined,
): boolean {
  if (scope.isAdmin) return true
  if (division === undefined) return false
  return canReadDivision(scope, leagueId, division)
}
