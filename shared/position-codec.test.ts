import { describe, expect, it } from "vitest"
import {
  decodePositions,
  encodePositions,
  quantise,
  dequantise,
  sampleIndexAt,
  type SlotSamples,
} from "./position-codec"

function slot(heroId: number, points: [number, number][]): SlotSamples {
  return {
    heroId,
    x: points.map(p => p[0]),
    y: points.map(p => p[1]),
    dead: points.map(() => false),
  }
}

function tenSlots(points: [number, number][]): SlotSamples[] {
  return Array.from({ length: 10 }, (_, i) => slot(100 + i, points))
}

describe("quantise", () => {
  it("round-trips within half a tenth of a grid unit", () => {
    for (const coord of [61.5, 64, 127.5, 155.123, 195.3]) {
      expect(Math.abs(dequantise(quantise(coord)) - coord)).toBeLessThanOrEqual(
        0.05,
      )
    }
  })

  it("keeps coordinates outside the ward grid rather than clamping them", () => {
    // Hero positions run 61.5..195.3, outside the 64..191 ward grid. Clamping
    // belongs in the renderer, so a future map crop does not need a re-parse.
    expect(dequantise(quantise(61.5))).toBeCloseTo(61.5, 1)
    expect(dequantise(quantise(195.3))).toBeCloseTo(195.3, 1)
  })
})

describe("encodePositions / decodePositions", () => {
  it("round-trips positions and life states", () => {
    const slots = tenSlots([
      [64, 64],
      [70.5, 80.25],
      [120, 190],
    ])
    slots[3].dead = [false, true, true]

    const encoded = encodePositions(slots)
    const decoded = decodePositions({
      positions: encoded.positions,
      lifeStates: encoded.lifeStates,
      firstTime: -89,
      sampleCount: encoded.sampleCount,
      slotHeroIds: encoded.slotHeroIds,
    })

    expect(decoded.sampleCount).toBe(3)
    expect(decoded.firstTime).toBe(-89)
    expect(decoded.slots).toHaveLength(10)
    expect(decoded.slots[0].heroId).toBe(100)
    expect(decoded.slots[0].x[1]).toBeCloseTo(70.5, 1)
    expect(decoded.slots[0].y[2]).toBeCloseTo(190, 1)
    expect([...decoded.slots[3].dead]).toEqual([0, 1, 1])
    expect([...decoded.slots[4].dead]).toEqual([0, 0, 0])
  })

  it("is four bytes per sample per slot", () => {
    const encoded = encodePositions(
      tenSlots([
        [64, 64],
        [65, 65],
      ]),
    )
    expect(encoded.positions.byteLength).toBe(10 * 2 * 4)
  })

  it("refuses ragged slots rather than shearing the blob", () => {
    // The layout is a flat [slot][sample] rectangle with no per-slot header, so
    // a short slot would silently misalign every slot after it.
    const slots = tenSlots([
      [64, 64],
      [65, 65],
    ])
    slots[5].x = [64]
    slots[5].y = [64]
    slots[5].dead = [false]
    expect(() => encodePositions(slots)).toThrow(/ragged/)
  })

  it("rejects a blob whose length disagrees with the header", () => {
    const encoded = encodePositions(
      tenSlots([
        [64, 64],
        [65, 65],
      ]),
    )
    expect(() =>
      decodePositions({
        positions: encoded.positions,
        lifeStates: encoded.lifeStates,
        firstTime: 0,
        sampleCount: 3,
        slotHeroIds: encoded.slotHeroIds,
      }),
    ).toThrow(/expected/)
  })

  it("decodes correctly from a view with a non-zero byteOffset", () => {
    // Buffer slices routinely carry one, and reading straight off `.buffer`
    // would silently start at the wrong place.
    const encoded = encodePositions(
      tenSlots([
        [64, 64],
        [90, 100],
      ]),
    )
    const padded = new Uint8Array(encoded.positions.byteLength + 8)
    padded.set(encoded.positions, 8)
    const offsetView = padded.subarray(8)

    const decoded = decodePositions({
      positions: offsetView,
      lifeStates: encoded.lifeStates,
      firstTime: 0,
      sampleCount: 2,
      slotHeroIds: encoded.slotHeroIds,
    })
    expect(decoded.slots[0].x[1]).toBeCloseTo(90, 1)
    expect(decoded.slots[9].y[1]).toBeCloseTo(100, 1)
  })

  it("survives a full-map jump between consecutive samples", () => {
    // A teleport is the largest delta possible and must stay inside int16.
    const encoded = encodePositions(
      tenSlots([
        [62, 62],
        [195, 195],
      ]),
    )
    const decoded = decodePositions({
      positions: encoded.positions,
      lifeStates: encoded.lifeStates,
      firstTime: 0,
      sampleCount: 2,
      slotHeroIds: encoded.slotHeroIds,
    })
    expect(decoded.slots[0].x[1]).toBeCloseTo(195, 1)
  })
})

describe("sampleIndexAt", () => {
  const header = { firstTime: -89, sampleCount: 100 }

  it("maps game time onto the sample index", () => {
    expect(sampleIndexAt(header, -89)).toBe(0)
    expect(sampleIndexAt(header, 0)).toBe(89)
  })

  it("returns -1 outside the sampled window", () => {
    expect(sampleIndexAt(header, -90)).toBe(-1)
    expect(sampleIndexAt(header, 11)).toBe(-1)
  })
})
