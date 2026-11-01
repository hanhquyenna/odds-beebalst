type Loader = () => Promise<unknown>

/** Props for a link or button that opens a lazy view: hovering or focusing it starts the chunk's download, so the click does not wait. */
export function prefetchOn(load: Loader): { onFocus: () => void; onPointerEnter: () => void } {
  const start = (): void => void load().catch(() => undefined)

  return { onFocus: start, onPointerEnter: start }
}

/** Starts a lazy chunk's download once the browser is idle, for the view a person is most likely to open next. */
export function prefetchWhenIdle(load: Loader): void {
  const start = (): void => void load().catch(() => undefined)
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(start, { timeout: 4000 })
  } else {
    window.setTimeout(start, 2000)
  }
}
