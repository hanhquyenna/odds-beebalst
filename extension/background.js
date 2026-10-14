// The odds extension's background worker: the only part that talks to odds. Pages and the popup ask it; it holds the key.
// job-sites.js: which addresses are jobs, by the rules the server uses (built from supabase/functions/_shared/job-sites.ts).
importScripts("job-sites.js")
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
// The tests switch the side panel off to try the panel drawn in the page; read ahead of time, because opening the side panel must not wait on anything.
let panelInPageOnly = false
chrome.storage.local.get("oddsPanelInPage").then((got) => {
  panelInPageOnly = got.oddsPanelInPage === true
})
chrome.storage.onChanged.addListener((changes) => {
  if (changes.oddsPanelInPage) panelInPageOnly = changes.oddsPanelInPage.newValue === true
})

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
  selectedJobs.delete(tabId)
  chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] }).catch(() => undefined)
})

async function savedKey() {
  const stored = await chrome.storage.local.get(KEY)
  return typeof stored[KEY] === "string" && KEY_FORMAT.test(stored[KEY]) ? stored[KEY] : null
}

/**
 * Sends one job to odds: kept for the person (or, `analyze`, only read so odds holds it for everyone), read first if odds does not hold it, with
 * their chance. `posting` is the job as its page showed it in this browser (for LinkedIn, its public page); without one odds reads LinkedIn itself.
 */
async function addJob(url, analyze = false, posting = null) {
  const key = await savedKey()
  if (!key) return { status: "connect" }
  let res
  try {
    res = await fetch(`${await apiBase()}/ext/${analyze ? "analyze" : "add"}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(posting ? { url, posting } : { url }), signal: AbortSignal.timeout(130000) })
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

/**
 * Whether odds already holds the jobs at these addresses, and the person's chance for each. Nothing is saved or paid for. One request for a whole
 * list of jobs: the answer is { url: answer }.
 */
async function peekMany(urls) {
  const every = (answer) => Object.fromEntries(urls.map((u) => [u, answer]))
  const key = await savedKey()
  if (!key) return every({ status: "connect" })
  let res
  try {
    res = await fetch(`${await apiBase()}/ext/peek`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(urls.length === 1 ? { url: urls[0] } : { urls }), signal: AbortSignal.timeout(60000) })
  } catch {
    return every({ status: "error", message: "odds did not answer." })
  }
  if (res.status === 401) {
    await chrome.storage.local.remove(KEY)
    return every({ status: "connect" })
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return every({ status: "error", message: body.message || "odds could not look that job up." })
  if (urls.length === 1) return { [urls[0]]: { status: "ok", ...body } }
  const results = body.results || {}
  return Object.fromEntries(urls.map((u) => [u, results[u] ? (results[u].status === "error" ? results[u] : { status: "ok", ...results[u] }) : { status: "error", message: "odds could not look that job up." }]))
}

// Look-ups asked for within a moment of each other (a list coming into view) go to odds together.
let peekQueue = new Map()
let peekTimer = 0
const PEEK_BATCH = 25
function flushPeeks() {
  clearTimeout(peekTimer)
  peekTimer = 0
  const batch = peekQueue
  peekQueue = new Map()
  if (!batch.size) return
  peekMany([...batch.keys()]).then((answers) => {
    for (const [url, waiting] of batch) for (const resolve of waiting) resolve(answers[url])
  })
}
/** Whether odds already holds the job at this address, and the person's chance for it. Nothing is saved or paid for. */
function peek(url) {
  return new Promise((resolve) => {
    if (!peekQueue.has(url)) peekQueue.set(url, [])
    peekQueue.get(url).push(resolve)
    if (peekQueue.size >= PEEK_BATCH) flushPeeks()
    else if (!peekTimer) peekTimer = setTimeout(flushPeeks, 60)
  })
}

/** A request to one of the extension's own routes on odds with the key; { status: "connect" } without one. */
async function ext(route, init = {}) {
  const key = await savedKey()
  if (!key) return { status: "connect" }
  let res
  try {
    res = await fetch(`${await apiBase()}/ext/${route}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30000) })
  } catch {
    return { status: "error", message: "odds did not answer." }
  }
  if (res.status === 401) {
    await chrome.storage.local.remove(KEY)
    return { status: "connect" }
  }
  const body = await res.json().catch(() => ({}))
  // A route's own status (e.g. "applied") is kept apart from whether it worked.
  return res.ok ? { ...body, result: body.status, status: "ok" } : { status: "error", ...body }
}

