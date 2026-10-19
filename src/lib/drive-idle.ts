/** No drive command and no done, on a live connection, before the tab stops saying it is filling. */
export const DRIVE_IDLE_MS = 180_000

/** True when a successful idle (the server answered, with no command and no done) has lasted `limit` ms. */
export function driveIdleGiveUp(idleForMs: number, limit = DRIVE_IDLE_MS): boolean {
  return idleForMs >= limit
}
