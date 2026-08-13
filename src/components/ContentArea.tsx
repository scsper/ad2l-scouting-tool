import type { PropsWithChildren } from "react"

/**
 * The app's one scrolling region at `md` and up. The shell is `h-dvh
 * overflow-hidden` there, so a route that renders its own content outside this
 * clips the overflow instead of scrolling it.
 *
 * On a phone it is not a scrolling region at all — the document is (see
 * `RootLayout`). The overflow properties are dropped rather than overridden,
 * because an `overflow-y-auto` element is a scroll container even when nothing
 * overflows it, and a nested one is what stops the URL bar from collapsing.
 *
 * `px-3` below `sm` buys back 8px of a 390px screen. That sounds like nothing
 * and is roughly a quarter of a numeric column on the player boards.
 */
export const ContentArea = ({ children }: PropsWithChildren) => (
  <div className="flex-1 md:overflow-y-auto md:overflow-x-auto">
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
      {children}
    </div>
  </div>
)
