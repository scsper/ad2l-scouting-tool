import { useState, type Dispatch, type SetStateAction } from "react"
import { getHero } from "../../utils/get-hero"
import { POSITION_LABELS, formatGameTime } from "../../utils/ward-aggregation"
import { isAliveAt, wardToFraction, wasDewarded } from "../../utils/ward-map"
import { sampleIndexAt } from "../../../shared/position-codec"
import {
  ENEMY_COLOR,
  HALO_COLOR,
  OBSERVER_COLOR,
  ROSHAN_COLOR,
  SCOUTED_COLOR,
  SENTRY_COLOR,
  TORMENTOR_COLOR,
} from "../../utils/map-colors"
import { slotIsScouted, type ActiveNeutral } from "../../utils/playback-objects"
import type { PlaybackWard } from "../../utils/playback-objects"
import type { DecodedMatch } from "../../utils/movement"
import type { PositionEvent } from "./positions-api"
import type { HoveredObjective } from "../wards/TowerLayer"

/**
 * One hover card, for every kind of mark on the map.
 *
 * `id` is what distinguishes them, and it exists because the clear-guard below
 * needs something stable to compare. It used to compare the display label,
 * which was fine while heroes were the only hoverable thing and stops being
 * fine the moment a ward, a tower and a Roshan marker share the overlay.
 */
export type HoveredMark = {
  x: number
  y: number
  id: string
  label: string
  detail: string
}

/**
 * Markers that flash for a few seconds around the playhead.
 *
 * Only events with a position are here. Building kills, scans and glyphs are
 * stored without coordinates — a building's location comes from its name and a
 * scan has no actor at all — so they are absent by construction.
 *
 * Rune pickups and buybacks used to be drawn and are not any more. Neither
 * position says anything: a buyback is always the fountain and a rune is always
 * one of four fixed spots, so both were ink spent restating the mark's own
 * label. Both still appear in the event list under the map, with a timestamp,
 * which is where a fact with no place on the map belongs.
 */
const EVENT_STYLE: Record<
  string,
  { color: string; label: string } | undefined
> = {
  hero_death: { color: "#ef4444", label: "Death" },
  smoke: { color: "#c084fc", label: "Smoke" },
  firstblood: { color: "#ef4444", label: "First blood" },
}

/** Kept for the event list, which lists things the map does not draw. */
const LIST_ONLY_STYLE: Record<
  string,
  { color: string; label: string } | undefined
> = {
  roshan: { color: ROSHAN_COLOR, label: "Roshan" },
  tormentor: { color: TORMENTOR_COLOR, label: "Tormentor" },
  buyback: { color: "#34d399", label: "Buyback" },
  rune_pickup: { color: "#38bdf8", label: "Rune" },
  obs: { color: OBSERVER_COLOR, label: "Observer" },
  sen: { color: SENTRY_COLOR, label: "Sentry" },
  obs_left: { color: OBSERVER_COLOR, label: "Observer down" },
  sen_left: { color: SENTRY_COLOR, label: "Sentry down" },
}

function eventStyle(type: string) {
  return EVENT_STYLE[type] ?? LIST_ONLY_STYLE[type]
}

const HERO_RADIUS = 8

/**
 * A hero, drawn as its portrait inside an allegiance ring.
 *
 * The icon carries identity and the ring carries side, which is what lets one
 * mark answer "who is that" and "whose are they" at once. Sixteen pixels is
 * about the floor for recognising a Dota icon, and it is also roughly four grid
 * units — so five heroes in a fight overlap. That is accepted rather than
 * solved by nudging them apart: this tab's only claim is that it shows where
 * they actually were, and hovering raises whichever one you point at.
 */
