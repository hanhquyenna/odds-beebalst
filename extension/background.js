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

/**
 * odds refuses to be shown inside another page (X-Frame-Options and the CSP's frame-ancestors), which is right for the site. The panel the extension
 * opens on a LinkedIn tab does show it, so in that one tab, from the moment the panel is opened until the tab closes, the two headers are left off
 * the odds frames that tab loads. Any other page, and every other tab, still gets them.
 */
async function allowOddsInTab(tabId) {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [tabId],
    addRules: [
      {
        id: tabId,
        priority: 1,
        action: { type: "modifyHeaders", responseHeaders: [{ header: "x-frame-options", operation: "remove" }, { header: "content-security-policy", operation: "remove" }] },
        condition: { urlFilter: "||odds.beeblast.co/", resourceTypes: ["sub_frame"], tabIds: [tabId] },
      },
    ],
  })
}
/** The browser's own side panel is a page of the extension that belongs to no tab: it gets the same leave to frame odds (no web page can make such a request). */
async function allowOddsInSidePanel() {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1_000_000],
    addRules: [
      {
        id: 1_000_000,
        priority: 1,
        action: { type: "modifyHeaders", responseHeaders: [{ header: "x-frame-options", operation: "remove" }, { header: "content-security-policy", operation: "remove" }] },
        condition: { urlFilter: "||odds.beeblast.co/", resourceTypes: ["sub_frame"], tabIds: [chrome.tabs.TAB_ID_NONE] },
      },
    ],
  })
}
allowOddsInSidePanel()
chrome.runtime.onStartup.addListener(allowOddsInSidePanel)

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] }).catch(() => undefined)
})

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

/** A sign-in for the odds app inside the panel, made by odds from the extension's key. */
async function session() {
  const key = await savedKey()
  if (!key) return { status: "connect" }
  let res
  try {
    res = await fetch(`${await apiBase()}/ext/session`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30000) })
  } catch {
    return { status: "error", message: "odds did not answer." }
  }
  if (res.status === 401) {
    await chrome.storage.local.remove(KEY)
    return { status: "connect" }
  }
  const body = await res.json().catch(() => ({}))
  return res.ok ? { status: "ok", session: body } : { status: "error", message: body.error || "Could not sign you in." }
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
  if (message?.type === "panel" && sender.tab && typeof sender.tab.id === "number") {
    allowOddsInTab(sender.tab.id).then(() => reply({ ok: true }), () => reply({ ok: false }))
    return true
  }
  // The popup is about to open the side panel on this tab: the tab may frame odds too, in case the panel's requests carry its id.
  if (message?.type === "allow-tab" && typeof message.tabId === "number") {
    allowOddsInTab(message.tabId).then(() => reply({ ok: true }), () => reply({ ok: false }))
    return true
  }
  if (message?.type === "session") {
    session().then(reply)
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
