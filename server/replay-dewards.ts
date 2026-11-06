/** Dewards credited by Dota to the player providing True Sight. */
export type ReplayDewards = {
  heroId: number
  obsDewards: number
  senDewards: number
}

type DewardEvent = {
  type?: string
  slot?: number
  hero_id?: number
  player2?: number
}

/**
 * Both WARD_KILLED chat events carry player1=killer, player2=credited player.
 * In archive 9003950258, at 1116s Dragon Knight (1) kills an observer but
 * Grimstroke (4) receives the bounty, matching his sentry placed at 1113s.
 * At 1088s Ursa (0) kills a sentry revealed by Grimstroke's sentry at 1070s;
 * the event again credits player2=4. Use that attribution, including other
 * True Sight sources, rather than guessing from nearby/overlapping sentries.
 *
 * Require a complete stream and ten unique heroes before reporting zeroes.
 * Missing archives or malformed attribution must never become "no dewards".
 */
export function extractReplayDewards(lines: Iterable<string>): ReplayDewards[] {
  const heroes = new Map<number, number>()
  const counts = Array.from({ length: 10 }, () => ({
    obsDewards: 0,
    senDewards: 0,
  }))
  let complete = false

  for (const line of lines) {
    if (line.trim() === "") continue
    const event = JSON.parse(line) as DewardEvent
    if (event.type === "epilogue") complete = true
    if (
      event.type === "interval" &&
      event.slot !== undefined &&
      Number.isInteger(event.slot) &&
      event.slot >= 0 &&
      event.slot < 10 &&
      event.hero_id !== undefined &&
      Number.isInteger(event.hero_id) &&
      event.hero_id > 0
    ) {
      const previous = heroes.get(event.slot)
      if (previous !== undefined && previous !== event.hero_id) {
        throw new Error("Replay has conflicting heroes for a player slot")
      }
      heroes.set(event.slot, event.hero_id)
    }

    const stat =
      event.type === "CHAT_MESSAGE_OBSERVER_WARD_KILLED"
        ? "obsDewards"
        : event.type === "CHAT_MESSAGE_SENTRY_WARD_KILLED"
          ? "senDewards"
          : null
    if (stat === null) continue

    // -1 means no player received credit (e.g. team detection). Never fall
    // back to player1: that would reintroduce last-hit attribution.
    const slot = event.player2
    if (slot === -1) continue
    if (
      slot === undefined ||
      !Number.isInteger(slot) ||
      slot < 0 ||
      slot >= 10
    ) {
      throw new Error("Ward kill event is missing a valid credited player")
    }
    counts[slot][stat] += 1
  }

  if (!complete) throw new Error("Replay is incomplete: missing epilogue")
  if (heroes.size !== 10 || new Set(heroes.values()).size !== 10) {
    throw new Error("Replay must identify ten unique heroes for deward credit")
  }

  return Array.from(heroes, ([slot, heroId]) => ({
    heroId,
    ...counts[slot],
  }))
}
