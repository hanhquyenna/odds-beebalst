/** How long Apply with Odds may say Filling… from the press alone, before a status update. */
export const PANEL_FILL_MS = 30_000

/**
 * A panel-fill press sets `pressed` immediately. If the extension never reports a new state,
 * that press must clear so the button is not stuck on Filling….
 * A state that changed after the press means the fill is real and this timeout should not clear it.
 */
export function panelFillExpired(
  pressedAt: number,
  now: number,
  stateAtPress: string | null,
  stateNow: string | null,
  limit = PANEL_FILL_MS,
): boolean {
  if (!pressedAt) return false
  if (stateNow && stateNow !== stateAtPress) return false
  return now - pressedAt >= limit
}
