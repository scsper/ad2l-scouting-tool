import { useState } from "react"
import { createPortal } from "react-dom"

/**
 * A hero row on a stats board, and the card that explains its number on hover.
 *
 * An overlay rather than the native `title` attribute, for the reason the ward
 * map already found — "the native tooltip waits a second, renders unstyled" —
 * plus one this screen found the hard way: it did not appear at all. Every one
 * of the 135 rows carried a correct, non-empty `title` and not one of them ever
 * produced a tooltip. Rather than keep guessing at which of the browser's
 * conditions for showing one went unmet, the boards now draw their own, which
 * depends on nothing but the mouse events that already drive `hover:` styling.
 *
 * Portalled to the body and positioned against the viewport, because the boards
 * are eight separate rounded cards in a grid: a card-relative overlay would be
 * clipped by whichever card it grew out of, and a long breakdown is taller than
 * the row it belongs to.
 */
const HoverCard = ({ text, x, y }: { text: string; x: number; y: number }) => {
  // Flip toward the middle near the edges, so the card never spills off screen.
  const flipX = x > window.innerWidth * 0.6
  const flipY = y > window.innerHeight * 0.5

  return createPortal(
    <div
      role="tooltip"
      className="fixed z-50 pointer-events-none w-max max-w-[calc(100vw-1.5rem)] sm:max-w-[24rem] max-h-[calc(100dvh-2rem)] overflow-hidden whitespace-pre rounded border border-slate-600 bg-slate-900/95 px-3 py-2 text-xs leading-relaxed text-slate-300 shadow-lg"
      style={{
        left: x,
        top: y,
        transform: `translate(${flipX ? "calc(-100% - 16px)" : "16px"}, ${
          flipY ? "calc(-100% - 16px)" : "16px"
        })`,
      }}
    >
      {text}
    </div>,
    document.body,
  )
}

export const HeroRow = ({
  breakdown,
  className,
  children,
}: {
  breakdown: string
  className: string
  children: React.ReactNode
}) => {
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)

  return (
    <li
      className={className}
      // Tracked on move rather than only on enter: a row is 300px wide and the
      // card should come to you, not to wherever you crossed the edge.
      onMouseEnter={event => {
        setCursor({ x: event.clientX, y: event.clientY })
      }}
      onMouseMove={event => {
        setCursor({ x: event.clientX, y: event.clientY })
      }}
      onMouseLeave={() => {
        setCursor(null)
      }}
      // Touch has no hover, and this card is the only place the per-game
      // breakdown behind a contest rate exists — without a tap it is simply not
      // readable on a phone. Toggling, because there is no pointer to move away.
      onClick={event => {
        setCursor(current =>
          current ? null : { x: event.clientX, y: event.clientY },
        )
      }}
    >
      {children}
      {cursor && <HoverCard text={breakdown} x={cursor.x} y={cursor.y} />}
    </li>
  )
}
