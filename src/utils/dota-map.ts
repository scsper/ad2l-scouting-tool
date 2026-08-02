/**
 * Fixed map geography: buildings, Roshan pits and the Tormentor.
 *
 * Positions are fractions of the minimap image (x right, y down), the same 0..1
 * space `wardToFraction` produces, so buildings and wards land on one coordinate
 * system without a second transform.
 */

export type Lane = "top" | "mid" | "bot"
export type MapSide = "radiant" | "dire"
export type Point = { x: number; y: number }

/**
 * Tower positions, lifted verbatim from OpenDota's own `buildingData733.ts`.
 *
 * Adopted rather than measured for the same reason `wardToFraction` adopts their
 * `gameCoordToUV`: they author the minimap images we ship, so their coordinates
 * and their artwork are a matched pair. Eyeballing positions against the terrain
 * put every candidate several percent off the lane; these sit on it exactly.
 *
 * 7.33-era data, which covers every patch we hold (7.38 and later). Their
 * pre-7.33 table exists but no match in this database predates it.
 */
const RADIANT_TOWERS: Record<Lane, Record<1 | 2 | 3, Point>> = {
  top: {
    1: { x: 0.095, y: 0.36 },
    2: { x: 0.09, y: 0.53 },
    3: { x: 0.08, y: 0.68 },
  },
  mid: {
    1: { x: 0.38, y: 0.54 },
    2: { x: 0.275, y: 0.63 },
    3: { x: 0.185, y: 0.715 },
  },
  bot: {
    1: { x: 0.75, y: 0.82 },
    2: { x: 0.46, y: 0.85 },
    3: { x: 0.23, y: 0.835 },
  },
}

const DIRE_TOWERS: Record<Lane, Record<1 | 2 | 3, Point>> = {
  top: {
    1: { x: 0.18, y: 0.12 },
    2: { x: 0.49, y: 0.11 },
    3: { x: 0.7, y: 0.125 },
  },
  mid: {
    1: { x: 0.51, y: 0.435 },
    2: { x: 0.64, y: 0.33 },
    3: { x: 0.73, y: 0.24 },
  },
  bot: {
    1: { x: 0.84, y: 0.6 },
    2: { x: 0.85, y: 0.45 },
    3: { x: 0.855, y: 0.28 },
  },
}

/**
 * Dire's table is listed rather than derived by rotating Radiant's.
 *
 * The Dota map is close to 180-degree symmetric but not exactly, and OpenDota's
 * two tables differ by up to 4% of the map width in places. Rotating one onto
 * the other would move six towers off their lanes to save twelve lines.
 */
export const TOWERS = { radiant: RADIANT_TOWERS, dire: DIRE_TOWERS }

/** The tiers drawn on the map. T4s sit on top of each other inside the base and
 *  fall only after the game is decided, so they are stored but never plotted. */
export const RENDERED_TIERS = [1, 2, 3] as const
export type RenderedTier = (typeof RENDERED_TIERS)[number]

export const LANES: Lane[] = ["top", "mid", "bot"]

export type TowerId = {
  tier: RenderedTier
  lane: Lane
  side: MapSide
}

/** Every tower drawn on the map, both sides. */
export const ALL_TOWERS: TowerId[] = (["radiant", "dire"] as MapSide[]).flatMap(
  side =>
    LANES.flatMap(lane => RENDERED_TIERS.map(tier => ({ tier, lane, side }))),
)

export function towerPosition(tower: TowerId): Point {
  return TOWERS[tower.side][tower.lane][tower.tier]
}

export function towerKeyOf(tower: TowerId): string {
  return `${tower.side}-${tower.lane}-${String(tower.tier)}`
}

const BUILDING_KEY = /^npc_dota_(goodguys|badguys)_tower([1-4])_(top|mid|bot)$/

/**
 * Parse OpenDota's building entity name into a tower identity.
 *
 * Returns null for anything that is not a plotted tower — barracks, forts, T4s,
 * and the numeric `key` that first blood puts in the same field. Those rows are
 * stored, so this has to reject rather than assume.
 */
export function parseTowerKey(key: string | null): TowerId | null {
  if (key === null) return null
  const match = BUILDING_KEY.exec(key)
  if (!match) return null

  const tier = Number(match[2])
  if (tier !== 1 && tier !== 2 && tier !== 3) return null

  return {
    side: match[1] === "goodguys" ? "radiant" : "dire",
    tier,
    lane: match[3] as Lane,
  }
}

