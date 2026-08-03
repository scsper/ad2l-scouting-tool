import { formatGameTime } from "../../utils/ward-aggregation"
import type { ObjectiveTick } from "../../utils/objective-aggregation"
import {
  ENEMY_COLOR,
  ROSHAN_COLOR,
  SCOUTED_COLOR,
  TORMENTOR_COLOR,
} from "../../utils/map-colors"

function tickColor(tick: ObjectiveTick): string {
  if (tick.kind === "roshan") return ROSHAN_COLOR
  if (tick.kind === "tormentor") return TORMENTOR_COLOR
  return tick.ownedByTeam ? SCOUTED_COLOR : ENEMY_COLOR
}

function tickTitle(tick: ObjectiveTick, aggregate: boolean): string {
  const who = tick.ownedByTeam ? "theirs" : "enemy"
  const when = formatGameTime(tick.time)

  if (tick.kind !== "tower") {
    return `${tick.label} · ${tick.ownedByTeam ? "taken by them" : "taken by opponent"} · ${when}`
  }
  if (!aggregate) return `${tick.label} (${who}) · ${when}`

  // The fall rate travels with the median everywhere it is shown. Tower fall
  // times are right-censored, so a median over only the games where the tower
  // fell reads fast; "median 31:20 · fell in 4 of 11" is interpretable where a
  // bare "31:20" is quietly misleading.
  return `${tick.label} (${who}) · median ${when} · fell in ${String(tick.sampleSize)} of ${String(tick.totalGames)}`
}

/**
 * Objective marks laid over the time slider.
 *
 * Positioned in the same fraction-of-range space the range input uses, so a tick
 * and the slider thumb agree about where a moment sits. Clicking one seeks to
 * it, which is the fast path for the question this feature exists to answer:
 * what did their vision look like the moment that tower fell.
 */
export const ObjectiveTicks = ({
  ticks,
  bounds,
  aggregate,
  onSeek,
}: {
  ticks: ObjectiveTick[]
  bounds: { min: number; max: number }
  aggregate: boolean
  onSeek: (time: number) => void
}) => {
  const span = Math.max(1, bounds.max - bounds.min)

  if (ticks.length === 0) {
    return (
      <div className="h-6 flex items-center text-xs text-slate-600">
        No objective data for these games
      </div>
    )
  }

  return (
    <div className="relative h-6">
      {ticks.map(tick => {
        const fraction = (tick.time - bounds.min) / span
        if (fraction < 0 || fraction > 1) return null

        return (
          <button
            key={tick.key}
            type="button"
            onClick={() => {
              onSeek(tick.time)
            }}
            title={tickTitle(tick, aggregate)}
            aria-label={tickTitle(tick, aggregate)}
            className="absolute top-0 -translate-x-1/2 h-6 w-3 flex items-start justify-center group"
            style={{ left: `${String(fraction * 100)}%` }}
          >
            <span
              className="block w-0.5 h-3.5 rounded-sm group-hover:h-5 transition-all"
              style={{ backgroundColor: tickColor(tick) }}
            />
          </button>
        )
      })}
    </div>
  )
}
