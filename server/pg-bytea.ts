/**
 * BYTEA over PostgREST.
 *
 * PostgREST speaks JSON, so a bytea column crosses the wire as Postgres's hex
 * input format — the literal characters `\x` followed by two hex digits per
 * byte. Handing supabase-js a `Buffer` or a `Uint8Array` instead does not fail
 * loudly; it JSON-serialises to `{"type":"Buffer","data":[...]}` and Postgres
 * stores the bytes of *that*, which reads back as a blob of the right shape and
 * entirely the wrong contents.
 */

export function toPgHex(bytes: Uint8Array): string {
  let hex = ""
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0")
  return `\\x${hex}`
}

export function fromPgHex(value: string): Uint8Array {
  // Postgres always answers in `\x…` form regardless of what it was given.
  const hex = value.startsWith("\\x") ? value.slice(2) : value
  if (hex.length % 2 !== 0) {
    throw new Error("fromPgHex: odd-length hex payload")
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}