export const LANE_LABEL: Record<Lane, string> = {
  top: "Top",
  mid: "Mid",
  bot: "Bot",
}

export function towerLabel(tower: TowerId): string {
  return `T${String(tower.tier)} ${LANE_LABEL[tower.lane]}`
}

/**
 * A lane named by the role played in it rather than by where it sits.
 *
 * Top and bottom mean opposite things to the two teams: the top lane is Dire's
 * safe lane and Radiant's off lane at the same time. So an aggregate keyed on
 * "top" pools a safe-lane tower with an off-lane one and reports the mixture as
 * a tendency — which is what made the league table read as though top-lane
 * towers behaved wildly differently by side.
 */
export type LaneRole = "safe" | "mid" | "off"

/** Safe first, then mid, then off — the order a draft is talked through. */
export const LANE_ROLES: LaneRole[] = ["safe", "mid", "off"]

export const LANE_ROLE_LABEL: Record<LaneRole, string> = {
  safe: "Safe",
  mid: "Mid",
  off: "Off",
}

const ROLE_BY_SIDE: Record<MapSide, Record<Lane, LaneRole>> = {
  radiant: { bot: "safe", mid: "mid", top: "off" },
  dire: { top: "safe", mid: "mid", bot: "off" },
}

const LANE_BY_SIDE: Record<MapSide, Record<LaneRole, Lane>> = {
  radiant: { safe: "bot", mid: "mid", off: "top" },
  dire: { safe: "top", mid: "mid", off: "bot" },
}

/**
 * The role a lane plays for the side that owns the building in it.
 *
 * Keyed on the owner's side, not the attacker's: a tower's lane role is a fact
 * about whose base it defends.
 */
export function laneRoleOf(side: MapSide, lane: Lane): LaneRole {
  return ROLE_BY_SIDE[side][lane]
}

/** The inverse, for reading side-keyed league figures back out by role. */
export function laneForRole(side: MapSide, role: LaneRole): Lane {
  return LANE_BY_SIDE[side][role]
}

/**
 * A tower slot as a scouting question asks about it: "their T1 safe lane", "the
 * enemy's T3 off lane".
 *
 * Distinct from `TowerId`, and the distinction is the whole point. A `TowerId`
 * names a building on the map — Radiant's T1 mid — while a slot names a role
 * two buildings can fill. The scouted team is Radiant in some games and Dire in
 * others, so one building is theirs in half the sample and the opposition's in
 * the other half, and it is their safe lane in half and their off lane in the
 * other half. Anything aggregating across games has to key on the slot;
 * anything drawing on the map has to key on the id.
 */
export type TowerSlot = {
  tier: RenderedTier
  laneRole: LaneRole
  /** True when the slot is the scouted team's own tower. */
  ownedByTeam: boolean
}

/** All eighteen slots: nine towers, theirs and the enemy's. */
export const ALL_TOWER_SLOTS: TowerSlot[] = [true, false].flatMap(ownedByTeam =>
  RENDERED_TIERS.flatMap(tier =>
    LANE_ROLES.map(laneRole => ({ tier, laneRole, ownedByTeam })),
  ),
)

export function slotKey(slot: TowerSlot): string {
  return `${slot.ownedByTeam ? "theirs" : "enemy"}-${slot.laneRole}-${String(slot.tier)}`
}

export function slotLabel(slot: TowerSlot): string {
  return `T${String(slot.tier)} ${LANE_ROLE_LABEL[slot.laneRole]}`
}

/** The slot a fall belongs to, given who owned the building in that game. */
export function slotOf(tower: TowerId, ownedByTeam: boolean): TowerSlot {
  return {
    tier: tower.tier,
    laneRole: laneRoleOf(tower.side, tower.lane),
    ownedByTeam,
  }
}

// ---------------------------------------------------------------------------
// Roshan and the Tormentor
// ---------------------------------------------------------------------------

