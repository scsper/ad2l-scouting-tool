/**
 * Clerk's session token, reachable from outside React.
 *
 * `prepareHeaders` runs inside RTK Query's middleware, where hooks cannot go,
 * so the one thing that can produce a token — Clerk's `useAuth().getToken` —
 * has to be published here by a component that can call it.
 *
 * The token is deliberately NOT passed as a query argument, which would be the
 * obvious way to get it to the same place. In RTK Query the argument *is* the
 * cache key, and Clerk rotates session tokens roughly every minute, so every
 * rotation would mint a fresh cache entry for every active query and refetch
 * the lot — including the paginated league sweep behind `api/league-matches`.
 * The two mutations that used to take a `token` argument got away with it only
 * because mutations are not cached that way.
 */
type TokenGetter = () => Promise<string | null>

let getToken: TokenGetter | null = null

/** Called during `ClerkTokenBridge`'s render, before anything can query. */
export function setTokenGetter(getter: TokenGetter): void {
  getToken = getter
}

/** Only for tests, which assert on the header without mounting Clerk. */
export function clearTokenGetter(): void {
  getToken = null
}

/**
 * The current token, or null if Clerk has not published a getter yet.
 *
 * Returning null rather than waiting is the safe failure: a request that
 * somehow beats the bridge gets a 401 the user can recover from by reloading,
 * whereas blocking on a getter that never arrives would hang every query in the
 * app forever — including in tests, which never mount Clerk at all. The server
 * is the boundary either way; this only decides whether a request is answered
 * or refused.
 */
export async function getAuthToken(): Promise<string | null> {
  if (!getToken) return null
  try {
    return await getToken()
  } catch {
    // A signed-out or expired session. The 401 that follows is the honest
    // answer, and Clerk's own UI handles getting a new session.
    return null
  }
}
