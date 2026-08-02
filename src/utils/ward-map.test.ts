import { describe, expect, it } from "vitest"
import type { WardRecord } from "../../types/db"
import {
  MAP_SPAN,
  WARD_DURATION,
  getMinimapForMatch,
  getMinimapForMatches,
  isAliveAt,
  wardToFraction,
  wasDewarded,
} from "./ward-map"

const ward = (over: Partial<WardRecord> = {}): WardRecord => ({
  type: "obs",
  x: 129.5,
  y: 118.2,
  placed: 365,
  left: 725,
  by: "dragon_knight",
  ...over,
})

describe("wasDewarded", () => {
  it("does not call a full-duration removal a deward even though `by` is set", () => {
    // The trap: OpenDota populated attackername on all 48 observer removals in
    // match 8669782562, 23 of which ran the full 360s.
    expect(
      wasDewarded(ward({ placed: 365, left: 725, by: "dragon_knight" })),
    ).toBe(false)
  })

  it("tolerates a removal logged a tick past nominal duration", () => {
    expect(wasDewarded(ward({ placed: 0, left: 361 }))).toBe(false)
  })

  it("flags a ward killed well before expiry", () => {
    expect(wasDewarded(ward({ placed: 100, left: 138 }))).toBe(true)
  })

  it("uses the sentry duration for sentries", () => {
    // 400s would be an early death for an observer but is normal for a sentry.
    expect(wasDewarded(ward({ type: "obs", placed: 0, left: 400 }))).toBe(false)
    expect(wasDewarded(ward({ type: "sen", placed: 0, left: 400 }))).toBe(true)
    expect(WARD_DURATION.sen).toBe(420)
  })

  it("treats a ward that outlived the game as not dewarded", () => {
    expect(wasDewarded(ward({ left: null, by: null }))).toBe(false)
  })
})

describe("isAliveAt", () => {
  it("is false before placement and true from placement onward", () => {
    const w = ward({ placed: 100, left: 460 })
    expect(isAliveAt(w, 99)).toBe(false)
    expect(isAliveAt(w, 100)).toBe(true)
    expect(isAliveAt(w, 459)).toBe(true)
  })

  it("is false at and after removal", () => {
    expect(isAliveAt(ward({ placed: 100, left: 460 }), 460)).toBe(false)
  })

  it("keeps a ward that outlived the game alive indefinitely", () => {
    expect(isAliveAt(ward({ placed: 100, left: null }), 99999)).toBe(true)
  })

  it("handles pre-horn placements at negative times", () => {
    const w = ward({ placed: -75, left: 285 })
    expect(isAliveAt(w, -80)).toBe(false)
    expect(isAliveAt(w, -75)).toBe(true)
    expect(isAliveAt(w, 0)).toBe(true)
  })
})

describe("wardToFraction", () => {
  it("maps the grid origin to the bottom-left of the image", () => {
    // Game origin is bottom-left, screen origin is top-left, so y inverts.
    expect(wardToFraction({ x: 64, y: 64 })).toEqual({ x: 0, y: 1 })
  })

  it("maps the far corner to the top-right of the image", () => {
    expect(wardToFraction({ x: 64 + MAP_SPAN, y: 64 + MAP_SPAN })).toEqual({
      x: 1,
      y: 0,
    })
  })

  it("clamps coordinates that sit fractionally outside the grid", () => {
    // 1 of 146 wards in the sample match lands past the edge.
    const f = wardToFraction({ x: 192.1, y: 63.5 })
    expect(f.x).toBe(1)
    expect(f.y).toBe(1)
  })
})

describe("getMinimapForMatch", () => {
  it("picks the 7.40 map for a 7.40 match", () => {
    // 2026-01-30, the sample match.
    const m = getMinimapForMatch(1769738631)
    expect(m.patch).toBe("7.40")
    expect(m.isFallback).toBe(false)
  })

  it("picks the 7.38 map for a 7.39 match, which shipped no image", () => {
    const m = getMinimapForMatch(1747956961)
    expect(m.patch).toBe("7.38")
    expect(m.isFallback).toBe(false)
  })

  it("flags a 7.41 match as rendering on fallback terrain", () => {
    const m = getMinimapForMatch(1774313459)
    expect(m.patch).toBe("7.40")
    expect(m.isFallback).toBe(true)
  })

  it("flags matches older than every image we ship", () => {
    expect(getMinimapForMatch(1000000000).isFallback).toBe(true)
  })

  it("flags an unknown start time rather than guessing terrain", () => {
    expect(getMinimapForMatch(null).isFallback).toBe(true)
  })
})

describe("getMinimapForMatches", () => {
  const T_740 = 1769738631
  const T_738 = 1740000000
  const T_741 = 1774313459

  it("does not cry fallback for an empty set", () => {
    // Regression: "All games" passed null through the single-match helper, so
    // every aggregate claimed its patch had no published map image.
    const m = getMinimapForMatches([])
    expect(m.isFallback).toBe(false)
    expect(m.isMixed).toBe(false)
  })

  it("uses the patch's own map when all games share one", () => {
    const m = getMinimapForMatches([T_740, T_740])
    expect(m.patch).toBe("7.40")
    expect(m.isFallback).toBe(false)
    expect(m.isMixed).toBe(false)
  })

  it("flags a set that spans a terrain change and draws the newest", () => {
    const m = getMinimapForMatches([T_738, T_740])
    expect(m.patch).toBe("7.40")
    expect(m.isMixed).toBe(true)
  })

  it("flags fallback when any game is on an unmapped patch", () => {
    const m = getMinimapForMatches([T_740, T_741])
    expect(m.isFallback).toBe(true)
  })
})
