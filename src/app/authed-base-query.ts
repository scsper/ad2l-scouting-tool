import { fetchBaseQuery } from "@reduxjs/toolkit/query/react"
import { getAuthToken } from "./auth-token"

/**
 * The base query every API slice uses.
 *
 * There are eight slices and none of them sent an `Authorization` header before
 * this: `api/` was unauthenticated for reads, which was tolerable while a valid
 * session and permission to see everything were the same thing. They are not
 * any more, so the header has to be on every request — and one shared base
 * query is the only version of that which cannot be forgotten when a ninth
 * slice appears.
 *
 * See `auth-token.ts` for why the token is fetched here rather than passed in
 * as a query argument.
 */
export const authedBaseQuery = fetchBaseQuery({
  baseUrl: "/",
  prepareHeaders: async headers => {
    const token = await getAuthToken()
    if (token) headers.set("Authorization", `Bearer ${token}`)
    return headers
  },
})
