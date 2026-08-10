import { requireScope, respondToAccessError } from "../server/access.js"
import { hasAnyAccess } from "../server/access-scope.js"
import type { Grant } from "../server/access-scope.js"

/**
 * What the caller may see, from the caller's point of view.
 *
 * The client cannot derive any of this. Every other route answers a question
 * about the data and simply returns less of it to a scoped user, which is
 * enough to render the pickers but not enough to answer the three questions the
 * UI actually has: where to land on sign-in, whether to offer "Add team", and
 * whether an empty app means "not provisioned yet" or "something is broken".
 */
export type MeResponse = {
  isAdmin: boolean
  /** Empty for an admin: their real scope is every league that exists. */
  grants: Grant[]
  /**
   * Whether this account has been given anything at all. False is the normal
   * state between sign-up and provisioning, not an error.
   */
  hasAccess: boolean
}

export default async function handler(
  req: {
    method?: string
    headers: Record<string, string | string[] | undefined>
  },
  res: {
    status: (code: number) => { json: (data: unknown) => void }
  },
) {
  if (req.method && req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  try {
    const scope = await requireScope(req.headers.authorization)
    const body: MeResponse = {
      isAdmin: scope.isAdmin,
      grants: scope.grants,
      hasAccess: hasAnyAccess(scope),
    }
    res.status(200).json(body)
  } catch (error) {
    if (respondToAccessError(error, res)) return
    console.error("Error in handler:", error)
    res.status(500).json({ error: "Failed to load access" })
  }
}
