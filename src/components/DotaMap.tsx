import type { ReactNode } from "react"

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
}: {
  src: string
  size: number
  label: string
  children?: ReactNode
  overlay?: ReactNode
}) => (
  <div className="relative" style={{ width: size, maxWidth: "100%" }}>
    <svg
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      width="100%"
      className="rounded border border-slate-700 bg-slate-900"
      role="img"
      aria-label={label}
    >
      <image href={src} x={0} y={0} width={size} height={size} />
      {children}
    </svg>
    {overlay}
  </div>
)