/** The person's CV file from odds, as base64 so a page can put it in a form's upload. */
async function cvFile(doc) {
  const key = await savedKey()
  if (!key || !/^[0-9a-f-]{36}$/.test(doc)) return { status: "error" }
  try {
    const res = await fetch(`${await apiBase()}/ext/file?doc=${doc}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30000) })
    if (!res.ok) return { status: "error" }
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length > 8_000_000) return { status: "error" }
    let text = ""
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return { status: "ok", name: decodeURIComponent(res.headers.get("x-file-name") || "CV.pdf"), type: res.headers.get("content-type") || "application/pdf", base64: btoa(text) }
  } catch {
    return { status: "error" }
  }
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

// Keep selection until the panel finishes loading; a newly opened native panel can miss a broadcast.
const selectedJobs = new Map()
const pendingLookups = new Map()
async function readChance(url) {
  // A job odds does not hold is read by the page's script (from the job's own page) and sent back with "analyze".
  return peek(url)
}

const chanceCache = new Map()
const cacheReady = chrome.storage.session.get("oddsChanceCache").then(({ oddsChanceCache }) => {
  for (const [id, entry] of Object.entries(oddsChanceCache || {})) {
    if (entry.until > Date.now()) chanceCache.set(id, entry)
  }
})
chrome.storage.onChanged.addListener(changes => {
  if (!changes[KEY]) return
  chanceCache.clear()
  chrome.storage.session.remove("oddsChanceCache")
})
/** A posting a page sent: plain text fields only (the server checks it again). */
function postingOf(message) {
  const p = message.posting
  if (!p || typeof p !== "object") return null
  const text = (v, max) => (typeof v === "string" ? v.slice(0, max) : null)
  return { title: text(p.title, 400), company: text(p.company, 300), location: text(p.location, 400), description: text(p.description, 100000), posted: text(p.posted, 40), valid: text(p.valid, 40), logo: text(p.logo, 2000), employment: text(p.employment, 200), applicants: text(p.applicants, 120), seniority: text(p.seniority, 80), closed: p.closed === true }
}

/** Drops what is remembered about a job that is being added or read, so its next look-up asks odds again. */
function forget(url) {
  let changed = false
  for (const id of chanceCache.keys()) {
    if (id.endsWith(`:${url}`)) {
      chanceCache.delete(id)
      changed = true
    }
  }
  if (changed) chrome.storage.session.set({ oddsChanceCache: Object.fromEntries(chanceCache) })
}

/** How long a chance shown is kept: a list seen again in that time fills in at once, without asking odds. */
const KEEP_CHANCE = 30 * 60_000
function remember(id, answer) {
  chanceCache.set(id, { answer, until: Date.now() + KEEP_CHANCE })
  for (const [cacheId, entry] of chanceCache) if (entry.until <= Date.now()) chanceCache.delete(cacheId)
  while (chanceCache.size > 500) chanceCache.delete(chanceCache.keys().next().value)
  chrome.storage.session.set({ oddsChanceCache: Object.fromEntries(chanceCache) })
}

async function lookup(url) {
  const key = await savedKey()
  if (!key) return { status: "connect" }
  await cacheReady
  const id = `${key}:${url}`
  const cached = chanceCache.get(id)
  if (cached?.until > Date.now()) return cached.answer
  if (!pendingLookups.has(id)) pendingLookups.set(id, readChance(url).then(answer => {
    if (answer.status === "ok" && typeof answer.chance_pct === "number") {
      remember(id, answer)
    }
    return answer
  }).finally(() => pendingLookups.delete(id)))
  return pendingLookups.get(id)
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === "add" && typeof message.url === "string") {
    forget(message.url)
    addJob(message.url, false, postingOf(message)).then(reply)
    return true
  }
  // A job odds does not hold, as its page shows it: odds reads it for everyone, without keeping it for the person.
  // Without a posting only for LinkedIn, whose jobs odds can read itself.
  if (message?.type === "analyze" && typeof message.url === "string" && (postingOf(message) || globalThis.oddsSites.jobLink(message.url)?.site === "linkedin")) {
    forget(message.url)
    addJob(message.url, true, postingOf(message)).then(async (answer) => {
      // Just read: kept as a look-up's answer, so the job is not asked about again when it comes back into view.
      const key = await savedKey()
      if (key && ["added", "exists"].includes(answer.status) && typeof answer.chance_pct === "number") remember(`${key}:${message.url}`, { ...answer, status: "ok", known: true })
      reply(answer)
    })
    return true
  }
  // Applying: what the form needs, the person's own answers kept, the job marked applied, their CV for the upload.
  if (message?.type === "apply-kit" && typeof message.url === "string") {
    ext("apply-kit", { method: "POST", body: JSON.stringify({ url: message.url }) }).then(reply)
    return true
  }
  if (message?.type === "save-answers" && Array.isArray(message.questions)) {
    const questions = message.questions.slice(0, 40).filter((q) => typeof q?.question === "string" && typeof q?.answer === "string").map((q) => ({ question: q.question.slice(0, 500), answer: q.answer.slice(0, 1000) }))
    ext("answers", { method: "POST", body: JSON.stringify({ questions }) }).then(reply)
    return true
  }
  if (message?.type === "applied" && typeof message.url === "string") {
    ext("applied", { method: "POST", body: JSON.stringify({ url: message.url }) }).then(reply)
    return true
  }
  if (message?.type === "cv-file" && typeof message.doc === "string") {
    cvFile(message.doc).then(reply)
    return true
  }
  if (message?.type === "lookup" && typeof message.url === "string") {
    lookup(message.url).then(reply)
    return true
  }
  if (message?.type === "panel-ready") {
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => reply({ job: selectedJobs.get(tabs[0]?.id) ?? null }))
    return true
  }
  if (message?.type === "peek" && typeof message.url === "string") {
    peek(message.url).then(reply)
    return true
  }
  // A press on the odds button on a page: open the browser's side panel on that tab at once (it must happen inside the press), allowing odds to be framed there first.
  if (message?.type === "open-side-panel" && sender.tab && typeof sender.tab.id === "number") {
    const tabId = sender.tab.id
    if (panelInPageOnly) {
      reply({ ok: false, why: "in-page only" })
      return false
    }
    // Called first thing, with nothing awaited before it: Chrome wants it inside the press. The frame rule was set when the job page was opened.
    chrome.sidePanel
      .open({ tabId })
      .then(
        () => reply({ ok: true }),
        (e) => reply({ ok: false, why: String(e && e.message ? e.message : e).slice(0, 120) }),
      )
    return true
  }
  // A job page was opened in a tab: odds may be framed there from now on, so the side panel is ready when the button is pressed.
  if (message?.type === "allow-frame" && sender.tab && typeof sender.tab.id === "number") {
    allowOddsInTab(sender.tab.id).then(() => reply({ ok: true }), () => reply({ ok: false }))
    return true
  }
  // A job was added from that tab: the side panel of that tab (and only that one) drops it in.
  if (message?.type === "panel-added" && sender.tab && typeof sender.tab.id === "number" && message.job) {
    selectedJobs.set(sender.tab.id, message.job)
    chrome.runtime.sendMessage({ type: "panel-added", tabId: sender.tab.id, job: message.job }).catch(() => undefined)
    reply({ ok: true })
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

// A connected toolbar icon is an action, not a second menu. Opening is the
// first call in the click handler so Chrome preserves the user gesture.
async function updateToolbar() {
  await chrome.action.setPopup({ popup: await savedKey() ? "" : "popup.html" })
}
updateToolbar()
chrome.runtime.onStartup.addListener(updateToolbar)
chrome.storage.onChanged.addListener(changes => { if (changes[KEY]) updateToolbar() })
chrome.action.onClicked.addListener(tab => {
  if (typeof tab.id !== "number") return
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => undefined)
  allowOddsInTab(tab.id).catch(() => undefined)
})
