import type { ReactNode } from "react"

type Tone = "ok" | "bad"

const TONES: Record<Tone, string> = {
  ok: "bg-good text-good-foreground",
  bad: "bg-bad text-bad-foreground",
}

/** A small coloured label: green when something is met, red when it is not. */
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }): React.JSX.Element {
  return <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>
}
