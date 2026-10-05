import { useState } from "react"

/** The time the component mounted, for date math in render (follow-up due dates) without calling the clock on every render. */
export function useNow(): Date {
  const [now] = useState<Date>(() => new Date())

  return now
}
