/**
 * PostgREST caps every response at 1000 rows. It does not error, does not set a
 * flag, and honours a larger `limit` only up to that ceiling — a truncated read
 * is indistinguishable from a complete one.
 *
 * That silently corrupted the league aggregates: AD2L Season 46 has 2782
 * `match_draft` rows, so ban counts were computed from 36% of the drafts and
 * presented as the whole league. Four of six leagues were over the cap.
 *
 * Pass a callback that applies `.range(from, to)` to an otherwise-built query.
 * Paging stops on the first short page.
 */
const PAGE_SIZE = 1000

/**
 * Loose on purpose: a PostgREST builder's row type reflects the selected
 * columns, which rarely matches the hand-written row type the caller wants.
 * Callers name the shape via the generic, exactly as they did with the `as`
 * casts this replaces.
 */
type PageResult = { data: unknown[] | null; error: Error | null }

export async function selectAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult>,
): Promise<T[]> {
  const rows: T[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1)

    if (error) throw error

    const page = (data ?? []) as T[]
    rows.push(...page)

    // A short page means the last one. An exactly-full final page costs one
    // extra empty request, which is the price of not guessing.
    if (page.length < PAGE_SIZE) return rows
  }
}
