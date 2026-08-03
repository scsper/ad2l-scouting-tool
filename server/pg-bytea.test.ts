import { describe, expect, it } from "vitest"
import { fromPgHex, toPgHex } from "./pg-bytea"

describe("toPgHex / fromPgHex", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array(256)
    for (let i = 0; i < 256; i++) bytes[i] = i
    expect([...fromPgHex(toPgHex(bytes))]).toEqual([...bytes])
  })

  it("emits Postgres hex input format", () => {
    expect(toPgHex(new Uint8Array([0x00, 0x0f, 0xff]))).toBe("\\x000fff")
  })

  it("pads single-digit bytes", () => {
    // Without the pad, 0x0a would emit as "a" and shift every later byte by a
    // nibble — a blob that decodes to plausible-looking garbage rather than
    // failing.
    expect(toPgHex(new Uint8Array([0x0a, 0x0b]))).toBe("\\x0a0b")
  })

  it("reads a payload back with or without the prefix", () => {
    expect([...fromPgHex("\\x0a0b")]).toEqual([10, 11])
    expect([...fromPgHex("0a0b")]).toEqual([10, 11])
  })

  it("refuses an odd-length payload rather than dropping a nibble", () => {
    expect(() => fromPgHex("\\x0a0")).toThrow(/odd-length/)
  })

  it("round-trips an empty blob", () => {
    expect(toPgHex(new Uint8Array(0))).toBe("\\x")
    expect(fromPgHex("\\x").byteLength).toBe(0)
  })
})
