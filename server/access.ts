import { createClient } from "@supabase/supabase-js"
import { UnauthorizedError, requireAuth } from "./require-auth.js"
import {
  canReadAggregate,
  canReadDivision,
  canReadLeague,
} from "./access-scope.js"
import type { AccessScope, Grant } from "./access-scope.js"

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/**
 * The caller is who they say they are, and may not have this.
 *
 * Separate from `UnauthorizedError` because they mean different things to the
 * client: a 401 means "sign in again", which the UI can act on, and a 403 means
 * "this is not yours", which it cannot.
 */
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ForbiddenError"
  }
}

/**
 * Verify the session and load what the caller may see.
 *
 * One extra round trip per request, on routes that already make two or three.
 * The alternative — putting grants in the Clerk session token — would make this
 * free, at the cost of a source of truth that cannot be joined against the
 * `league_teams` rows it describes, and that keeps working for up to a minute
 * after a grant is revoked.
 *
 * A user with no `app_user` row resolves to a scope with no access rather than
 * an error. That is the state of an account between sign-up and provisioning,
 * and it is not a failure — `api/me` reports it so the client can say so.
 */
export async function requireScope(
  authorizationHeader: string | string[] | undefined,
): Promise<AccessScope> {
  const header = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]
    : authorizationHeader

  const clerkUserId = await requireAuth(header)

  const [user, access] = await Promise.all([
    supabase
      .from("app_user")
      .select("is_admin")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle(),
    supabase
      .from("user_league_access")
      .select("league_id, division")
      .eq("clerk_user_id", clerkUserId),
  ])

  if (user.error) {
    console.error("Error loading app_user:", user.error)
    throw user.error
  }
  if (access.error) {
    console.error("Error loading user_league_access:", access.error)
    throw access.error
  }

  const grants: Grant[] = (
    access.data as { league_id: number; division: string }[]
  ).map(row => ({ leagueId: row.league_id, division: row.division }))

  return {
    isAdmin: (user.data as { is_admin: boolean } | null)?.is_admin ?? false,
    grants,
  }
}

/** Callers that write must be admins — see `api/team` and the grant script. */
export function requireAdmin(scope: AccessScope, what: string): void {
  if (!scope.isAdmin) {
    throw new ForbiddenError(`Only an administrator can ${what}.`)
  }
}

export function requireLeagueAccess(
  scope: AccessScope,
  leagueId: number,
): void {
  if (!canReadLeague(scope, leagueId)) {
    throw new ForbiddenError("This league is not in your division.")
  }
}

export function requireAggregateAccess(
  scope: AccessScope,
  leagueId: number,
  division: string | undefined,
): void {
  if (!canReadAggregate(scope, leagueId, division)) {
    throw new ForbiddenError(
      division === undefined
        ? "Pick a division — league-wide stats are not in your scope."
        : "That division is not yours.",
    )
  }
}

/**
 * Whether a team's own tabs are readable: matches, wards, movement, objectives,
 * roster.
 *
 * The division comes from `league_teams`, which is the only place it lives. A
 * team with no row in this league is admin-only: parsing deliberately does not
 * create `league_teams` rows (see `getLeagueMembershipWarnings`), so an
 * unregistered team's matches are exactly the ones nobody has vouched for.
 */
export async function requireTeamAccess(
  scope: AccessScope,
  leagueId: number,
  teamId: number,
): Promise<void> {
  if (scope.isAdmin) return

  const result = await supabase
    .from("league_teams")
    .select("division")
    .eq("league_id", leagueId)
    .eq("team_id", teamId)
    .maybeSingle()

  if (result.error) {
    console.error("Error resolving team division:", result.error)
    throw result.error
  }

  const division =
    (result.data as { division: string | null } | null)?.division ?? null

  if (!canReadDivision(scope, leagueId, division)) {
    throw new ForbiddenError("That team is not in your division.")
  }
}

