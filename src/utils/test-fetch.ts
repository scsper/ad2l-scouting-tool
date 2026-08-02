import { vi } from "vitest"

/**
 * Node's undici `Request` rejects jsdom's `AbortSignal`, which `fetchBaseQuery`
 * passes through. This shim keeps only the fields the base query reads.
 */
class TestRequest {
  url: string
  method: string
  headers: Headers

  constructor(input: string | { url: string }, init?: RequestInit) {
    this.url = typeof input === "string" ? input : input.url
    this.method = init?.method ?? "GET"
    this.headers = new Headers(init?.headers)
  }

  clone() {
    return this
  }
}

/**
 * Answers `fetch` from a table keyed by a substring of the request URL.
 *
 * An unmatched URL throws rather than returning an empty body: a component
 * that starts calling something new should fail loudly here, not quietly
 * render as though the call returned nothing.
 */
export function stubFetch(routes: Record<string, unknown>) {
  vi.stubGlobal("Request", TestRequest)
  vi.stubGlobal(
    "fetch",
    vi.fn((input: { url: string }) => {
      const { url } = input

      for (const [fragment, body] of Object.entries(routes)) {
        if (url.includes(fragment)) {
          return Promise.resolve(
            new Response(JSON.stringify(body), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
          )
        }
      }

      throw new Error(`Unexpected fetch: ${url}`)
    }),
  )
}
