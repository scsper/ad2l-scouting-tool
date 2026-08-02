import type { PropsWithChildren } from "react"

/**
 * The app's one scrolling region. The shell is `h-screen overflow-hidden`, so
 * a route that renders its own content outside this clips the overflow instead
 * of scrolling it.
 */
export const ContentArea = ({ children }: PropsWithChildren) => (
  <div className="flex-1 overflow-y-auto overflow-x-auto">
    <div className="container mx-auto px-4 py-6">{children}</div>
  </div>
)
