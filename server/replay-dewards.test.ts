import { describe, expect, it } from "vitest"
import { extractReplayDewards } from "./replay-dewards.js"

const heroes = Array.from({ length: 10 }, (_, slot) => ({
  type: "interval",
  slot,
  hero_id: 100 + slot,
}))
const epilogue = { type: "epilogue" }
const lines = (events: object[]) => events.map(event => JSON.stringify(event))

describe("extractReplayDewards", () => {
  it("credits the revealer for both ward types, even when a teammate lands the last hit", () => {
    // Actual chat events from archive 9003950258. Slot 4 placed the revealing
    // sentries; slots 0 and 1 killed the wards. Hero IDs here are test IDs.
    const result = extractReplayDewards(
      lines([
        ...heroes,
        {
          time: 1088,
          type: "CHAT_MESSAGE_SENTRY_WARD_KILLED",
          value: 0,
          player1: 0,
          player2: 4,
        },
        {
          time: 1116,
          type: "CHAT_MESSAGE_OBSERVER_WARD_KILLED",
          value: 174,
          player1: 1,
          player2: 4,
        },
        // The matching combat log and removal are not additional dewards.
        { type: "DOTA_COMBATLOG_DEATH", targetname: "npc_dota_observer_wards" },
        {
          type: "obs_left",
          slot: 8,
          attackername: "npc_dota_hero_dragon_knight",
        },
        epilogue,
      ]),
    )

    expect(result.find(p => p.heroId === 104)).toEqual({
      heroId: 104,
      obsDewards: 1,
      senDewards: 1,
    })
    expect(result.filter(p => p.heroId !== 104)).toEqual(
      heroes
        .filter(p => p.slot !== 4)
        .map(p => ({ heroId: p.hero_id, obsDewards: 0, senDewards: 0 })),
    )
  })

  it("accepts slot zero and Dire slots, counts events rather than bounty, and handles non-player killers", () => {
    const result = extractReplayDewards(
      lines([
        ...[...heroes].reverse(),
        {
          type: "CHAT_MESSAGE_OBSERVER_WARD_KILLED",
          player1: 0,
          player2: 0,
          value: 150,
        },
        {
          type: "CHAT_MESSAGE_OBSERVER_WARD_KILLED",
          player1: 0,
          player2: 0,
          value: 240,
        },
        { type: "CHAT_MESSAGE_SENTRY_WARD_KILLED", player1: -1, player2: 9 },
        epilogue,
      ]),
    )

    expect(result.find(p => p.heroId === 100)?.obsDewards).toBe(2)
    expect(result.find(p => p.heroId === 109)?.senDewards).toBe(1)
  })

  it("does not turn natural expiry or an uncredited deward into last-hit credit", () => {
    const result = extractReplayDewards(
      lines([
        ...heroes,
        { type: "obs_left", slot: 0 },
        { type: "sen_left", slot: 9 },
        { type: "CHAT_MESSAGE_OBSERVER_WARD_KILLED", player1: 0, player2: -1 },
        { type: "CHAT_MESSAGE_SENTRY_WARD_KILLED", player1: 9, player2: -1 },
        epilogue,
      ]),
    )

    expect(result.every(p => p.obsDewards === 0 && p.senDewards === 0)).toBe(
      true,
    )
  })

  it("reports real zeroes for a complete match without dewards", () => {
    expect(extractReplayDewards(lines([...heroes, epilogue]))).toEqual(
      heroes.map(p => ({ heroId: p.hero_id, obsDewards: 0, senDewards: 0 })),
    )
  })

  it.each([undefined, null, -2, 10, 128, 1.5])(
    "rejects invalid credit %s instead of silently undercounting",
    player2 => {
      expect(() =>
        extractReplayDewards(
          lines([
            ...heroes,
            { type: "CHAT_MESSAGE_SENTRY_WARD_KILLED", player1: 4, player2 },
            epilogue,
          ]),
        ),
      ).toThrow(/credited player/)
    },
  )

  it("rejects incomplete and corrupt archives rather than recording partial counts", () => {
    expect(() => extractReplayDewards(lines(heroes))).toThrow(/epilogue/)
    expect(() =>
      extractReplayDewards([...lines([...heroes, epilogue]), '{"type":']),
    ).toThrow()
  })

  it("rejects missing or conflicting hero mappings", () => {
    expect(() =>
      extractReplayDewards(lines([...heroes.slice(1), epilogue])),
    ).toThrow(/ten unique heroes/)
    expect(() =>
      extractReplayDewards(
        lines([
          ...heroes,
          { type: "interval", slot: 0, hero_id: 200 },
          epilogue,
        ]),
      ),
    ).toThrow(/conflicting heroes/)
    expect(() =>
      extractReplayDewards(
        lines([
          ...heroes.slice(1),
          { type: "interval", slot: 0, hero_id: 101 },
          epilogue,
        ]),
      ),
    ).toThrow(/ten unique heroes/)
  })
})
