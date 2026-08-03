import type { Dispatch, SetStateAction } from "react"
import { getHero } from "../../utils/get-hero"
import { formatGameTime } from "../../utils/ward-aggregation"
import { wardToFraction } from "../../utils/ward-map"
import { sampleIndexAt } from "../../../shared/position-codec"
import type { DecodedMatch } from "../../utils/movement"
import type { PositionEvent } from "./positions-api"

export type HoveredHero = {
  x: number
  y: number
  label: string
  detail: string
}

/** Their side and the other one. Not Radiant/Dire: the question is always "us". */
const OWN_COLOR = "#f87171"
const ENEMY_COLOR = "#60a5fa"

/**
 * Markers we draw, and how they read.
 *
 * Only the events with a position survive to here. Building kills, scans and
 * glyphs are stored without coordinates — a building's location comes from its
 * name and a scan has no actor at all — so they are absent by construction
 * rather than by filtering.
 */
const EVENT_STYLE: Record<
  string,
  { color: string; label: string } | undefined
> = {
  hero_death: { color: "#ef4444", label: "Death" },
  smoke: { color: "#c084fc", label: "Smoke" },
  roshan: { color: "#fbbf24", label: "Roshan" },
  tormentor: { color: "#c084fc", label: "Tormentor" },
  firstblood: { color: "#ef4444", label: "First blood" },
  buyback: { color: "#34d399", label: "Buyback" },
  rune_pickup: { color: "#38bdf8", label: "Rune" },
}

export const PlaybackLayer = ({
  decoded,
  teamId,
  time,
  events,
  size,
  setHovered,
}: {
  decoded: DecodedMatch
  teamId: number
  time: number
  events: PositionEvent[]
  size: number
  setHovered: Dispatch<SetStateAction<HoveredHero | null>>
}) => {
  const index = sampleIndexAt(decoded.positions, time)
  if (index < 0) return null

  return (
    <>
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

      {decoded.match.slots.map(slot => {
        const track = decoded.positions.slots.at(slot.slot)
        if (!track) return null
        const { x, y } = wardToFraction({
          x: track.x[index],
          y: track.y[index],
        })
        const isOwn = slot.teamId === teamId
        const color = isOwn ? OWN_COLOR : ENEMY_COLOR
        const dead = track.dead[index] === 1
        const hero = getHero(slot.heroId)

        return (
          <g
            key={slot.slot}
            onMouseEnter={() => {
              setHovered({
                x,
                y,
                label: hero,
                detail: `${slot.playerName ?? "Unknown"}${dead ? " · dead" : ""}`,
              })
            }}
            onMouseLeave={() => {
              // Only clear our own hero: sliding onto a neighbouring dot lands
              // its enter before this leave, and a blind reset would blank it.
              setHovered(prev => (prev?.label === hero ? null : prev))
            }}
          >
            {/* Dark halo first: terrain runs from bright jungle to near-black
                river, and one flat colour vanishes against one or the other. */}
            <circle
              cx={x * size}
              cy={y * size}
              r={7}
              fill="none"
              stroke="#020617"
              strokeOpacity={0.85}
              strokeWidth={2}
            />
            <circle
              cx={x * size}
              cy={y * size}
              r={6}
              fill={color}
              // Dead heroes stay on the map rather than disappearing: a corpse
              // where a hero fell is the most informative thing on the screen
              // just after a fight, and hiding it makes a wipe look like a
              // rotation.
              fillOpacity={dead ? 0.15 : 0.85}
              stroke="#f8fafc"
              strokeOpacity={dead ? 0.4 : 0.9}
              strokeWidth={1.5}
              strokeDasharray={dead ? "2 1.5" : undefined}
            />
            <circle
              cx={x * size}
              cy={y * size}
              r={11}
              fill="transparent"
              stroke="none"
            />
          </g>
        )
      })}
    </>
  )
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
        const style = EVENT_STYLE[event.type]
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
