import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react"

/**
 * Whether the chrome should be out of the way right now.
 *
 * Only meaningful on a phone, where the document is what scrolls — at `md` and
 * up the shell clips its own overflow and `window` never moves, so this stays
 * `false` and the chrome never translates.
 *
 * The threshold is what keeps it from flickering. Without it, the one-pixel
 * jitter of a finger resting on a moving list toggles the header on every frame.
 * `lastY` only advances once a move clears the threshold, so slow drags
 * accumulate into one decision rather than being repeatedly discarded.
 */
export function useHideOnScroll(threshold = 8) {
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)

  useEffect(() => {
    lastY.current = window.scrollY
    let frame = 0

    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const y = window.scrollY
        const delta = y - lastY.current

        // Near the top there is no screen to reclaim, and hiding here fights
        // the overscroll bounce — which reports as an upward scroll and would
        // otherwise flash the chrome away the instant you pull down.
        if (y < 64) {
          lastY.current = y
          setHidden(false)
          return
        }

        if (Math.abs(delta) < threshold) return

        lastY.current = y
        setHidden(delta > 0)
      })
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [threshold])

  return hidden
}

/**
 * Where a nested route puts UI that belongs to the chrome rather than the page.
 *
 * The team tab strip is rendered by `TeamLayout`, two route levels below the
 * header, but on a phone the two have to hide and return as one block — a tab
 * bar that slides away independently means "change tabs" costs a scroll to the
 * top of whatever board you were reading. A portal is what lets the tab strip
 * stay owned by the route that knows the team scope while living in the DOM
 * next to the header.
 */
const ChromeSlotContext = createContext<HTMLDivElement | null>(null)

export const useChromeSlot = () => useContext(ChromeSlotContext)

/**
 * The header and whatever the current route hangs beneath it, as one sticky
 * unit that gets out of the way when you scroll down and comes back when you
 * scroll up.
 *
 * Sticky *and* translated: sticky pins it while you read, the translate is what
 * removes it. At `md` and up neither applies — `useHideOnScroll` never fires
 * there, and `md:translate-y-0` makes that explicit rather than incidental.
 *
 * The opaque background only exists on the phone tier. At `md` and up the
 * chrome sits above a separate scrolling region and nothing ever passes behind
 * it; below `md` the whole page slides underneath, and the header's own
 * `bg-slate-800/50` is too sheer to read text through.
 */
export const StickyChrome = ({ children }: PropsWithChildren) => {
  const hidden = useHideOnScroll()
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)

  return (
    <ChromeSlotContext.Provider value={slot}>
      <div
        className={`sticky top-0 z-20 transition-transform duration-200 max-md:bg-slate-900/95 max-md:backdrop-blur-sm md:translate-y-0 ${
          hidden ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        {children}
        <div ref={setSlot} />
      </div>
    </ChromeSlotContext.Provider>
  )
}
