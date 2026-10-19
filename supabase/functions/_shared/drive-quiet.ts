/** Surfaced when Broods accepts a run and the model never starts, or a run stays at zero commands. */
export const MODEL_UNREACHABLE = "Broods' model is unreachable. The fill stopped. Press Apply with Odds to try again."

/** Broods accepted the run (202) but the session failed, expired, or the model host never resolved. */
export function broodsStartFailed(status: { status?: string | null; error?: string | null } | null | undefined): boolean {
  if (!status) return false
  const name = String(status.status || "")
  if (name === "failed" || name === "expired" || name === "not_found") return true
  return /model\.invocation\.failed|getaddrinfo|ENOTFOUND|tunnel not found/i.test(String(status.error || ""))
}

export type QuietDecision = "wait" | "retry" | "stuck_unreachable" | "stuck_generic"

/**
 * Quiet window while a run is still "running".
 * Under 3 retries: pick the agent up again.
 * After that, zero commands means the model never drove the tab (unreachable).
 * Commands that then went quiet use the generic stuck message.
 */
export function quietGiveUp(input: { retries: number; commandCount: number; quiet: boolean }): QuietDecision {
  if (!input.quiet) return "wait"
  if ((input.retries ?? 0) < 3) return "retry"
  if ((input.commandCount ?? 0) <= 0) return "stuck_unreachable"
  return "stuck_generic"
}
