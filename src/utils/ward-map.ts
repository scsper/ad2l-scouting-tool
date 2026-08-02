import type { WardRecord } from "../../types/db"

/**
 * Nominal ward lifetimes in seconds, measured against real replay data rather
 * than taken from documentation. In match 8669782562, 23 of 48 observer
 * removals landed at exactly 360s and the sentry tail sat at exactly 420s.
 *
 * OpenDota's own client (VisionMap.tsx) still uses 240 for sentries, which is a
 * stale pre-buff constant; copying it would misreport most expired sentries as
 * dewarded.
 */
export const WARD_DURATION: Record<WardRecord["type"], number> = {
  obs: 360,
  sen: 420,
}

// Replay timings are second-resolution and occasionally land a tick late (we
// observed lifespans of 361 and 421), so allow a little slack before calling a
// ward "killed early".
const EXPIRY_SLACK_SECONDS = 5

/**
 * True when the ward was destroyed before its natural expiry.
 *
 * `by` cannot be used for this. OpenDota populates `attackername` on all
 * removals including natural expiries — in the sample match all 48 observer
 * removals carried one, 23 of them at exactly the full 360s duration. Lifespan
 * is the only sound discriminator.
 */
export function wasDewarded(ward: WardRecord): boolean {
  if (ward.left === null) return false
  return (
    ward.left - ward.placed < WARD_DURATION[ward.type] - EXPIRY_SLACK_SECONDS
  )
}

/**
 * True when the ward was standing at `time` (seconds relative to the horn).
 *
 * A `left` of null means the ward outlived the game, so it stays alive for any
 * time at or after placement.
 */
export function isAliveAt(ward: WardRecord, time: number): boolean {
  if (time < ward.placed) return false
  return ward.left === null || time < ward.left
}

/**
 * Map a Dota world-grid coordinate to a 0..1 fraction of the minimap image.
 *
 * This is OpenDota's `gameCoordToUV` (src/utility.tsx): subtract the 64-unit
 * origin offset, then invert y because the game's origin is bottom-left while
 * screen space is top-left. The span is 127, not 128 — the grid runs 64..191
 * inclusive.
 *
 * Adopting their transform verbatim matters: they produce the x/y we consume and
 * they author the minimap images we ship, so transform and asset are a matched
 * pair and the crop cannot drift out of alignment.
 *
 * Coordinates are clamped because a small number of wards sit fractionally
 * outside the grid (1 of 146 in the sample match) and would otherwise render
 * off-image.
 */
export const MAP_SPAN = 127

export function wardToFraction(ward: { x: number; y: number }): {
  x: number
  y: number
} {
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  return {
    x: clamp((ward.x - 64) / MAP_SPAN),
    y: clamp((MAP_SPAN - (ward.y - 64)) / MAP_SPAN),
  }
}

/**
 * Minimap images by patch, newest first, keyed by the patch start time (unix
 * seconds) so a match renders on the terrain it was actually played on.
 *
 * Patch 7.41 (2026-03-24) has no published map image yet — OpenDota's asset host
 * answers 200 with the SPA's HTML shell for missing files rather than 404ing, so
 * a missing map has to be treated as "fall back to the newest one we have" and
 * surfaced in the UI rather than silently trusted.
 */
const MAPS = [
  { patch: "7.40", startTime: 1765846240, src: "/map/detailed_740.jpg" },
  // 7.39 shipped no new map image; those matches render on 7.38 terrain, which
  // is what OpenDota does too.
  { patch: "7.38", startTime: 1739972909, src: "/map/detailed_738.jpg" },
] as const

// Start of the first patch we have no image for. Matches at or after this render
// on the newest map we ship, which is a genuine terrain mismatch rather than an
// exact answer, so it is reported as a fallback.
const FIRST_UNMAPPED_PATCH_START = 1774313459 // 7.41, 2026-03-24

export function getMinimapForMatch(startDateTime: number | null): {
  patch: string
  src: string
  isFallback: boolean
} {
  const newest = MAPS[0]
  const oldest = MAPS[MAPS.length - 1]

  // Unknown start time: we cannot pick terrain at all, so say so.
  if (startDateTime === null) return { ...newest, isFallback: true }

  // Played on a patch newer than any image we ship.
  if (startDateTime >= FIRST_UNMAPPED_PATCH_START) {
    return { ...newest, isFallback: true }
  }

  const map = MAPS.find(m => startDateTime >= m.startTime)
  if (map) return { ...map, isFallback: false }

  // Older than every image we ship.
  return { ...oldest, isFallback: true }
}

export type MinimapChoice = {
  patch: string
  src: string
  /** The chosen image is not the terrain these games were played on. */
  isFallback: boolean
  /** The games span more than one map, so some are drawn on the wrong terrain. */
  isMixed: boolean
}

/**
 * The single map image to draw an aggregate on.
 *
 * An aggregate can span a terrain change, and there is only one background to
 * draw. We take the newest map any of them maps to and say when the set is
 * mixed, rather than silently implying every game was played on it. Passing no
 * matches at all is distinct from an unmapped patch and must not be reported as
 * one — that was a real bug: "All games" passed null and every aggregate claimed
 * its patch had no published image.
 */
export function getMinimapForMatches(startDateTimes: number[]): MinimapChoice {
  if (startDateTimes.length === 0) {
    return { ...MAPS[0], isFallback: false, isMixed: false }
  }

  const choices = startDateTimes.map(getMinimapForMatch)
  const newest = choices.reduce((best, c) =>
    MAPS.findIndex(m => m.src === c.src) <
    MAPS.findIndex(m => m.src === best.src)
      ? c
      : best,
  )
  return {
    ...newest,
    isFallback: choices.some(c => c.isFallback),
    isMixed: new Set(choices.map(c => c.src)).size > 1,
  }
}
