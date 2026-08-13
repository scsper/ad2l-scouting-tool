import type { Dispatch, SetStateAction } from "react"
import {
  ALL_TOWERS,
  ROSHAN_PITS,
  TORMENTOR_SPOTS,
  towerKeyOf,
  towerLabel,
  towerPosition,
  type MapSide,
  type PitSide,
} from "../../utils/dota-map"
import { formatGameTime } from "../../utils/ward-aggregation"
import {
  ENEMY_COLOR,
  HALO_COLOR,
  ROSHAN_COLOR,
  SCOUTED_COLOR,
  TORMENTOR_COLOR,
} from "../../utils/map-colors"
import type { TowerFall } from "../../utils/objective-aggregation"

export type HoveredObjective = {
  label: string
  detail: string
  x: number
  y: number
}

/**
 * One tower on the map.
 *
 * Standing towers are drawn filled; destroyed ones keep their outline and lose
 * the fill. Removing the marker entirely would be the obvious alternative and is
 * wrong — the question being asked at a given slider time is "what does the map
 * look like now", and an absent tower reads as a tower you forgot to draw
 * rather than one that has already fallen.
 */
const TowerMark = ({
  x,
  y,
  size,
  color,
  standing,
  onHover,
  label,
  detail,
}: {
  x: number
  y: number
  size: number
  color: string
  standing: boolean
  label: string
  detail: string
  onHover: Dispatch<SetStateAction<HoveredObjective | null>>
}) => {
  const cx = x * size
  const cy = y * size
  const r = 5

  return (
    <g
      role="img"
      aria-label={`${label} · ${standing ? "standing" : "destroyed"}`}
      onMouseEnter={() => {
        onHover({ label, detail, x, y })
      }}
      onClick={() => {
        onHover({ label, detail, x, y })
      }}
      onMouseLeave={() => {
        onHover(prev => (prev?.label === label ? null : prev))
      }}
    >
      <rect
        x={cx - r - 1}
        y={cy - r - 1}
        width={(r + 1) * 2}
        height={(r + 1) * 2}
        fill="none"
        stroke={HALO_COLOR}
        strokeOpacity={0.85}
        strokeWidth={3}
      />
      <rect
        x={cx - r}
        y={cy - r}
        width={r * 2}
        height={r * 2}
        fill={standing ? color : "none"}
        fillOpacity={0.85}
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={standing ? 1 : 0.75}
        strokeDasharray={standing ? undefined : "2 1.5"}
      />
      {!standing && (
        <>
          <line
            x1={cx - r + 1}
            y1={cy - r + 1}
            x2={cx + r - 1}
            y2={cy + r - 1}
            stroke={color}
            strokeWidth={1.5}
          />
          <line
            x1={cx + r - 1}
            y1={cy - r + 1}
            x2={cx - r + 1}
            y2={cy + r - 1}
            stroke={color}
            strokeWidth={1.5}
          />
        </>
      )}
      <rect
        x={cx - r - 5}
        y={cy - r - 5}
        width={(r + 5) * 2}
        height={(r + 5) * 2}
        fill="transparent"
        stroke="none"
      />
    </g>
  )
}

/**
 * Towers for a single game at the given time.
 *
 * Single game only. "Is T1 mid down at 14:20" has no answer across six games —
 * it is down in four of them — so the aggregate view drops this layer rather
 * than drawing a building that is simultaneously alive and dead.
 */
export const TowerLayer = ({
  falls,
  time,
  size,
  teamSide,
  onHover,
}: {
  falls: TowerFall[]
  time: number
  size: number
  /** Which map side the scouted team played, so ownership is known for every
   *  tower rather than only for the ones that fell. */
  teamSide: MapSide
  onHover: Dispatch<SetStateAction<HoveredObjective | null>>
}) => (
  <>
    {ALL_TOWERS.map(tower => {
      const key = towerKeyOf(tower)
      const fall = falls.find(f => towerKeyOf(f.tower) === key)
      const standing = fall === undefined || time < fall.time
      // Derived from the side the team played, not from the fall record: a
      // tower that survived the game has no fall to read ownership off, and
      // defaulting those to "theirs" mislabelled half the surviving buildings.
      const owned = tower.side === teamSide
      const { x, y } = towerPosition(tower)

      return (
        <TowerMark
          key={key}
          x={x}
          y={y}
          size={size}
          color={owned ? SCOUTED_COLOR : ENEMY_COLOR}
          standing={standing}
          label={`${towerLabel(tower)} (${owned ? "theirs" : "enemy"})`}
          detail={
            fall
              ? `Destroyed ${formatGameTime(fall.time)}`
              : "Standing at game end"
          }
          onHover={onHover}
        />
      )
    })}
  </>
)

/**
 * Roshan and the Tormentor, at the pit implied by the clock.
 *
 * Drawn dashed and hollow, unlike the towers, because the position is deduced
 * rather than observed: OpenDota reports these kills with a timestamp and a
 * killing team and no coordinates at all. The style is the honest signal that
 * the marker is an inference — and it is only drawn when `pit` is non-null,
 * which the patch gate decides.
 */
export const NeutralMark = ({
  pit,
  spots,
  size,
  label,
  detail,
  color,
  onHover,
}: {
  pit: PitSide
  spots: Record<PitSide, { x: number; y: number }>
  size: number
  label: string
  detail: string
  color: string
  onHover: Dispatch<SetStateAction<HoveredObjective | null>>
}) => {
  const { x, y } = spots[pit]
  const cx = x * size
  const cy = y * size

  return (
    <g
      role="img"
      aria-label={`${label} · ${pit} pit`}
      onMouseEnter={() => {
        onHover({ label, detail, x, y })
      }}
      onClick={() => {
        onHover({ label, detail, x, y })
      }}
      onMouseLeave={() => {
        onHover(prev => (prev?.label === label ? null : prev))
      }}
    >
      <circle
        cx={cx}
        cy={cy}
        r={9}
        fill="none"
        stroke={HALO_COLOR}
        strokeOpacity={0.85}
        strokeWidth={3.5}
      />
      <circle
        cx={cx}
        cy={cy}
        r={9}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeDasharray="3 2"
      />
      <circle cx={cx} cy={cy} r={13} fill="transparent" stroke="none" />
    </g>
  )
}

export { ROSHAN_COLOR, TORMENTOR_COLOR }
export { ROSHAN_PITS, TORMENTOR_SPOTS }
