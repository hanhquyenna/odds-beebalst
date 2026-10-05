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
