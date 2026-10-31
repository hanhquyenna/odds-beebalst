// Long screenshot test: the real Odds extension, the 5 test jobs in background tabs of an unfocused, covered (then minimised) window,
// all captured every 15 s for SOAK_MIN minutes (default 6). Prints real / blank / errors and capture time. Run: bun scripts/screenshot-soak.mjs
import { chromium } from "playwright"
import { spawn } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
const EXT = process.cwd() + "/extension"
const MIN = Number(process.env.SOAK_MIN || 6), EVERY = 15000
setTimeout(() => { console.log("OVERALL TIMEOUT"); proc.kill(); process.exit(2) }, (MIN + 3) * 60000)
const dir = mkdtempSync("/private/tmp/claude-502/soak-")
const proc = spawn(chromium.executablePath(), [`--user-data-dir=${dir}`, "--remote-debugging-port=9336", "--no-first-run", "--no-default-browser-check", `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "about:blank"], { stdio: "ignore" })
let ver; for (let i = 0; i < 40 && !ver; i++) { await new Promise(r => setTimeout(r, 250)); ver = await fetch("http://127.0.0.1:9336/json/version").then(r => r.json()).catch(() => null) }
const ws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r)
let id = 0; const wait = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id) } }
const send = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; wait.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })) })
const JOBS = {
  ormit: "https://ormittalent.nl/nl/traineeships/traineeship-change-ai-adoption-asml",
  imc: "https://job-boards.eu.greenhouse.io/imc/jobs/4936262101",
  bosch: "https://jobs.smartrecruiters.com/BoschGroup/744000152656903-global-e-mail-marketing-internship-1-year-",
  boskalis: "https://jobs.smartrecruiters.com/Boskalis/744000135010874-internship-learning-development",
  accor: "https://jobs.smartrecruiters.com/AccorHotel/744000151142589-reservations-and-events-trainee",
}
// The Odds window: unfocused, one front tab, the 5 applications behind it (as the queue opens them).
const { result: { targetId: front } } = await send("Target.createTarget", { url: "https://example.com", newWindow: true })
const { result: { windowId } } = await send("Browser.getWindowForTarget", { targetId: front })
await send("Browser.setWindowBounds", { windowId, bounds: { left: 300, top: 40, width: 1100, height: 820 } })
for (const url of Object.values(JOBS)) await send("Target.createTarget", { url, background: true, windowId })
// The person's own window on top, covering the Odds window completely.
const { result: { targetId: mine } } = await send("Target.createTarget", { url: "https://example.org", newWindow: true })
const { result: { windowId: wm } } = await send("Browser.getWindowForTarget", { targetId: mine })
await send("Browser.setWindowBounds", { windowId: wm, bounds: { left: 0, top: 0, width: 1700, height: 1000 } })
await send("Target.activateTarget", { targetId: mine })
await new Promise(r => setTimeout(r, 10000))
const { result: { targetInfos } } = await send("Target.getTargets")
let sessionId = null
for (const t of targetInfos.filter(t => t.type === "service_worker")) {
  const { result } = await send("Target.attachToTarget", { targetId: t.targetId, flatten: true })
  const v = (await send("Runtime.evaluate", { expression: "chrome.runtime.getManifest().name + ' ' + chrome.runtime.getManifest().version + ' ' + typeof shotViaDebugger", returnByValue: true }, result.sessionId)).result?.result?.value
  console.log("worker:", v)
  if (/function$/.test(v || "")) { sessionId = result.sessionId; break }
}
if (!sessionId) { console.log("Odds worker not found"); proc.kill(); process.exit(1) }
const evalSW = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, sessionId); if (r.result?.exceptionDetails) console.log("EVAL ERR", JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result?.result?.value }
const rows = []
const end = Date.now() + MIN * 60000
for (let round = 1; Date.now() < end; round++) {
  const t0 = Date.now()
  const r = await evalSW(`(async () => { const out = {}; for (const [k, u] of Object.entries(${JSON.stringify(JOBS)})) { const tab = (await chrome.tabs.query({ url: u.split("?")[0] + "*" }))[0] || (await chrome.tabs.query({})).find(t => t.url.includes(u.split("/")[2]) && t.url.includes(u.split("/")[3] || "")); if (!tab) { out[k] = { error: "no tab" }; continue } const s = Date.now(); const x = await shotViaDebugger(tab.id); out[k] = { ms: Date.now() - s, kb: x.image ? Math.round(x.image.length * 3 / 4 / 1024) : 0, blank: !!x.blank, error: x.error, tries: x.tries ? x.tries.length : (x.diag ? x.diag.tries.length : 1), active: tab.active, diag: x.diag } } return out })()`)
  rows.push({ round, at: new Date().toISOString().slice(11, 19), r })
  console.log(`round ${round} ${new Date().toISOString().slice(11, 19)} ` + Object.entries(r || {}).map(([k, v]) => `${k}:${v.blank ? "BLANK" : v.kb ? v.kb + "KB" : "ERR(" + (v.error || "") + ")"}/${v.ms}ms${v.tries > 1 ? "/x" + v.tries : ""}`).join(" "))
  // Halfway: minimise the Odds window (the person tidied up), to see captures still work.
  if (round === 12) { await send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } }); console.log("-- Odds window minimised") }
  await new Promise(r => setTimeout(r, Math.max(0, EVERY - (Date.now() - t0))))
}
writeFileSync(process.env.OUT || "/dev/null", JSON.stringify(rows, null, 1))
const all = rows.flatMap(x => Object.values(x.r || {}))
const ms = all.filter(v => v.ms).map(v => v.ms).sort((a, b) => a - b)
console.log(`TOTAL captures=${all.length} real=${all.filter(v => v.kb && !v.blank).length} blank=${all.filter(v => v.blank).length} errors=${all.filter(v => !v.kb && !v.blank).length} retried=${all.filter(v => v.tries > 1).length} ms median=${ms[ms.length >> 1]} p95=${ms[Math.floor(ms.length * 0.95)]} max=${ms[ms.length - 1]}`)
proc.kill(); process.exit(0)
