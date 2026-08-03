/**
 * Encoding for per-second hero positions extracted from a replay.
 *
 * Lives in `shared/` because all three worlds touch it: the parse script writes
 * blobs, the API route reads them, and the browser decodes them to draw.
 *
 * Compression is deliberately NOT done here. Node gzips with `zlib` on the way
 * into Postgres and gunzips on the way out; the browser only ever sees raw
 * bytes. Keeping the codec compression-free is what lets it be shared at all —
 * `DecompressionStream` is async and browser-only, `zlib` is node-only, and a
 * codec that needed either would have to fork per environment.
 */

/**
 * Written into `match_positions.encoding` on every row.
 *
 * Versioned because the obvious future changes — finer quantisation, or folding
 * `networth`/`lh` into the stream — are re-parses, not migrations. Without a
 * version string a v2 blob is indistinguishable from a v1 one and the decoder
 * has to guess.
 */
export const POSITION_ENCODING = "delta-i16-0.1grid-gz-v1"

/**
 * Quantisation to 0.1 grid units.
 *
 * The Dota map spans 127 grid units across roughly 16,384 game units, so one
 * grid unit is ~129 game units and 0.1 of one is ~13. That is comfortably below
 * a hero's 24-unit collision size, so the rounding cannot move a hero into a
 * different camp, lane or side of the river — it is invisible to every question
 * this data is collected to answer.
 *
 * The origin is 60 rather than the ward grid's 64 because observed hero
 * coordinates run 61.5..195.3, outside the 64..191 ward grid. Fountains and map
 * edges sit past both ends. We store them unclamped and let the renderer clamp,
 * so a future map image with a wider crop does not need the data re-parsed.
 */
const QUANT_SCALE = 10
const QUANT_ORIGIN = 60

export const SLOT_COUNT = 10

/** One player's position track. `dead` mirrors `life_state != 0`. */
export type SlotSamples = {
  heroId: number
  x: number[]
  y: number[]
  dead: boolean[]
}

export type DecodedSlot = {
  heroId: number
  /** Grid-space coordinates, same space as ward x/y. Feed to `wardToFraction`. */
  x: Float32Array
  y: Float32Array
  /** 1 = dead. Aggregates must filter these out; 12.6% of a game is death. */
  dead: Uint8Array
}

export type DecodedPositions = {
  /** Game time of sample 0, in seconds relative to the horn. Usually negative. */
  firstTime: number
  sampleCount: number
  slots: DecodedSlot[]
}

export function quantise(coord: number): number {
  return Math.round((coord - QUANT_ORIGIN) * QUANT_SCALE)
}

export function dequantise(quantised: number): number {
  return quantised / QUANT_SCALE + QUANT_ORIGIN
}

/**
 * Pack position tracks into the two blobs stored on `match_positions`.
 *
 * Layout is slot-major — all of slot 0's samples, then all of slot 1's — not
 * time-major. Deltas within a slot are tiny (a hero covers at most ~4 grid units
 * a second, so ~40 after quantisation) and gzip collapses them; interleaving
 * slots would put ten unrelated tracks' worth of noise between consecutive
 * samples and destroy that. Measured on a real match: 112 KB raw becomes 67 KB
 * gzipped time-major-equivalent versus 46 KB slot-major.
 *
 * The first sample of each slot is stored as a delta from zero, i.e. absolutely.
 * That value is ~1,300 at most, well inside int16, as is a full-map teleport.
 */
export function encodePositions(slots: SlotSamples[]): {
  positions: Uint8Array
  lifeStates: Uint8Array
  sampleCount: number
  slotHeroIds: number[]
} {
  if (slots.length === 0) {
    throw new Error("encodePositions: no slots")
  }

  const sampleCount = slots[0].x.length
  for (const slot of slots) {
    if (
      slot.x.length !== sampleCount ||
      slot.y.length !== sampleCount ||
      slot.dead.length !== sampleCount
    ) {
      // A ragged match would silently shear every later slot in the blob,
      // because the layout is a flat [slot][sample] rectangle with no per-slot
      // header. The spike match had identical coverage across all ten slots at
      // all 2,866 seconds, but that is an observation about one game.
      throw new Error(
        `encodePositions: ragged slots (expected ${String(sampleCount)} samples)`,
      )
    }
  }

  const positions = new Uint8Array(slots.length * sampleCount * 4)
  const view = new DataView(positions.buffer)
  let offset = 0

  for (const slot of slots) {
    let prevX = 0
    let prevY = 0
    for (let i = 0; i < sampleCount; i++) {
      const qx = quantise(slot.x[i])
      const qy = quantise(slot.y[i])
      view.setInt16(offset, qx - prevX, true)
      view.setInt16(offset + 2, qy - prevY, true)
      prevX = qx
      prevY = qy
      offset += 4
    }
  }

  const bitCount = slots.length * sampleCount
  const lifeStates = new Uint8Array(Math.ceil(bitCount / 8))
  let bit = 0
  for (const slot of slots) {
    for (let i = 0; i < sampleCount; i++) {
      if (slot.dead[i]) lifeStates[bit >> 3] |= 1 << (bit & 7)
      bit += 1
    }
  }

  return {
    positions,
    lifeStates,
    sampleCount,
    slotHeroIds: slots.map(s => s.heroId),
  }
}

/**
 * Unpack blobs back into per-slot tracks.
 *
 * Returns typed arrays rather than objects because the heatmap bins a whole
 * team-season at once — twenty matches is roughly 570,000 samples, and that has
 * to re-bin inside a slider drag. Allocating half a million `{x, y}` objects to
 * do it would be the slowest thing on the screen.
 */
export function decodePositions({
  positions,
  lifeStates,
  firstTime,
  sampleCount,
  slotHeroIds,
}: {
  positions: Uint8Array
  lifeStates: Uint8Array
  firstTime: number
  sampleCount: number
  slotHeroIds: number[]
}): DecodedPositions {
  const expected = slotHeroIds.length * sampleCount * 4
  if (positions.byteLength !== expected) {
    throw new Error(
      `decodePositions: expected ${String(expected)} bytes, got ${String(positions.byteLength)}`,
    )
  }

  // A byteOffset-bearing view (which `Buffer` slices routinely are) would make
  // an Int16Array constructed straight off `.buffer` read from the wrong place.
  const view = new DataView(
    positions.buffer,
    positions.byteOffset,
    positions.byteLength,
  )

  const slots: DecodedSlot[] = []
  let offset = 0
  let bit = 0

  for (const heroId of slotHeroIds) {
    const x = new Float32Array(sampleCount)
    const y = new Float32Array(sampleCount)
    const dead = new Uint8Array(sampleCount)

    let runningX = 0
    let runningY = 0
    for (let i = 0; i < sampleCount; i++) {
      runningX += view.getInt16(offset, true)
      runningY += view.getInt16(offset + 2, true)
      x[i] = dequantise(runningX)
      y[i] = dequantise(runningY)
      dead[i] = (lifeStates[bit >> 3] >> (bit & 7)) & 1
      offset += 4
      bit += 1
    }

    slots.push({ heroId, x, y, dead })
  }

  return { firstTime, sampleCount, slots }
}

/** Index into a slot's sample arrays for a game time, or -1 if out of range. */
export function sampleIndexAt(
  decoded: Pick<DecodedPositions, "firstTime" | "sampleCount">,
  time: number,
): number {
  const index = Math.round(time) - decoded.firstTime
  return index >= 0 && index < decoded.sampleCount ? index : -1
}