/**
 * The two Roshan pits, read off the shipped minimap art.
 *
 * `north` is the lava-lit pit in the upper-left stretch of the river; `south` is
 * the open rock horseshoe in the lower-right stretch. Named by their position on
 * the image, because that is the only thing the map itself asserts.
 * Which name goes with which pit was settled empirically, not from the art. The
 * lava-lit pit in the upper-left stretch of the river is "south" and the open
 * rock horseshoe in the lower-right stretch is "north" — the reverse of what the
 * image suggests, and the reverse of what this file first assumed.
 *
 * The check: for every Roshan kill in a 7.41+ game, take the killing team's
 * wards placed shortly beforehand and still alive, and see which pit they
 * cluster around. That is a strong signal because teams ward the pit they are
 * about to take. Across 343 kills the deduced pit matched the warded one 85–99%
 * of the time under this labelling and 1–15% under the other, holding across
 * every window and radius tried; at the tightest setting — wards placed within
 * 90 seconds and inside 7% of the map — it was 99% over 83 decisive kills.
 */
export const ROSHAN_PITS: Record<"north" | "south", Point> = {
  north: { x: 0.665, y: 0.655 },
  south: { x: 0.3, y: 0.34 },
}

/**
 * The two Tormentor spots.
 *
 * UNVERIFIED, unlike the Roshan pits. The minimap carries four identical rock
 * formations — two on the Radiant side of the river, two on the Dire side — and
 * the art alone cannot say which pair is the Tormentor and which is the Outpost.
 * The other candidate pair is
 * { north: {x: 0.758, y: 0.437}, south: {x: 0.235, y: 0.545} }.
 *
 * This pair is the one aligned along the river axis the way the Roshan pits are,
 * which is what "always opposite Roshan" implies — each spot sits at the far end
 * of that axis from the pit it pairs with. Swap the two constants if the markers
 * land on the Outposts instead; nothing else needs to change.
 *
 * The same ward-cluster check that settled the Roshan pits cannot settle these:
 * teams do not reliably ward a Tormentor before killing it, so there is no
 * signal to test against.
 */
export const TORMENTOR_SPOTS: Record<"north" | "south", Point> = {
  north: { x: 0.414, y: 0.725 },
  south: { x: 0.548, y: 0.262 },
}

export type PitSide = "north" | "south"

/**
 * Roshan relocates on every 5-minute boundary.
 *
 * Confirmed against the ward-cluster check described on ROSHAN_PITS by fitting
 * the period rather than assuming it: sweeping 60..900s, only 300 stands out
 * (91% agreement, against roughly 50% — noise — at 150s, 420s and 600s).
 */
const PIT_PERIOD_SECONDS = 300

/**
 * Patch-keyed pit rules, newest first.
 *
 * A table rather than a constant because the rule is patch-specific and half
 * this database predates the patch it was confirmed on. Filling in an older
 * patch later is a data edit here, not a change to any caller.
 *
 * `startPit` is where Roshan is during the first period; he alternates from
 * there. The Tormentor is always in the opposite location.
 */
export const PIT_RULES: {
  minPatch: number
  patchName: string
  startPit: PitSide
}[] = [{ minPatch: 60, patchName: "7.41", startPit: "south" }]

/**
 * Where Roshan is at `time`, or null when no rule covers that patch.
 *
 * Evaluated on the clock at the moment of death, not at spawn. That is what
 * makes the position knowable at all: Roshan moves on every 5-minute boundary
 * regardless of when he spawned, whereas respawn is a random 8–11 minute window
 * that straddles the boundary and would leave most kills ambiguous.
 *
 * Returning null rather than guessing is the point. Only 176 of 355 matches in
 * this database are 7.41 or later, and a scouting tool that draws the wrong pit
 * on the older half is worse than one that draws nothing.
 */
export function roshanPitAt(
  time: number,
  patch: number | null,
): PitSide | null {
  if (patch === null) return null
  const rule = PIT_RULES.find(r => patch >= r.minPatch)
  if (!rule) return null

  // Floor, not truncate: pre-horn seconds are negative and must not fold onto
  // period 0 alongside the first five minutes.
  const period = Math.floor(time / PIT_PERIOD_SECONDS)
  const flipped = ((period % 2) + 2) % 2 === 1
  const other: Record<PitSide, PitSide> = { north: "south", south: "north" }
  return flipped ? other[rule.startPit] : rule.startPit
}

/** The Tormentor sits opposite Roshan, so it follows the same clock. */
export function tormentorSpotAt(
  time: number,
  patch: number | null,
): PitSide | null {
  const roshan = roshanPitAt(time, patch)
  if (roshan === null) return null
  return roshan === "north" ? "south" : "north"
}
