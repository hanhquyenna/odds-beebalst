/** The open job drawer's way out, kept here so a link inside a job can close it without the job page importing the board that shows it. */
let close: () => void = () => undefined

export function setDrawerClose(fn: () => void): void {
  close = fn
}

/** Closes the open job drawer, if any. */
export function closeJobDrawer(): void {
  close()
}
