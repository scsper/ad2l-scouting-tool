import { describe, expect, it } from "vitest"
import { parseMatchIds } from "./parse-match-ids"

describe("parseMatchIds", () => {
  it("reads one ID per line", () => {
    expect(parseMatchIds("8811336092\n8811291254")).toEqual({
      ids: [8811336092, 8811291254],
      invalid: [],
    })
  })

  it("accepts commas and spaces, and tolerates ragged whitespace", () => {
    expect(parseMatchIds("  8811336092, 8811291254   8811336867\n\n")).toEqual({
      ids: [8811336092, 8811291254, 8811336867],
      invalid: [],
    })
  })

  it("drops duplicates so the second copy is not reported as already-parsed", () => {
    expect(parseMatchIds("8811336092\n8811336092\n8811291254")).toEqual({
      ids: [8811336092, 8811291254],
      invalid: [],
    })
  })

  it("separates unparseable tokens from valid IDs", () => {
    expect(parseMatchIds("8811336092\nnot-an-id\n8811291254")).toEqual({
      ids: [8811336092, 8811291254],
      invalid: ["not-an-id"],
    })
  })

  it("rejects zero, negatives, and decimals", () => {
    expect(parseMatchIds("0 -5 12.5")).toEqual({
      ids: [],
      invalid: ["0", "-5", "12.5"],
    })
  })

  it("ignores week headers from the season lists in scripts/", () => {
    // "# Week 1" would otherwise contribute match ID 1, which is a real row.
    expect(parseMatchIds("# Week 1\n8807597496\n8807622773")).toEqual({
      ids: [8807597496, 8807622773],
      invalid: ["#", "Week", "1"],
    })
  })

  it("treats implausibly small numbers as fragments, not match IDs", () => {
    expect(parseMatchIds("1 42 9999999")).toEqual({
      ids: [],
      invalid: ["1", "42", "9999999"],
    })
  })

  it("returns nothing for empty input", () => {
    expect(parseMatchIds("   \n  ")).toEqual({ ids: [], invalid: [] })
  })

  it("rejects an OpenDota match URL rather than silently taking part of it", () => {
    expect(parseMatchIds("https://www.opendota.com/matches/8811336092")).toEqual({
      ids: [],
      invalid: ["https://www.opendota.com/matches/8811336092"],
    })
  })
})
