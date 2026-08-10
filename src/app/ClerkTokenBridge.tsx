import { useAuth } from "@clerk/react"
import { setTokenGetter } from "./auth-token"

/**
 * Publishes Clerk's `getToken` where the API slices can reach it.
 *
 * Registered during render rather than in an effect, and mounted as the first
 * child inside `ClerkProvider`, so it happens before `App` renders and
 * therefore before any `useQuery` fires. An effect would run after its
 * siblings' effects and lose that race on the first paint.
 */
export const ClerkTokenBridge = () => {
  const { getToken } = useAuth()
  setTokenGetter(getToken)
  return null
}
