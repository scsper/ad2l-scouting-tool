import { useEffect, useId, useRef, useState } from "react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"

/** A focusable stat label, or a sortable header when onClick is supplied. */
export function StatTooltip({
  text,
  children,
  className = "",
  onClick,
}: {
  text: string
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement | null>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const open = anchor !== null
  const show = () => {
    setAnchor(trigger.current?.getBoundingClientRect() ?? null)
  }

  useEffect(() => {
    if (!open) return
    const dismiss = () => {
      setAnchor(null)
    }
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !trigger.current?.contains(event.target)
      ) {
        dismiss()
      }
    }
    document.addEventListener("pointerdown", outside)
    window.addEventListener("scroll", dismiss, true)
    window.addEventListener("resize", dismiss)
    return () => {
      document.removeEventListener("pointerdown", outside)
      window.removeEventListener("scroll", dismiss, true)
      window.removeEventListener("resize", dismiss)
    }
  }, [open])

  const above = anchor !== null && anchor.top > window.innerHeight / 2

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-describedby={open ? id : undefined}
        className={`cursor-help underline decoration-dotted underline-offset-4 outline-offset-4 focus-visible:outline focus-visible:outline-blue-400 ${className}`}
        onMouseEnter={show}
        onMouseLeave={() => {
          if (document.activeElement !== trigger.current) setAnchor(null)
        }}
        onFocus={show}
        onBlur={() => {
          setAnchor(null)
        }}
        onClick={onClick ?? show}
        onKeyDown={event => {
          if (event.key === "Escape") setAnchor(null)
        }}
      >
        {children}
      </button>
      {anchor &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className="fixed z-50 pointer-events-none w-80 max-w-[calc(100vw-1.5rem)] rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-left text-xs font-normal normal-case tracking-normal leading-relaxed text-slate-200 shadow-lg"
            style={{
              left: Math.max(
                12,
                Math.min(
                  anchor.left + anchor.width / 2 - 160,
                  window.innerWidth - 332,
                ),
              ),
              top: above ? anchor.top - 8 : anchor.bottom + 8,
              transform: above ? "translateY(-100%)" : undefined,
            }}
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  )
}
