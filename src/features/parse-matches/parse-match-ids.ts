export type ParsedMatchIds = {
  ids: number[]
  invalid: string[]
}

/**
 * Smallest value treated as a match ID.
 *
 * The season lists in `scripts/` carry week headers like "# Week 1", which
 * tokenize to `#`, `Week`, and `1`. Without a magnitude floor that trailing `1`
 * is a syntactically valid ID and gets submitted as a real match. Dota match IDs
 * have been well past ten million for over a decade, so anything smaller is a
 * stray word fragment rather than a match.
 */
const MIN_MATCH_ID = 10_000_000

/**
 * Split pasted input into match IDs.
 *
 * Accepts newlines, commas, or spaces so a season list can be pasted from a
 * spreadsheet or from `match-ids-to-parse.txt` unchanged. Duplicates are dropped
 * within a batch: submitting the same ID twice would make the second attempt
 * fail as already-parsed, which reads like an error rather than a no-op.
 */
export function parseMatchIds(input: string): ParsedMatchIds {
  const tokens = input.split(/[\s,]+/).filter(token => token !== "")
  const ids: number[] = []
  const invalid: string[] = []
  const seen = new Set<number>()

  for (const token of tokens) {
    const id = Number(token)
    if (!Number.isInteger(id) || id < MIN_MATCH_ID) {
      invalid.push(token)
      continue
    }
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }

  return { ids, invalid }
}
