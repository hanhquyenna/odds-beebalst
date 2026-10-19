// Cloudflare quick tunnel to the /v1-only proxy. A quick tunnel gets a new trycloudflare.com address every time it starts, so when the
// address changes this points Broods (odds-apply) at it: `broods env set NINE_ROUTER_BASE_URL` + `broods deploy`. Run by launchd.
// Restarts cloudflared when it logs "Tunnel not found" / "Register tunnel error", or when <url>/v1/models stays unreachable for ~60s.
// HTTP 401 "API key required for remote API access" counts as reachable (9router requires a key remotely). A local key, when present, is sent.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { networkInterfaces } from "node:os"
import { healthGaveUp, HEALTH_FAIL_MS, logNeedsRestart, modelsReachable, networkChanged, WAKE_GAP_MS, wokeFromSleep } from "./tunnel-health.ts"

const DIR = "/Users/kien/.odds-9router"
const REPO = "/Users/kien/Documents/Files/odds-beebalst"
const BUN = "/Users/kien/.bun/bin/bun"
const SAVED = `${DIR}/tunnel-url`
const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`)

function apiKey(): string {
  const fromEnv = (process.env.NINE_ROUTER_API_KEY || "").trim()
  if (fromEnv) return fromEnv
  const file = `${DIR}/api-key`
  if (!existsSync(file)) return ""
  return readFileSync(file, "utf8").trim()
}

/** Public models endpoint. 2xx, or 401 with 9router's remote-key message, means the tunnel is up. */
export async function modelsOk(base: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = {}
    const key = apiKey()
    if (key) headers.Authorization = `Bearer ${key}`
    const res = await fetch(`${base}/models`, { headers, signal: AbortSignal.timeout(8000) })
    return modelsReachable(res.status, await res.text())
  } catch {
    return false
  }
}

let wantedBase = ""
let pointing: Promise<void> | null = null

/** Addresses that identify the current Mac network without including loopback or transient interface order. */
function networkFingerprint(): string {
  const addresses = Object.entries(networkInterfaces())
    .flatMap(([name, addresses]) => (addresses ?? [])
      .filter((a) => !a.internal)
      .map((a) => ({ name, family: String(a.family), address: a.address })))
  // Prefer IPv4 so a rotating temporary IPv6 privacy address does not restart a healthy tunnel.
  const stable = addresses.some((a) => a.family === "IPv4" || a.family === "4")
    ? addresses.filter((a) => a.family === "IPv4" || a.family === "4")
    : addresses.filter((a) => !/^fe80:/i.test(a.address))
  return stable.map((a) => `${a.name}:${a.family}:${a.address}`).sort()
    .join("|")
}

/** Set and deploy only the newest healthy URL. Serializing prevents an old tunnel's slower deploy from winning a restart race. */
async function pointLatestBroods() {
  while (wantedBase) {
    const base = wantedBase
    if (existsSync(SAVED) && readFileSync(SAVED, "utf8").trim() === base) {
      log(`tunnel ${base} (Broods already uses it)`)
      return
    }
  // The new hostname takes a few seconds to resolve; wait until 9router answers through it.
    let reachable = false
    for (let i = 0; i < 30 && wantedBase === base; i++) {
      if (await modelsOk(base)) { reachable = true; break }
      await Bun.sleep(2000)
    }
    // Never point Broods at a URL that did not pass the public check.
    if (!reachable || wantedBase !== base) {
      if (!reachable && wantedBase === base) log(`tunnel ${base} never became reachable; Broods keeps its previous URL`)
      if (wantedBase !== base) continue
      return
    }
    log(`tunnel moved to ${base}: updating Broods`)
    const set = Bun.spawn([BUN, "./node_modules/.bin/broods", "env", "set", "NINE_ROUTER_BASE_URL"], { cwd: REPO, stdin: new Blob([`${base}\n`]), stdout: "inherit", stderr: "inherit" })
    if ((await set.exited) !== 0) {
      log("broods env set failed; retrying in 30s")
      await Bun.sleep(30_000)
      continue
    }
    if (wantedBase !== base || !(await modelsOk(base))) continue
    const gate = Bun.spawn([BUN, "scripts/apply-score-gate.ts"], { cwd: REPO, stdout: "inherit", stderr: "inherit" })
    if ((await gate.exited) !== 0) {
      log("apply score gate blocked the Broods deploy; Broods keeps its previous URL")
      await Bun.sleep(30_000)
      continue
    }
    const deploy = Bun.spawn([BUN, "./node_modules/.bin/broods", "deploy", "--project", "odds-apply"], { cwd: REPO, stdout: "inherit", stderr: "inherit" })
    if ((await deploy.exited) !== 0) {
      log("broods deploy failed; retrying in 30s")
      await Bun.sleep(30_000)
      continue
    }
    if (wantedBase !== base || !(await modelsOk(base))) continue
    writeFileSync(SAVED, base)
    log("Broods now uses the new tunnel")
    return
  }
}

function pointBroods(url: string) {
  wantedBase = `${url}/v1`
  if (!pointing) {
    const startedFor = wantedBase
    pointing = pointLatestBroods()
      .catch((e) => log(`update failed: ${e}`))
      .finally(() => {
        pointing = null
        if (wantedBase && wantedBase !== startedFor) pointBroods(wantedBase.replace(/\/v1$/, ""))
      })
  }
}

function spawnTunnel() {
  return Bun.spawn([`${DIR}/bin/cloudflared`, "tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:20129"], { stdout: "inherit", stderr: "pipe" })
}

/** One cloudflared process. Resolves with "restart" when logs or the health check say the tunnel is dead. */
async function runOnce(): Promise<"restart" | "exit"> {
  const tunnel = spawnTunnel()
  let url = ""
  let buf = ""
  let restart = false
  let unhealthySince = 0
  let lastTick = Date.now()
  let network = networkFingerprint()
  const kill = () => { try { tunnel.kill() } catch { /* already gone */ } }

  const stderrTask = (async () => {
    for await (const chunk of tunnel.stderr) {
      const text = new TextDecoder().decode(chunk)
      process.stderr.write(text)
      buf = (buf + text).slice(-8000)
      if (logNeedsRestart(text)) {
        log("cloudflared reported a dead tunnel, restarting")
        restart = true
        kill()
        return
      }
      const found = buf.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
      if (found && found[0] !== url) {
        url = found[0]
        buf = ""
        unhealthySince = 0
        pointBroods(url)
      }
    }
  })()

  const healthTask = (async () => {
    while (tunnel.exitCode === null && !restart) {
      await Bun.sleep(5000)
      const now = Date.now()
      if (wokeFromSleep(lastTick, now, WAKE_GAP_MS)) {
        log("Mac woke from sleep, restarting cloudflared for a fresh quick tunnel")
        restart = true
        kill()
        return
      }
      lastTick = now
      const nextNetwork = networkFingerprint()
      if (networkChanged(network, nextNetwork)) {
        log("Mac network changed, restarting cloudflared for a fresh quick tunnel")
        restart = true
        kill()
        return
      }
      // Remember an offline interval so returning to the same Wi-Fi still refreshes the quick tunnel.
      network = nextNetwork
      if (!url || restart) continue
      if (await modelsOk(`${url}/v1`)) {
        unhealthySince = 0
        continue
      }
      unhealthySince ||= Date.now()
      if (healthGaveUp(Date.now() - unhealthySince, HEALTH_FAIL_MS)) {
        log("tunnel health check failed for 60s, restarting cloudflared")
        restart = true
        kill()
        return
      }
    }
  })()

  const code = await tunnel.exited
  await Promise.allSettled([stderrTask, healthTask])
  if (restart) return "restart"
  log(`cloudflared exited (${code}), restarting`)
  return "exit"
}

while (true) {
  await runOnce()
  await Bun.sleep(2000)
}
