import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"
import { extractObjectives, type OpenDotaObjectiveLog } from "./objectives"

const sample = JSON.parse(
  readFileSync(
    join(__dirname, "../scripts/opendota-match-8669782562.json"),
    "utf8",
  ),
) as OpenDotaObjectiveLog

const MATCH_ID = 8669782562

describe("extractObjectives", () => {
  it("keeps every event, not just the towers the map draws", () => {
    // Backfilling means re-fetching all 355 matches at a 1.2s delay, so dropping
    // a field here is the mistake that costs a second sweep to undo.
    const rows = extractObjectives(sample, MATCH_ID)
    expect(rows).toHaveLength(37)

    const types = new Set(rows?.map(r => r.type))
    expect(types).toContain("building_kill")
    expect(types).toContain("CHAT_MESSAGE_ROSHAN_KILL")
    expect(types).toContain("CHAT_MESSAGE_MINIBOSS_KILL")
    expect(types).toContain("CHAT_MESSAGE_AEGIS")
    expect(types).toContain("CHAT_MESSAGE_FIRSTBLOOD")
  })

  it("reads building kills with their entity key", () => {
    const rows = extractObjectives(sample, MATCH_ID) ?? []
    const first = rows
      .filter(r => r.type === "building_kill")
      .sort((a, b) => a.time - b.time)[0]

    expect(first.key).toBe("npc_dota_badguys_tower1_mid")
    expect(first.time).toBe(512)
    // A lane creep took it, which is why `unit` exists at all.
    expect(first.unit).toBe("npc_dota_creep_goodguys_flagbearer")
  })

  it("normalises first blood's numeric key to text", () => {
    // CHAT_MESSAGE_FIRSTBLOOD puts the victim's slot in `key`, where every other
    // row puts an entity name. Left as a number it would break the column type.
    const rows = extractObjectives(sample, MATCH_ID) ?? []
    const firstBlood = rows.find(r => r.type === "CHAT_MESSAGE_FIRSTBLOOD")
    expect(firstBlood?.key).toBe("9")
    expect(firstBlood?.time).toBe(-19)
  })

  it("leaves position-less events with nulls rather than inventing fields", () => {
    const rows = extractObjectives(sample, MATCH_ID) ?? []
    const roshan = rows.find(r => r.type === "CHAT_MESSAGE_ROSHAN_KILL")
    expect(roshan?.key).toBeNull()
    expect(roshan?.unit).toBeNull()
    // Roshan carries only a timestamp and the killing team — no coordinates.
    expect(roshan?.team).toBe(2)
  })

  it("returns null when the replay was never parsed", () => {
    // Distinct from []: an unparsed match must stay out of every fall-rate
    // denominator rather than counting as a game where nothing was destroyed.
    expect(extractObjectives({}, MATCH_ID)).toBeNull()
    expect(extractObjectives({ objectives: null }, MATCH_ID)).toBeNull()
    expect(extractObjectives({ objectives: [] }, MATCH_ID)).toEqual([])
  })

  it("stamps every row with the match id", () => {
    const rows = extractObjectives(sample, MATCH_ID) ?? []
    expect(rows.every(r => r.match_id === MATCH_ID)).toBe(true)
  })
})
