import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

const MIN_SCALE = 1
const MAX_SCALE = 6

type View = { scale: number; x: number; y: number }

const IDENTITY: View = { scale: 1, x: 0, y: 0 }

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y)

/**
 * The map, full screen, with pinch-zoom and pan.
 *
 * Both map tabs draw at `size = 640` and shrink to fit, which on a phone is
 * about 55%. Ward dots are drawn at `r = 3.5` for a sentry — under 2px once
 * scaled — and the clusters that matter most (the Roshan pit, the T1
 * approaches) are exactly the ones that overlap into a blob at that size.
 *
 * A separate screen rather than zooming the map in place, because in place
 * there is no gesture left to zoom with: the map sits in a vertically scrolling
 * document, so one finger has to mean "scroll the page". Two-finger pan is a
 * gesture nobody tries, so the map would read as unzoomable. In here one finger
 * pans, because there is nothing else it could mean.
 */
export const MapInspector = ({
  src,
  size,
  label,
  children,
  overlay,
  controls,
  onBackgroundTap,
  onClose,
}: {
  src: string
  size: number
  label: string
  children?: ReactNode
  overlay?: ReactNode
  /** Playback transport, when the tab has one. A zoomed fight you cannot advance is half a feature. */
  controls?: ReactNode
  onBackgroundTap?: () => void
  onClose: () => void
}) => {
  const [view, setView] = useState<View>(IDENTITY)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; scale: number } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  const positions = () => [...pointers.current.values()]

  const onPointerDown = (e: React.PointerEvent) => {
    // Registered before the capture, and the capture allowed to fail: it throws
    // if the pointer is already gone by the time this runs, and losing the
    // gesture entirely is a far worse outcome than losing events once a finger
    // has left the element.
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Capture is an optimisation here, not the mechanism.
    }
    if (pointers.current.size === 2) {
      const [a, b] = positions()
      pinch.current = { dist: distance(a, b), scale: view.scale }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const previous = pointers.current.get(e.pointerId)
    if (!previous) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = positions()
      const ratio = distance(a, b) / (pinch.current.dist || 1)
      const scale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, pinch.current.scale * ratio),
      )
      // Snapping the offset back at 1× keeps a pinch-out-then-in from leaving
      // the map parked off-centre with no way to tell it is off-centre.
      setView(current =>
        scale === MIN_SCALE ? IDENTITY : { ...current, scale },
      )
      return
    }

    if (pointers.current.size === 1) {
      setView(current =>
        current.scale === MIN_SCALE
          ? current
          : {
              ...current,
              x: current.x + (e.clientX - previous.x),
              y: current.y + (e.clientY - previous.y),
            },
      )
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  // Portalled to `body`, which is not optional here. Both map tabs draw inside a
  // panel carrying `backdrop-blur-sm`, and any `backdrop-filter` makes that
  // element the containing block for its `fixed` descendants — so without this
  // the "full screen" overlay is full-panel, and lands halfway down the page.
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
        <span className="text-sm font-medium text-slate-200 truncate">
          {label}
        </span>
        <div className="flex items-center gap-3 shrink-0">
          {view.scale > MIN_SCALE && (
            <button
              onClick={() => {
                setView(IDENTITY)
              }}
              className="text-xs text-slate-400 px-2 py-1 rounded border border-slate-700"
            >
              Reset
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 -m-2 p-2"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* `touch-none` hands every gesture in here to the handlers above. Without
          it the browser claims the pinch for its own page zoom and the map
          never sees it. */}
      <div
        className="flex-1 overflow-hidden touch-none flex items-center justify-center"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="relative w-full"
          style={{
            transform: `translate(${String(view.x)}px, ${String(view.y)}px) scale(${String(view.scale)})`,
            transformOrigin: "center",
          }}
        >
          <svg
            viewBox={`0 0 ${String(size)} ${String(size)}`}
            width="100%"
            className="bg-slate-900"
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
        </div>
      </div>

      {controls && (
        <div className="shrink-0 border-t border-slate-800 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {controls}
        </div>
      )}
    </div>,
    document.body,
  )
}
