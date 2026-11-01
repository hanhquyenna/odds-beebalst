import { useSyncExternalStore } from "react"

/** Below Tailwind's md breakpoint: the width where the app gets a tab bar and lists replace tables. */
const QUERY = "(max-width: 767px)"

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY)
  media.addEventListener("change", onChange)

  return () => media.removeEventListener("change", onChange)
}

/** True on a phone-width screen. A table cannot fit there, so views that would draw one draw a list instead. */
export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false)
}
