import { afterEach, describe, expect, it, vi } from "vitest"
import { makeStore } from "./store"
import { clearTokenGetter, setTokenGetter } from "./auth-token"
import { accessApiSlice } from "../features/access/access-api"
import { stubFetch } from "../utils/test-fetch"

/** The Authorization header the app actually put on the wire. */
function sentAuthorization(): string | null {
  const [request] = vi.mocked(fetch).mock.calls[0] as unknown as [
    { headers: Headers },
  ]
  return request.headers.get("Authorization")
}

async function fetchMe() {
  stubFetch({ "api/me": { isAdmin: false, grants: [], hasAccess: false } })
  const store = makeStore()
  await store.dispatch(accessApiSlice.endpoints.getMe.initiate())
}

afterEach(() => {
  vi.unstubAllGlobals()
  clearTokenGetter()
})

describe("authedBaseQuery", () => {
  // The whole point of the shared base query. Reads used to send no credentials
  // at all, so a route that is now enforcing access would 401 for everyone if
  // this ever regressed — and it would regress quietly, because a new slice
  // that forgets the shared base query still compiles and still works against
  // the two routes that do not check.
  it("sends the Clerk token as a bearer header", async () => {
    setTokenGetter(() => Promise.resolve("session-token"))
    await fetchMe()
    expect(sentAuthorization()).toBe("Bearer session-token")
  })

  // A signed-out or expired session. Sending `Bearer null` would be worse than
  // sending nothing: the server would try to verify it and the failure would
  // read as a bad token rather than an absent one.
  it("omits the header entirely when there is no token", async () => {
    setTokenGetter(() => Promise.resolve(null))
    await fetchMe()
    expect(sentAuthorization()).toBeNull()
  })

  // Requests can only beat `ClerkTokenBridge` on the very first paint. The
  // recoverable 401 that follows is the deliberate choice — waiting on a getter
  // that never arrives would hang every query in the app, tests included.
  it("does not hang when Clerk has not published a getter yet", async () => {
    await fetchMe()
    expect(sentAuthorization()).toBeNull()
  })

  // Clerk throws rather than returning null once a session has expired.
  it("treats a throwing getter as no token", async () => {
    setTokenGetter(() => Promise.reject(new Error("session expired")))
    await fetchMe()
    expect(sentAuthorization()).toBeNull()
  })
})
