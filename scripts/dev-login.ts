/**
 * Mint a Clerk sign-in ticket so an agent (or a fresh browser profile) can get
 * into the local app without a password or an emailed code.
 *
 * The app is gated by Clerk, and `api/parse-match` and `api/team` verify the
 * session token server-side, so "just bypass the gate in dev" would still leave
 * those routes untestable. This instead walks the real sign-in path: the Clerk
 * Backend API issues a one-shot ticket for an existing user, and the browser
 * redeems it for a genuine session. Nothing about the app changes, and there is
 * no long-lived credential to leak — the ticket dies in 10 minutes or on first
 * use, whichever comes first.
 *
 * Dev instance only, by design. It refuses to run against `sk_live_` keys: a
 * ticket is a password-equivalent for whoever holds it, and minting one for a
 * real user on the production instance is not something a test script should be
 * able to do by accident.
 *
 * Usage:
 *   npx tsx scripts/dev-login.ts                      # default user, prints the JS to run
 *   npx tsx scripts/dev-login.ts someone@example.com  # a specific user
 *   npx tsx scripts/dev-login.ts --json               # { ticket, email } for scripting
 *
 * Env: CLERK_SECRET_KEY (read from .env.local automatically)
 */

const DEFAULT_EMAIL = "scsper@gmail.com"

/** Long enough to drive a browser to it, short enough to not be a credential. */
const TICKET_TTL_SECONDS = 600

try {
  process.loadEnvFile(".env.local")
} catch {
  // Already-exported env is fine too.
}

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? ""

if (!CLERK_SECRET_KEY) {
  throw new Error("Missing CLERK_SECRET_KEY (expected in .env.local)")
}

if (!CLERK_SECRET_KEY.startsWith("sk_test_")) {
  throw new Error(
    "Refusing to mint a sign-in ticket with a non-development key. " +
      "This script is for the local dev instance only.",
  )
}

async function clerk(path: string): Promise<unknown> {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
  })

  if (!response.ok) {
    throw new Error(
      `Clerk GET ${path} failed: ${String(response.status)} ${await response.text()}`,
    )
  }

  return response.json()
}

async function findUserId(email: string): Promise<string> {
  const users = (await clerk(
    `/users?email_address=${encodeURIComponent(email)}`,
  )) as { id: string }[]

  if (users.length === 0) {
    throw new Error(
      `No Clerk user with email ${email}. Sign-up is restricted, so the user ` +
        `has to be invited from the Clerk dashboard first.`,
    )
  }

  return users[0].id
}

async function mintTicket(userId: string): Promise<string> {
  const response = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: userId,
      expires_in_seconds: TICKET_TTL_SECONDS,
    }),
  })

  if (!response.ok) {
    throw new Error(
      `Clerk POST /sign_in_tokens failed: ${String(response.status)} ${await response.text()}`,
    )
  }

  const { token } = (await response.json()) as { token: string }

  return token
}

const args = process.argv.slice(2)
const asJson = args.includes("--json")
const email = args.find(arg => !arg.startsWith("--")) ?? DEFAULT_EMAIL

const ticket = await mintTicket(await findUserId(email))

if (asJson) {
  console.log(JSON.stringify({ email, ticket }))
} else {
  console.log(
    `Signing in as ${email}. Ticket is good for one use, ${String(TICKET_TTL_SECONDS / 60)} minutes.`,
  )
  console.log(`\nWith the app open, run this in the page:\n`)
  console.log(
    `await Clerk.load(); const r = await Clerk.client.signIn.create({ strategy: "ticket", ticket: "${ticket}" }); await Clerk.setActive({ session: r.createdSessionId });`,
  )
}
