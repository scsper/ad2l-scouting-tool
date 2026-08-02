import { verifyToken } from "@clerk/backend"

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? ""

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnauthorizedError"
  }
}

/**
 * Verify the Clerk session token on a request and return the user ID.
 *
 * The rest of `api/` is unauthenticated, which is tolerable for read paths but
 * not for one that writes to the database and spends OpenDota quota. Sign-up is
 * restricted in the Clerk dashboard, so a valid session is also an authorization
 * decision — if that ever changes, this is where an allowlist check belongs.
 */
export async function requireAuth(authorizationHeader?: string): Promise<string> {
  if (!CLERK_SECRET_KEY) {
    throw new Error("Missing CLERK_SECRET_KEY")
  }

  const token = authorizationHeader?.startsWith("Bearer ")
    ? authorizationHeader.slice("Bearer ".length).trim()
    : undefined

  if (!token) {
    throw new UnauthorizedError("Missing bearer token")
  }

  try {
    const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY })
    return payload.sub
  } catch {
    throw new UnauthorizedError("Invalid or expired session")
  }
}
