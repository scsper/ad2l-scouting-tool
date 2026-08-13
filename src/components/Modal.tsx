import { useEffect } from "react"
import { createPortal } from "react-dom"

type ModalProps = {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  /** Tailwind max-width class. Defaults to the narrow width existing forms use. */
  widthClassName?: string
}

/**
 * Every dialog in the app: the four forms, the confirm, and the team picker.
 *
 * A centered box at `md` and up, a bottom sheet below it. One component rather
 * than two because a phone that shows the picker as a sheet and `Add team` as a
 * centered box is a phone where dialogs arrive from two directions for no reason
 * the reader can see.
 *
 * The sheet is capped at `85dvh` with its body scrolling internally, which is
 * also what makes it survive the software keyboard: a form taller than the
 * remaining screen scrolls rather than pushing its own submit button out of
 * reach.
 */
export const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  widthClassName = "max-w-md",
}: ModalProps) => {
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("keydown", handleEscape)

    // `overflow: hidden` alone was enough while the document never scrolled.
    // Now that it does on a phone, it is not: the body keeps its scroll offset
    // but the page it describes is unscrollable, and browsers resolve that by
    // dropping you at the top when the dialog closes. Pinning the body at a
    // negative offset and restoring the position by hand is the version that
    // returns you to the row you were looking at.
    const { body } = document
    const scrollY = window.scrollY
    const previous = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    }

    body.style.position = "fixed"
    body.style.top = `-${String(scrollY)}px`
    body.style.width = "100%"
    body.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", handleEscape)
      body.style.position = previous.position
      body.style.top = previous.top
      body.style.width = previous.width
      body.style.overflow = previous.overflow
      window.scrollTo(0, scrollY)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Portalled to `body` because a `fixed` element is positioned against the
  // nearest ancestor with a transform or filter rather than the viewport, and
  // the team picker opens from inside the header — which carries
  // `backdrop-blur-sm`. Without this the sheet is trapped in the header's box.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative flex w-full flex-col max-h-[85dvh] ${widthClassName} bg-slate-800 rounded-t-2xl md:rounded-lg border border-slate-700 shadow-2xl`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-slate-700 shrink-0">
          <h2 className="text-lg md:text-xl font-semibold text-slate-200">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-300 transition-colors -m-2 p-2"
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

        {/* Content. `overscroll-contain` stops a flick that reaches the end of
            this list from continuing into the page behind the backdrop. */}
        <div className="p-4 md:p-6 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-6">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
