// Cloudflare quick tunnel to the /v1-only proxy. A quick tunnel gets a new trycloudflare.com address every time it starts, so when the
// address changes this points Broods (odds-apply) at it: `broods env set NINE_ROUTER_BASE_URL` + `broods deploy`. Run by launchd.
// Restarts cloudflared when it logs "Tunnel not found" / "Register tunnel error", or when <url>/v1/models stays unreachable for ~60s.
// HTTP 401 "API key required for remote API access" counts as reachable (9router requires a key remotely). A local key, when present, is sent.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { healthGaveUp, HEALTH_FAIL_MS, logNeedsRestart, modelsReachable } from "./tunnel-health.ts"

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

async function pointBroods(url: string) {
  const base = `${url}/v1`
  if (existsSync(SAVED) && readFileSync(SAVED, "utf8").trim() === base) return log(`tunnel ${base} (Broods already uses it)`)
  // The new hostname takes a few seconds to resolve; wait until 9router answers through it.
  for (let i = 0; i < 30; i++) {
    if (await modelsOk(base)) break
    await Bun.sleep(2000)
  }
  log(`tunnel moved to ${base}: updating Broods`)
  const set = Bun.spawn([BUN, "./node_modules/.bin/broods", "env", "set", "NINE_ROUTER_BASE_URL"], { cwd: REPO, stdin: new Blob([`${base}\n`]), stdout: "inherit", stderr: "inherit" })
  if ((await set.exited) !== 0) return log("broods env set failed")
  const deploy = Bun.spawn([BUN, "./node_modules/.bin/broods", "deploy", "--project", "odds-apply"], { cwd: REPO, stdout: "inherit", stderr: "inherit" })
  if ((await deploy.exited) !== 0) return log("broods deploy failed")
  writeFileSync(SAVED, base)
  log("Broods now uses the new tunnel")
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
        pointBroods(url).catch((e) => log(`update failed: ${e}`))
      }
    }
  })()

  const healthTask = (async () => {
    while (tunnel.exitCode === null && !restart) {
      await Bun.sleep(5000)
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
