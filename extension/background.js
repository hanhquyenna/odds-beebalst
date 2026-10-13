// The odds extension's background worker: the only part that talks to odds. Pages and the popup ask it; it holds the key.
const API = "https://ukpmpyfcnbhngkgbnkxi.supabase.co/functions/v1/mcp"
// The tests point the extension at a local fake of odds; nothing else may change where it sends the key.
async function apiBase() {
  const { oddsApi } = await chrome.storage.local.get("oddsApi")
  return typeof oddsApi === "string" && /^http:\/\/localhost:\d+(\/|$)/.test(oddsApi) ? oddsApi.replace(/\/$/, "") : API
}
const SITE = "https://odds.beeblast.co"
const KEY = "oddsKey"
const KEY_FORMAT = /^oddsx_[0-9a-f]{48}$/

async function savedKey() {
  const stored = await chrome.storage.local.get(KEY)
  return typeof stored[KEY] === "string" && KEY_FORMAT.test(stored[KEY]) ? stored[KEY] : null
}

/** Sends one LinkedIn job page to odds: kept for the person, read first if odds does not hold it, with their chance. */
async function addJob(url) {
  const key = await savedKey()
  if (!key) return { status: "connect" }
  let res
  try {
    res = await fetch(`${await apiBase()}/ext/add`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(130000) })
  } catch {
    return { status: "error", message: "odds did not answer. Check your connection and try again." }
  }
  if (res.status === 401) {
    await chrome.storage.local.remove(KEY)
    return { status: "connect" }
  }
  const body = await res.json().catch(() => ({}))
  return res.ok || body.status ? body : { status: "error", message: "odds could not do that. Try again in a minute." }
}

/** Whether odds already holds the job at this address, and the person's chance for it. Nothing is saved or paid for. */
async function peek(url) {
  const key = await savedKey()
  if (!key) return { status: "connect" }
  let res
  try {
    res = await fetch(`${await apiBase()}/ext/peek`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(60000) })
  } catch {
    return { status: "error", message: "odds did not answer." }
  }
  if (res.status === 401) {
    await chrome.storage.local.remove(KEY)
    return { status: "connect" }
  }
  const body = await res.json().catch(() => ({}))
  return res.ok ? { status: "ok", ...body } : { status: "error", message: body.message || "odds could not look that job up." }
}

/** The person's saved jobs, for the panel. */
async function pool() {
  const key = await savedKey()
  if (!key) return { status: "connect" }
  let res
  try {
    res = await fetch(`${await apiBase()}/ext/pool`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(60000) })
  } catch {
    return { status: "error", message: "odds did not answer." }
  }
  if (res.status === 401) {
    await chrome.storage.local.remove(KEY)
    return { status: "connect" }
  }
  const body = await res.json().catch(() => ({}))
  return res.ok ? { status: "ok", ...body } : { status: "error", message: "Could not load your jobs." }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === "add" && typeof message.url === "string") {
    addJob(message.url).then(reply)
    return true
  }
  if (message?.type === "peek" && typeof message.url === "string") {
    peek(message.url).then(reply)
    return true
  }
  if (message?.type === "pool") {
    pool().then(reply)
    return true
  }
  if (message?.type === "status") {
    savedKey().then((key) => reply({ connected: key !== null }))
    return true
  }
  if (message?.type === "disconnect") {
    chrome.storage.local.remove(KEY).then(() => reply({ connected: false }))
    return true
  }
  // The key comes only from the odds site itself (content-site.js on odds.beeblast.co), after the person is signed in there and allows it.
  if (message?.type === "set-key" && sender.url?.startsWith(SITE + "/") && typeof message.key === "string" && KEY_FORMAT.test(message.key)) {
    chrome.storage.local.set({ [KEY]: message.key }).then(() => reply({ connected: true }))
    return true
  }
  if (message?.type === "open-connect") {
    chrome.tabs.create({ url: `${SITE}/connect/extension` })
    reply({ ok: true })
  }
  return false
})
