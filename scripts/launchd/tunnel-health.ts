/** How long a public tunnel may fail its models check before cloudflared is restarted. */
export const HEALTH_FAIL_MS = 60_000
/** A five-second monitor tick delayed this long means the Mac slept or the process was paused. */
export const WAKE_GAP_MS = 20_000

/**
 * cloudflared quick tunnels die with "Tunnel not found" / "Register tunnel error" and keep the old process.
 * One of those lines is enough to restart: the hostname is already gone.
 */
export function logNeedsRestart(text: string): boolean {
  return /tunnel not found/i.test(text) || /register tunnel error/i.test(text)
}

/**
 * 9router's public /v1/models answers 401 "API key required for remote API access" when the tunnel is up
 * and no key was sent. That is reachable. A network error or any other status is not.
 */
export function modelsReachable(status: number, body: string): boolean {
  if (status >= 200 && status < 300) return true
  return status === 401 && /api key required for remote api access/i.test(body)
}

/** True once unhealthy checks have lasted about a minute. */
export function healthGaveUp(unhealthyMs: number, limit = HEALTH_FAIL_MS): boolean {
  return unhealthyMs >= limit
}

/** Sleep/wake pauses timers. Restart the quick tunnel immediately after a large monitor gap. */
export function wokeFromSleep(previousTick: number, currentTick: number, limit = WAKE_GAP_MS): boolean {
  return previousTick > 0 && currentTick - previousTick >= limit
}

/**
 * A network fingerprint changes when Wi-Fi/Ethernet addresses or interfaces change.
 * Empty means offline and is ignored until a usable network returns.
 */
export function networkChanged(previous: string, current: string): boolean {
  return Boolean(current && previous !== current)
}
