import { createClient } from "@supabase/supabase-js"
import { createClerkClient } from "@clerk/backend"
import { isDivision } from "../shared/divisions"

// Before the constants below read it. Following scripts/dev-login.ts rather
// than the older scripts, which expect the environment to be exported already —
// this one needs both the Supabase keys and the Clerk key, and the failure when
// it can't find them is a locked-out account rather than an obvious error.
try {
  process.loadEnvFile(".env.local")
} catch {
  // Already-exported env is fine too.
}

const SUPABASE_DOTA2_URL = process.env.SUPABASE_DOTA2_URL ?? ""
const SUPABASE_DOTA2_SECRET_KEY = process.env.SUPABASE_DOTA2_SECRET_KEY ?? ""
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? ""

const supabase = createClient(SUPABASE_DOTA2_URL, SUPABASE_DOTA2_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/**
 * Give someone access, by email.
 *
 * Grants are keyed on a Clerk user id, which lives in the Clerk dashboard while
 * everything it refers to lives in Supabase — so provisioning always spans two
 * systems, and the obvious version of this job is copying an opaque
 * `user_2abc...` between two browser tabs. That is worth avoiding here in
 * particular: access is closed by default, so a grant filed against a
 * mistyped id is not an error anywhere, it is an account that silently sees
 * nothing. `@clerk/backend` is already a dependency for token verification, so
 * the lookup is free.
 *
 *   npm run grant -- --email captain@example.com --league 19555 --division Warrior
 *   npm run grant -- --email scsper@gmail.com --admin
 *   npm run grant -- --email captain@example.com --revoke
 *   npm run grant -- --list
 */
type Args = {
  email?: string
  league?: number
  division?: string
  admin: boolean
  revoke: boolean
  list: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { admin: false, revoke: false, list: false }

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    // `.at` rather than `[i + 1]`, which types as `string` and would make the
    // missing-value check below look like dead code. A flag passed last really
    // does have nothing after it.
    const value = argv.at(i + 1)
    switch (flag) {
      case "--email":
        args.email = value
        i++
        break
      case "--league":
        // Saying so here beats letting a NaN through to become "this grant
        // shows them nothing", which is the failure this whole script exists to
        // make hard to reach.
        if (value === undefined) throw new Error("--league needs a league id")
        args.league = parseInt(value, 10)
        i++
        break
      case "--division":
        args.division = value
        i++
        break
      case "--admin":
        args.admin = true
        break
      case "--revoke":
        args.revoke = true
        break
      case "--list":
        args.list = true
        break
      default:
        throw new Error(`Unknown argument: ${flag}`)
    }
  }

  return args
}

async function findClerkUser(email: string) {
  if (!CLERK_SECRET_KEY) throw new Error("Missing CLERK_SECRET_KEY")

  const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY })
  const { data } = await clerk.users.getUserList({ emailAddress: [email] })

  if (data.length === 0) {
    throw new Error(
      `No Clerk user with the email ${email}. They have to sign up first — sign-up is restricted in the Clerk dashboard, so you may need to invite them.`,
    )
  }
  // Clerk matches on any of a user's addresses, so two accounts can come back
  // if one of them added the other's as a secondary. Guessing which is meant
  // would file the grant against the wrong person, silently.
  if (data.length > 1) {
    throw new Error(
      `${String(data.length)} Clerk users match ${email}: ${data.map(user => user.id).join(", ")}. Pass the id you want by editing this script.`,
    )
  }

  return data[0]
}

async function list() {
  const [users, grants] = await Promise.all([
    supabase.from("app_user").select("clerk_user_id, is_admin, email"),
    supabase
      .from("user_league_access")
      .select("clerk_user_id, league_id, division"),
  ])

  if (users.error) throw users.error
  if (grants.error) throw grants.error

  const rows = users.data as {
    clerk_user_id: string
    is_admin: boolean
    email: string | null
  }[]
  const access = grants.data as {
    clerk_user_id: string
    league_id: number
    division: string
  }[]

  if (rows.length === 0) {
    console.log(
      "No users provisioned. Everyone is locked out, including you — run with --admin.",
    )
    return
  }

  for (const user of rows) {
    const mine = access.filter(row => row.clerk_user_id === user.clerk_user_id)
    const scope = user.is_admin
      ? "admin (everything)"
      : mine.length === 0
        ? "nothing"
        : mine.map(row => `${String(row.league_id)}/${row.division}`).join(", ")
    console.log(`${user.email ?? user.clerk_user_id}: ${scope}`)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.list) {
    await list()
    return
  }

  if (!args.email) {
    throw new Error("--email is required (or --list)")
  }

  const user = await findClerkUser(args.email)
  const email = user.emailAddresses[0]?.emailAddress ?? args.email

  if (args.revoke) {
    // Delete the app_user row and let the cascade take the grants, so a revoked
    // account goes back to the state a brand-new one is in rather than to a
    // half-provisioned one with an admin flag and no grants.
    const { error } = await supabase
      .from("app_user")
      .delete()
      .eq("clerk_user_id", user.id)
    if (error) throw error
    console.log(`Revoked all access for ${email} (${user.id}).`)
    return
  }

  const upsert = await supabase.from("app_user").upsert(
    {
      clerk_user_id: user.id,
      email,
      // Only ever raises the flag. Dropping someone from admin to scoped is
      // rare enough, and destructive enough, to be worth doing deliberately in
      // SQL rather than as a side effect of granting them a division.
      ...(args.admin ? { is_admin: true } : {}),
    },
    { onConflict: "clerk_user_id" },
  )
  if (upsert.error) throw upsert.error

  if (args.admin) {
    console.log(`${email} (${user.id}) is now an admin.`)
    return
  }

  if (args.league === undefined || Number.isNaN(args.league)) {
    throw new Error("--league is required unless you pass --admin or --revoke")
  }
  // Rejected here rather than by a CHECK constraint, for the same reason
  // league_teams.division has none: the vocabulary is a code-level fact that
  // AD2L can change between seasons. But an unrecognised name would match no
  // team and therefore grant nothing, which is indistinguishable from the
  // feature being broken — so it is worth catching on the way in.
  if (!isDivision(args.division)) {
    throw new Error(
      `--division must be one of the names in shared/divisions.ts (got ${String(args.division)})`,
    )
  }

  const grant = await supabase.from("user_league_access").upsert(
    {
      clerk_user_id: user.id,
      league_id: args.league,
      division: args.division,
    },
    { onConflict: "clerk_user_id,league_id,division" },
  )
  if (grant.error) throw grant.error

  console.log(
    `${email} can now see ${args.division} in league ${String(args.league)}.`,
  )

  // The check nobody thinks to run until the captain says the app is empty.
  const teams = await supabase
    .from("league_teams")
    .select("team_id")
    .eq("league_id", args.league)
    .eq("division", args.division)

  if (!teams.error && (teams.data as unknown[]).length === 0) {
    console.warn(
      `\nWarning: no team in league ${String(args.league)} is recorded as ${args.division}, so this grant currently shows them nothing. Seed divisions with scripts/add-teams-to-league.ts.`,
    )
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
