import { useState, type ReactNode } from "react"
import { MapInspector } from "./MapInspector"

/**
 * The minimap frame both map tabs draw on.
 *
 * Extracted rather than duplicated because the frame and the coordinate
 * transform are a matched pair: `wardToFraction` is OpenDota's `gameCoordToUV`
 * verbatim, and the images in `public/map/` are OpenDota's crops. A second
 * hand-rolled `<svg>` with its own viewBox is how the two silently drift apart
 * and every dot lands a few pixels off on one tab only.
 *
 * `children` are SVG and share the 0..`size` coordinate space. `overlay` is HTML
 * layered above the SVG, which is where tooltips go — an SVG `<title>` waits a
 * second, renders unstyled, and cannot be read while scrubbing a slider.
 */
export const DotaMap = ({
  src,
  size,
  label,
  children,
  overlay,
  controls,
  onBackgroundTap,
}: {
  src: string
  size: number
  label: string
  children?: ReactNode
  overlay?: ReactNode
  /**
   * Transport to carry into the full-screen view. Passed rather than read from
   * the page because the page's copy is scrolled away behind the overlay.
   */
  controls?: ReactNode
  /**
   * Put down whatever card is open. Bound to the terrain rather than the
   * document: with no pointer to move away, a tapped-open tooltip otherwise has
   * no way to close except by opening a different one.
   */
  onBackgroundTap?: () => void
}) => {
  const [isInspecting, setIsInspecting] = useState(false)

  return (
    <div className="relative" style={{ width: size, maxWidth: "100%" }}>
      <svg
        viewBox={`0 0 ${String(size)} ${String(size)}`}
        width="100%"
        className="rounded border border-slate-700 bg-slate-900"
        role="img"
        aria-label={label}
      >
        <image
          href={src}
          x={0}
          y={0}
          width={size}
          height={size}
          onClick={onBackgroundTap}
        />
        {children}
      </svg>
      {overlay}

      {/* Phone only: at `md` and up the map is already near its drawn size, and
          the pointer can hit a 3.5px sentry without help. */}
      <button
        onClick={() => {
          setIsInspecting(true)
        }}
        className="md:hidden absolute bottom-2 right-2 rounded-md bg-slate-900/85 border border-slate-600 px-2.5 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-sm"
      >
        Inspect
      </button>

      {isInspecting && (
        <MapInspector
          src={src}
          size={size}
          label={label}
          overlay={overlay}
          controls={controls}
          onBackgroundTap={onBackgroundTap}
          onClose={() => {
            setIsInspecting(false)
          }}
        >
          {children}
        </MapInspector>
      )}
    </div>
  )
}
