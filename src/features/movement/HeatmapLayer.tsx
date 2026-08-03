import { useMemo } from "react"
import type { Heatmap } from "../../utils/movement"

/**
 * Colour ramp, cold to hot, with alpha rising alongside it.
 *
 * Alpha has to ramp too, not just hue: this is drawn over a detailed terrain
 * image, and a fully opaque cold colour would erase the map under every cell a
 * player merely passed through, which is most of them.
 */
const RAMP: { stop: number; rgba: [number, number, number, number] }[] = [
  { stop: 0.0, rgba: [59, 130, 246, 0] },
  { stop: 0.15, rgba: [59, 130, 246, 0.45] },
  { stop: 0.4, rgba: [34, 211, 238, 0.6] },
  { stop: 0.68, rgba: [250, 204, 21, 0.78] },
  { stop: 1.0, rgba: [239, 68, 68, 0.92] },
]

function rampAt(t: number): [number, number, number, number] {
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i].stop) {
      const lo = RAMP[i - 1]
      const hi = RAMP[i]
      const f = (t - lo.stop) / (hi.stop - lo.stop || 1)
      return [
        lo.rgba[0] + (hi.rgba[0] - lo.rgba[0]) * f,
        lo.rgba[1] + (hi.rgba[1] - lo.rgba[1]) * f,
        lo.rgba[2] + (hi.rgba[2] - lo.rgba[2]) * f,
        lo.rgba[3] + (hi.rgba[3] - lo.rgba[3]) * f,
      ]
    }
  }
  return RAMP[RAMP.length - 1].rgba
}

/**
 * Render the bins to a data URL at grid resolution.
 *
 * A 96x96 `<image>` scaled up by the SVG, rather than 9,216 `<rect>` elements.
 * The rects would be correct and would also re-reconcile the whole grid on
 * every drag of the range slider; one image element re-renders as one attribute
 * change, and the browser's bilinear upscale gives the smoothing a heatmap
 * wants for free.
 */
function toDataUrl(heatmap: Heatmap): string | null {
  const canvas = document.createElement("canvas")
  canvas.width = heatmap.size
  canvas.height = heatmap.size

  // jsdom does not implement canvas and THROWS from getContext rather than
  // returning null, so a null check alone would not survive the test run. The
  // rest of the tab is useful without the heatmap image, so a missing canvas
  // degrades to no layer rather than to a blank page.
  let context: CanvasRenderingContext2D | null = null
  try {
    context = canvas.getContext("2d")
  } catch {
    return null
  }
  if (!context) return null

  const image = context.createImageData(heatmap.size, heatmap.size)
  for (let i = 0; i < heatmap.bins.length; i++) {
    const value = heatmap.bins[i]
    if (value === 0) continue
    // Square root rather than linear: occupancy is heavily skewed, and a linear
    // ramp leaves everything outside the two or three hottest cells looking
    // uniformly cold.
    const t = Math.min(1, Math.sqrt(value / heatmap.ceiling))
    const [r, g, b, a] = rampAt(t)
    image.data[i * 4] = r
    image.data[i * 4 + 1] = g
    image.data[i * 4 + 2] = b
    image.data[i * 4 + 3] = Math.round(a * 255)
  }
  context.putImageData(image, 0, 0)
  return canvas.toDataURL()
}

export const HeatmapLayer = ({
  heatmap,
  size,
}: {
  heatmap: Heatmap
  size: number
}) => {
  const href = useMemo(() => toDataUrl(heatmap), [heatmap])
  if (href === null || heatmap.samples === 0) return null

  return (
    <image
      href={href}
      x={0}
      y={0}
      width={size}
      height={size}
      preserveAspectRatio="none"
      style={{ imageRendering: "auto" }}
    />
  )
}

/** Legend for the ramp. Unlabelled by design — see the note in `Movement`. */
export const HeatmapLegend = () => (
  <span className="flex items-center gap-1.5 text-xs text-slate-400">
    Less time
    <span
      className="inline-block h-2 w-24 rounded-sm"
      style={{
        background:
          "linear-gradient(to right, rgba(59,130,246,0.45), rgba(34,211,238,0.6), rgba(250,204,21,0.78), rgba(239,68,68,0.92))",
      }}
    />
    More
  </span>
)
