import { CheckIcon } from "@/components/icons"
import type { Setup } from "@/lib/setup"

const RING = 2 * Math.PI * 46

/** The picture of setup: a ring that fills as the steps are done, with the steps floating round it. `compact` is the smaller one for the card on Home. */
export function SetupGraphic({ done, total, steps, compact = false }: { done: number; total: number; steps: Setup["steps"]; compact?: boolean }): React.JSX.Element {
  const spots = compact ? (["top-3 left-3", "top-12 right-3", "bottom-12 left-4", "bottom-3 right-5"] as const) : (["top-8 left-5", "top-24 right-5", "bottom-9 left-7", "bottom-6 right-9"] as const)

  return (
    <div aria-hidden="true" className="absolute inset-0">
      <div className={`absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center ${compact ? "size-24" : "size-32"}`}>
        <svg viewBox="0 0 112 112" className="absolute inset-0 -rotate-90">
          <circle cx="56" cy="56" r="46" fill="none" stroke="white" strokeOpacity="0.3" strokeWidth="9" />
          <circle cx="56" cy="56" r="46" fill="none" stroke="white" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(RING * done) / total} ${RING}`} className="transition-[stroke-dasharray] duration-500" />
        </svg>
        <span className={`relative font-semibold tracking-tight text-white tabular-nums ${compact ? "text-2xl" : "text-4xl"}`}>{done}/{total}</span>
      </div>
      {steps.slice(0, 4).map((s, i) => (
        <span
          key={s.key}
          className={`phone-prompt-pop absolute ${spots[i]} flex items-center gap-1.5 rounded-xl font-semibold shadow-md ${compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"} ${s.done ? "bg-white text-neutral-900" : "bg-neutral-900 text-white"}`}
          style={{ animationDelay: `${0.2 + i * 0.2}s` }}
        >
          {s.done ? <CheckIcon weight="bold" className="size-3.5 text-good-foreground" /> : null}
          {s.title}
        </span>
      ))}
    </div>
  )
}
