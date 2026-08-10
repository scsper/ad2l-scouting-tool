import { ParseError, parseMatch } from "../server/match-operations.js"
import type { ParseErrorCode } from "../server/match-operations.js"
import {
  requireParsedMatchAccess,
  requireScope,
  respondToAccessError,
} from "../server/access.js"
import type { AccessScope } from "../server/access-scope.js"

/**
 * Parse a single match from OpenDota into the database.
 *
 * One match per request on purpose: the client loops over a pasted list so that
 * a season backfill never runs up against the Vercel function timeout, and so a
 * failure on one match reports individually instead of aborting the batch.
 */

const STATUS_BY_CODE: Record<ParseErrorCode, number> = {
  INVALID_ID: 400,
  NOT_FOUND: 404,
  UPSTREAM: 502,
  ALREADY_PARSED: 409,
  UNPARSED: 422,
  UNKNOWN_TEAM: 409,
}

export default async function handler(
  req: {
    method?: string
    headers: Record<string, string | string[] | undefined>
    body?: { matchId?: unknown; overwrite?: unknown }
  },
  res: {
    status: (code: number) => { json: (data: unknown) => void }
  },
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  let scope: AccessScope
  try {
    scope = await requireScope(req.headers.authorization)
  } catch (error) {
    if (respondToAccessError(error, res)) return
    console.error("Error verifying session:", error)
    res.status(500).json({ error: "Failed to verify session" })
    return
  }

  const rawMatchId = req.body?.matchId
  const matchId =
    typeof rawMatchId === "number" ? rawMatchId : Number(rawMatchId ?? NaN)

  if (!Number.isInteger(matchId) || matchId <= 0) {
    res.status(400).json({ error: "matchId must be a positive integer" })
    return
  }

  try {
    const result = await parseMatch({
      matchId,
      overwrite: req.body?.overwrite === true,
      // A match id names no league and no team, so the decision can only be
      // made once OpenDota has answered — hence a callback rather than a check
      // up here. A scoped user who is refused has still spent one OpenDota
      // request, which is the accepted cost of letting them parse at all.
      authorize: match => requireParsedMatchAccess(scope, match),
    })
    res.status(200).json(result)
  } catch (error) {
    if (respondToAccessError(error, res)) return
    if (error instanceof ParseError) {
      res
        .status(STATUS_BY_CODE[error.code])
        .json({ error: error.message, code: error.code, matchId })
      return
    }
    console.error("Error parsing match:", error)
    res
      .status(500)
      .json({ error: "Failed to parse match", matchId })
  }
}