const HeroMark = ({
  heroId,
  cx,
  cy,
  color,
  dead,
  onEnter,
  onLeave,
}: {
  heroId: number
  cx: number
  cy: number
  color: string
  dead: boolean
  onEnter: () => void
  onLeave: () => void
}) => {
  // A hero shipped after the last run of `fetch-hero-icons` has no file. The
  // mark degrades to the flat dot this layer used to draw rather than to a
  // hole in the map.
  const [iconFailed, setIconFailed] = useState(false)
  const clipId = `hero-clip-${String(heroId)}`

  return (
    <g
      role="img"
      aria-label={getHero(heroId)}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {/* Dark halo first: terrain runs from bright jungle to near-black river,
          and one flat colour vanishes against one or the other. An icon is more
          vulnerable to this than a dot was, not less — it is many colours. */}
      <circle
        cx={cx}
        cy={cy}
        r={HERO_RADIUS + 1.5}
        fill="none"
        stroke={HALO_COLOR}
        strokeOpacity={0.85}
        strokeWidth={2.5}
      />

      {iconFailed ? (
        <circle
          cx={cx}
          cy={cy}
          r={HERO_RADIUS - 2}
          fill={color}
          fillOpacity={dead ? 0.15 : 0.85}
        />
      ) : (
        <>
          <defs>
            <clipPath id={clipId}>
              <circle cx={cx} cy={cy} r={HERO_RADIUS} />
            </clipPath>
          </defs>
          <circle cx={cx} cy={cy} r={HERO_RADIUS} fill={HALO_COLOR} />
          <image
            href={`/heroes/${String(heroId)}.png`}
            x={cx - HERO_RADIUS}
            y={cy - HERO_RADIUS}
            width={HERO_RADIUS * 2}
            height={HERO_RADIUS * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
            // Dead heroes stay on the map rather than disappearing: a corpse
            // where a hero fell is the most informative thing on the screen
            // just after a fight, and hiding it makes a wipe look like a
            // rotation. Greyscale rather than the old 0.15 opacity, which on an
            // icon leaves something you cannot identify — and identifying the
            // corpses is the whole reason they are still drawn.
            style={
              dead
                ? { filter: "grayscale(1)", opacity: 0.45 }
                : { opacity: 0.95 }
            }
            onError={() => {
              setIconFailed(true)
            }}
          />
        </>
      )}

      <circle
        cx={cx}
        cy={cy}
        r={HERO_RADIUS}
        fill="none"
        stroke={color}
        strokeOpacity={dead ? 0.5 : 1}
        strokeWidth={2}
        strokeDasharray={dead ? "2 1.5" : undefined}
      />
      <circle
        cx={cx}
        cy={cy}
        r={HERO_RADIUS + 4}
        fill="transparent"
        stroke="none"
      />
    </g>
  )
}

/**
 * A ward: type in the fill, allegiance in the ring.
 *
 * Both teams' wards are drawn, which nothing else in this app can do — the
 * Wards tab reads a column that is only populated for the scouted team. The
 * pairing of one side's placements against the other's removals is the thing
 * worth looking at here.
 */
const WardMark = ({
  placed,
  size,
  onEnter,
  onLeave,
}: {
  placed: PlaybackWard
  size: number
  onEnter: () => void
  onLeave: () => void
}) => {
  const { x, y } = wardToFraction(placed.ward)
  const isObs = placed.ward.type === "obs"
  const cx = x * size
  const cy = y * size
  const r = isObs ? 5 : 3.5
  const ring = placed.byScouted ? SCOUTED_COLOR : ENEMY_COLOR

  return (
    <g
      role="img"
      aria-label={`${isObs ? "Observer" : "Sentry"} · ${placed.byScouted ? "theirs" : "enemy"}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <circle
        cx={cx}
        cy={cy}
        r={r + 2.5}
        fill="none"
        stroke={HALO_COLOR}
        strokeOpacity={0.85}
        strokeWidth={2}
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={isObs ? OBSERVER_COLOR : SENTRY_COLOR}
        fillOpacity={0.9}
      />
      <circle
        cx={cx}
        cy={cy}
        r={r + 1.75}
        fill="none"
        stroke={ring}
        strokeOpacity={0.95}
        strokeWidth={1.5}
      />
      <circle cx={cx} cy={cy} r={r + 5} fill="transparent" stroke="none" />
    </g>
  )
}

/**
 * Roshan or the Tormentor, at the coordinates of the kill that was recorded.
 *
 * Solid rather than dashed, unlike the Wards tab's equivalent: that one is
 * dashed to signal an inferred pit, and this one is not inferring anything.
 * It fades once the respawn window opens, because from that point on "it is
 * down" is a claim we can no longer make.
 */
const NeutralKillMark = ({
  neutral,
  size,
  onEnter,
  onLeave,
}: {
  neutral: ActiveNeutral
  size: number
  onEnter: () => void
  onLeave: () => void
}) => {
  const { x, y } = wardToFraction(neutral)
  const cx = x * size
  const cy = y * size
  const color = neutral.kind === "roshan" ? ROSHAN_COLOR : TORMENTOR_COLOR

  return (
    <g
      role="img"
      aria-label={`${neutral.kind === "roshan" ? "Roshan" : "Tormentor"} killed`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <circle
        cx={cx}
        cy={cy}
        r={8}
        fill="none"
        stroke={HALO_COLOR}
        strokeOpacity={0.85}
        strokeWidth={3.5}
      />
      <circle
        cx={cx}
        cy={cy}
        r={8}
        fill={color}
        fillOpacity={neutral.fading ? 0.08 : 0.25}
        stroke={color}
        strokeOpacity={neutral.fading ? 0.4 : 0.95}
        strokeWidth={2}
        strokeDasharray={neutral.fading ? "3 2" : undefined}
      />
      <circle cx={cx} cy={cy} r={12} fill="transparent" stroke="none" />
    </g>
  )
}

export const PlaybackLayer = ({
  decoded,
  isRadiant,
  time,
  events,
  wards,
  neutrals,
  size,
  hovered,
  setHovered,
}: {
  decoded: DecodedMatch
  /** Which side the scouted team played, which is what makes a slot theirs. */
  isRadiant: boolean
  time: number
  /** The trailing window of transient markers. */
  events: PositionEvent[]
  /** Every ward in the game; this layer decides which are standing. */
  wards: PlaybackWard[]
  neutrals: ActiveNeutral[]
  size: number
  hovered: HoveredMark | null
  setHovered: Dispatch<SetStateAction<HoveredMark | null>>
}) => {
  const index = sampleIndexAt(decoded.positions, time)
  if (index < 0) return null

  // Sliding straight onto a neighbouring mark lands its enter before this one's
  // leave, so a blind reset would blank the card that just opened.
  const leave = (id: string) => () => {
    setHovered(prev => (prev?.id === id ? null : prev))
  }

  const aliveWards = wards.filter(w => isAliveAt(w.ward, time))

  /**
   * Hovered hero drawn last so it sits on top of the pile.
   *
   * This is what makes overlapping icons workable without moving any of them:
   * in a fight the icons stack, and pointing at one raises it rather than
   * relocating it.
   */
  const slots = [...decoded.match.slots].sort((a, b) => {
    const aHot = hovered?.id === `hero:${String(a.slot)}` ? 1 : 0
    const bHot = hovered?.id === `hero:${String(b.slot)}` ? 1 : 0
    return aHot - bHot
  })

  return (
    <>
      {aliveWards.map(placed => {
        const id = `ward:${placed.ward.type}:${placed.ward.x.toFixed(2)}:${placed.ward.y.toFixed(2)}:${String(placed.ward.placed)}`
        const dewarded = wasDewarded(placed.ward)
        const { x, y } = wardToFraction(placed.ward)
        const fate =
          placed.ward.left === null
            ? "lasted the game"
            : `${dewarded ? "dewarded" : "expired"} ${formatGameTime(placed.ward.left)}`
        return (
          <WardMark
            key={id}
            placed={placed}
            size={size}
            onEnter={() => {
              setHovered({
                x,
                y,
                id,
                label: `${placed.ward.type === "obs" ? "Observer" : "Sentry"} · ${placed.byScouted ? "theirs" : "enemy"}`,
                detail: `Placed ${formatGameTime(placed.ward.placed)} · ${fate}`,
              })
            }}
            onLeave={leave(id)}
          />
        )
      })}

      {neutrals.map(neutral => {
        const id = `neutral:${neutral.kind}:${String(neutral.time)}`
        const { x, y } = wardToFraction(neutral)
        const name = neutral.kind === "roshan" ? "Roshan" : "Tormentor"
        return (
          <NeutralKillMark
            key={id}
            neutral={neutral}
            size={size}
            onEnter={() => {
              setHovered({
                x,
                y,
                id,
                label: `${name} · taken by ${neutral.byScouted ? "them" : "the opponent"}`,
                detail: `Killed ${formatGameTime(neutral.time)}${neutral.fading ? " · may have respawned" : ""}`,
              })
            }}
            onLeave={leave(id)}
          />
        )
      })}

      {events.map((event, i) => {
        const style = EVENT_STYLE[event.type]
        if (!style || event.x === null || event.y === null) return null
        const { x, y } = wardToFraction({ x: event.x, y: event.y })
        return (
          <g key={`${event.type}-${String(event.time)}-${String(i)}`}>
            <circle
              cx={x * size}
              cy={y * size}
              r={9}
              fill="none"
              stroke={style.color}
              strokeOpacity={0.75}
              strokeWidth={1.5}
              strokeDasharray="2 2"
            />
            <circle
              cx={x * size}
              cy={y * size}
              r={2}
              fill={style.color}
              fillOpacity={0.9}
            />
          </g>
        )
      })}

      {slots.map(slot => {
        const track = decoded.positions.slots.at(slot.slot)
        if (!track) return null
        const { x, y } = wardToFraction({
          x: track.x[index],
          y: track.y[index],
        })
        // Slot parity, not `teamId`: `match_player` rows go missing for whole
        // sides of a match, and reading ownership off a null there used to
        // paint the scouted team as the enemy.
        const isScouted = slotIsScouted(slot.slot, isRadiant)
        const dead = track.dead[index] === 1
        const id = `hero:${String(slot.slot)}`
        // Falls back to the raw code rather than a blank, matching the roster
        // dropdown: an unmapped position is worth seeing, not hiding.
        const role =
          slot.position === null
            ? null
            : (POSITION_LABELS[slot.position] ?? slot.position)

        return (
          <HeroMark
            key={slot.slot}
            heroId={slot.heroId}
            cx={x * size}
            cy={y * size}
            color={isScouted ? SCOUTED_COLOR : ENEMY_COLOR}
            dead={dead}
            onEnter={() => {
              setHovered({
                x,
                y,
                id,
                label: getHero(slot.heroId),
                detail: `${slot.playerName ?? "Unknown"}${
                  role === null ? "" : ` (${role})`
                }${dead ? " · dead" : ""}`,
              })
            }}
            onLeave={leave(id)}
          />
        )
      })}
    </>
  )
}

/**
 * Bridge the shared hover state to `TowerLayer`, which is reused verbatim from
 * the Wards tab and speaks `HoveredObjective`.
 *
 * The alternative was giving that layer an id-aware hover, which would mean
 * two map tabs drawing towers through two different components — the exact
 * divergence reusing it was meant to avoid.
 */
export function towerHoverAdapter(
  setHovered: Dispatch<SetStateAction<HoveredMark | null>>,
): Dispatch<SetStateAction<HoveredObjective | null>> {
  return update => {
    setHovered(prev => {
      const asObjective: HoveredObjective | null = prev?.id.startsWith("tower:")
        ? { label: prev.label, detail: prev.detail, x: prev.x, y: prev.y }
        : null
      const next = typeof update === "function" ? update(asObjective) : update
      return next === null ? null : { ...next, id: `tower:${next.label}` }
    })
  }
}

/** One line per event in the trailing window, under the map. */
export const PlaybackEventList = ({
  events,
  slotName,
}: {
  events: PositionEvent[]
  slotName: (slot: number | null) => string
}) => {
  if (events.length === 0) {
    return <span className="text-slate-600">Nothing in the last 20s</span>
  }
  return (
    <>
      {events.map((event, i) => {
        const style = eventStyle(event.type)
        return (
          <span
            key={`${event.type}-${String(event.time)}-${String(i)}`}
            className="mr-3 whitespace-nowrap"
            style={{ color: style?.color ?? "#94a3b8" }}
          >
            {formatGameTime(event.time)} {style?.label ?? event.type}
            {event.slot !== null ? ` · ${slotName(event.slot)}` : ""}
          </span>
        )
      })}
    </>
  )
}
