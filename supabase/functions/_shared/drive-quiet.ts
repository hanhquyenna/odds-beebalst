/** Surfaced when Broods accepts a run and the model never starts, or a run stays at zero commands. */
export const MODEL_UNREACHABLE = "Broods' model is unreachable. The fill stopped. Press Apply with Odds to try again."

/** Broods accepted the run (202) but the session failed, expired, or the model host never resolved. */
export function broodsStartFailed(status: { status?: string | null; error?: string | null } | null | undefined): boolean {
  if (!status) return false
  const name = String(status.status || "")
  if (name === "failed" || name === "expired" || name === "not_found") return true
  return /model\.invocation\.failed|getaddrinfo|ENOTFOUND|tunnel not found/i.test(String(status.error || ""))
}

export type BroodsStartOutcome = "wait" | "live" | "unreachable" | "ended"

/** Classify the first async status snapshots after runAsync accepted the request. */
export function broodsStartOutcome(status: { status?: string | null; error?: string | null } | null | undefined): BroodsStartOutcome {
  if (!status) return "wait"
  const name = String(status.status || "")
  if (broodsStartFailed(status)) return "unreachable"
  if (name === "completed") return "ended"
  if (["processing", "applied", "awaiting_input", "awaiting_approval"].includes(name)) return "live"
  return "wait"
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

/** A row can still say running after its lease expired. It must be settled, not returned as a live run forever. */
export function driveRunExpired(status: string | null | undefined, expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (status !== "running" || !expiresAt) return false
  const expires = Date.parse(expiresAt)
  return Number.isFinite(expires) && expires <= now
}

/** A Broods turn still thinking this long after the run's last step is hung, not slow (p99 model think time is ~35 s). */
export const HUNG_MS = 120_000

export type BroodsTurn = "live" | "over" | "unknown"

/** Whether the run's Broods turn is still working (a new message would only queue behind it) or has ended. */
export function broodsTurnState(status: { status?: string | null } | null | undefined): BroodsTurn {
  const name = String(status?.status || "")
  if (["accepted", "queued", "applied", "processing"].includes(name)) return "live"
  if (["completed", "failed", "expired", "not_found", "awaiting_input", "awaiting_approval"].includes(name)) return "over"
  return "unknown"
}

/**
 * What to do when a running run has sent no step for a while. A turn that is still working is left alone (picking it up again would
 * only stack a message behind it); a hung one ends the run, so a fresh press starts a new run that the hung turn can never touch.
 * A turn that ended without a tool call is picked up again in the same conversation (quietGiveUp).
 */
export function quietAction(input: { turn: BroodsTurn; quietMs: number; retries: number; commandCount: number }): "wait" | "stuck_hung" | QuietDecision {
  if (input.turn === "live") return input.quietMs >= HUNG_MS ? "stuck_hung" : "wait"
  return quietGiveUp({ retries: input.retries, commandCount: input.commandCount, quiet: true })
}
