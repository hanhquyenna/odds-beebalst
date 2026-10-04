/**
 * A number that has moved, like a price on a board: the number itself turns green with an arrow up when it went up, red with an arrow down when it went down, and flashes once
 * each time it changes. The original is in the hover ("Was 3.0%"). One look for every number that changes when you change something (the interview chance, the money).
 * `delta` is how far it moved, in whatever unit the number is; under `min` it has not moved.
 */
export function Moved({ delta, min, wasText, children }: { delta: number; min: number; wasText: string; children: React.ReactNode }): React.JSX.Element {
  if (Math.abs(delta) < min) {
    return <>{children}</>
  }
  const up = delta > 0

  return (
    <span key={delta.toFixed(2)} title={`Was ${wasText}`} aria-label={`${up ? "Up" : "Down"} from ${wasText}`} className={`moved-flash inline-flex items-center gap-1 rounded-md px-1 font-semibold ${up ? "text-green-600 [--flash:var(--color-green-200)]" : "text-red-600 [--flash:var(--color-red-200)]"}`}>
      {children}
      <span aria-hidden="true" className="text-[0.75em] leading-none">
        {up ? "▲" : "▼"}
      </span>
    </span>
  )
}
