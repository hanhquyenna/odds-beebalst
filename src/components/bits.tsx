import type { ReactNode } from "react"

type Tone = "plain" | "ok" | "bad" | "warn" | "brand"

const TONES: Record<Tone, string> = {
  plain: "bg-secondary text-secondary-foreground",
  ok: "bg-good text-good-foreground",
  bad: "bg-bad text-bad-foreground",
  warn: "bg-warn text-warn-foreground",
  brand: "bg-[oklch(0.96_0.03_45)] text-brand",
}

export function Pill({ tone = "plain", children }: { tone?: Tone; children: ReactNode }): React.JSX.Element {
  return <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>
}

export function Source({ children }: { children: ReactNode }): React.JSX.Element {
  return <span className="text-xs text-muted-foreground">{children}</span>
}

export function Panel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }): React.JSX.Element {
  return (
    <section className={`rounded-xl border-[1.5px] bg-card p-4 sm:p-5 ${className}`}>
      {title ? <h2 className="mb-3 text-lg font-semibold tracking-tight">{title}</h2> : null}
      {children}
    </section>
  )
}

export function Kv({ label, children }: { label: ReactNode; children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b-[1.5px] py-1.5 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}

export function Muted({ children }: { children: ReactNode }): React.JSX.Element {
  return <span className="italic text-muted-foreground">{children}</span>
}

export const SELECT = "h-9 rounded-lg border-[1.5px] bg-background px-3 text-sm text-foreground"
export const INPUT = "h-9 w-full rounded-lg border-[1.5px] bg-background px-3 text-sm text-foreground"
