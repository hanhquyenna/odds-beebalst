import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { CircleHelpIcon } from "@/components/icons"

/**
 * A small "?" that opens a short note. It keeps the page to the feature and
 * puts the explanation one press away. Closes on Escape or a press elsewhere.
 */
export function Hint({ label, children, align = "left" }: { label: string; children: React.ReactNode; align?: "left" | "right" }): React.JSX.Element {
  const [open, setOpen] = useState<boolean>(false)
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)
  const box = useRef<HTMLSpanElement>(null)
  const note = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const away = (e: MouseEvent): void => {
      const target = e.target as Node
      if (box.current && !box.current.contains(target) && !note.current?.contains(target)) {
        setOpen(false)
      }
    }
    const close = (): void => setOpen(false)
    window.addEventListener("scroll", close, true)
    window.addEventListener("resize", close)
    const key = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", away)
    document.addEventListener("keydown", key)

    return () => {
      document.removeEventListener("mousedown", away)
      document.removeEventListener("keydown", key)
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("resize", close)
    }
  }, [open])

  function toggle(): void {
    if (!open && box.current) {
      const r = box.current.getBoundingClientRect()
      const width = Math.min(288, window.innerWidth - 24)
      const left = align === "right" ? r.right - width : r.left
      setAt({ top: r.bottom + 6, left: Math.max(12, Math.min(left, window.innerWidth - width - 12)) })
    }
    setOpen(!open)
  }

  return (
    <span ref={box} className="relative inline-flex align-middle">
      <button type="button" aria-label={label} aria-expanded={open} onClick={toggle} className="flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground">
        <CircleHelpIcon className="size-4" aria-hidden="true" />
      </button>
      {open && at
        ? createPortal(
            <span ref={note} role="note" style={{ position: "fixed", top: at.top, left: at.left, width: Math.min(288, window.innerWidth - 24) }} className="z-[70] rounded-lg border-[1.5px] bg-popover p-3 text-left text-[0.8125rem] leading-relaxed font-normal whitespace-normal text-popover-foreground shadow-lg">
              {children}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}
