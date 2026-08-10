import { createApi } from "@reduxjs/toolkit/query/react"
import { authedBaseQuery } from "../../app/authed-base-query"
import type { MeResponse } from "../../../api/me"

/**
 * What this account may see, as the server understands it.
 *
 * The one thing the client cannot work out for itself. Every other route
 * quietly returns less to a scoped user, which is enough to render the pickers
 * but cannot answer the questions the shell has before any picker exists: where
 * to land on sign-in, whether to offer "Add team", and whether an empty app
 * means "not provisioned yet" or "something is broken".
 */
export const accessApiSlice = createApi({
  baseQuery: authedBaseQuery,
  reducerPath: "access",
  endpoints: build => ({
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    getMe: build.query<MeResponse, void>({
      query: () => "api/me",
    }),
  }),
})

export const { useGetMeQuery } = accessApiSlice