/**
 * Whether a single match may be read by id, for `api/match-positions`, which
 * takes a bare `matchId` with no league or team context.
 *
 * One team in a granted division is enough, not both. `api/matches` already
 * returns every game your own team played, including those against teams you
 * cannot otherwise see, so requiring both would refuse a match the caller can
 * already list. That is a looser rule than `matchesWithinDivision` uses, and
 * deliberately so: that function is protecting an average from mixing skill
 * tiers, which is a different question from who may look.
 */
export async function requireMatchAccess(
  scope: AccessScope,
  matchId: number,
): Promise<void> {
  if (scope.isAdmin) return

  const result = await supabase
    .from("match")
    .select("league_id, radiant_team_id, dire_team_id")
    .eq("id", matchId)
    .maybeSingle()

  if (result.error) {
    console.error("Error resolving match for access:", result.error)
    throw result.error
  }

  const match = result.data as {
    league_id: number | null
    radiant_team_id: number | null
    dire_team_id: number | null
  } | null

  // A match we do not have is not a permission problem, and saying so would
  // turn every mistyped id into a confusing 403. The route's own 404/empty
  // handling takes it from here.
  if (!match) return

  const leagueId = match.league_id
  if (leagueId === null || !canReadLeague(scope, leagueId)) {
    throw new ForbiddenError("That match is not in your division.")
  }

  await requireSideAccess(scope, leagueId, [
    match.radiant_team_id,
    match.dire_team_id,
  ])
}

/**
 * Whether a match about to be written belongs to the caller.
 *
 * The parse path's version of the check above, taking the freshly fetched
 * OpenDota payload rather than a row we already have. Separate entry point
 * because at this moment there is nothing in the database to look the match up
 * by — that is the whole reason `parseMatch` grew an `authorize` hook.
 */
export async function requireParsedMatchAccess(
  scope: AccessScope,
  match: {
    leagueId: number | null
    radiantTeamId: number | null
    direTeamId: number | null
  },
): Promise<void> {
  if (scope.isAdmin) return

  const leagueId = match.leagueId
  if (leagueId === null || !canReadLeague(scope, leagueId)) {
    throw new ForbiddenError(
      "That match is not in a league you can parse into.",
    )
  }

  await requireSideAccess(scope, leagueId, [
    match.radiantTeamId,
    match.direTeamId,
  ])
}

/**
 * At least one side of the match must be a team the caller can see.
 *
 * One side, not both: `api/matches` already lists every game your own team
 * played, opponents from other divisions included, so demanding both would
 * refuse a match the caller can already see listed. This is a looser rule than
 * `matchesWithinDivision`, on purpose — that one is keeping two skill tiers out
 * of a single average, which is a different question from who may look.
 */
async function requireSideAccess(
  scope: AccessScope,
  leagueId: number,
  teamIds: (number | null)[],
): Promise<void> {
  const ids = teamIds.filter((id): id is number => id !== null)

  if (ids.length > 0) {
    const teams = await supabase
      .from("league_teams")
      .select("division")
      .eq("league_id", leagueId)
      .in("team_id", ids)

    if (teams.error) {
      console.error("Error resolving match teams:", teams.error)
      throw teams.error
    }

    const visible = (teams.data as { division: string | null }[]).some(team =>
      canReadDivision(scope, leagueId, team.division),
    )

    if (visible) return
  }

  throw new ForbiddenError("That match is not in your division.")
}

/**
 * Turn an auth or access failure into a response, and report whether it did.
 *
 * Every route already has a try/catch that ends in its own 500 message, so this
 * slots in as the first line of that catch rather than making nine routes grow
 * a second one. Anything else falls through and keeps the message it had.
 */
export function respondToAccessError(
  error: unknown,
  res: { status: (code: number) => { json: (data: unknown) => void } },
): boolean {
  if (error instanceof UnauthorizedError) {
    res.status(401).json({ error: error.message })
    return true
  }
  if (error instanceof ForbiddenError) {
    res.status(403).json({ error: error.message })
    return true
  }
  return false
}
