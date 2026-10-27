// The odds extension's background worker: the only part that talks to odds. Pages and the popup ask it; it holds the key.
// job-sites.js: which addresses are jobs, by the rules the server uses (built from supabase/functions/_shared/job-sites.ts).
importScripts("job-sites.js", "queue.js")
const API = "https://gdavxkaioqlfvfunmtxd.supabase.co/functions/v1/mcp"
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
// The browser's own side panel windows that are open now (each holds a connection while it lives): then no panel is drawn in the page.
const sidePanels = new Set()
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "odds-side-panel") return
  sidePanels.add(port)
  port.onDisconnect.addListener(() => sidePanels.delete(port))
})
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

/**
 * A 401 drops the key only when it keeps happening: three refusals at least a minute apart from the first, with no success between.
 * One refused request (a function restarting mid-deploy) used to wipe the key and turn phone control off without a word, and the
 * extension went silent until the person connected again.
 */
let refusedSince = 0
let refusals = 0
async function keyRefused() {
  refusals += 1
  refusedSince ||= Date.now()
  if (refusals >= 3 && Date.now() - refusedSince >= 60_000) { refusals = 0; refusedSince = 0; await chrome.storage.local.remove(KEY) }
}
/** Any answer the server gave with the key (not a 401) means the key still works. */
function keyAccepted(res) { if (res && res.status !== 401) { refusals = 0; refusedSince = 0 } }

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
  keyAccepted(res)
  if (res.status === 401) {
    await keyRefused()
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
  keyAccepted(res)
  if (res.status === 401) {
    await keyRefused()
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
    else if (!peekTimer) peekTimer = setTimeout(flushPeeks, 16)
  })
}

/** A request to one of the extension's own routes on odds with the key; { status: "connect" } without one. */
async function ext(route, init = {}, keyOverride = null) {
  const key = keyOverride || await savedKey()
  if (!key) return { status: "connect" }
  let res
  try {
    res = await fetch(`${await apiBase()}/ext/${route}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(/^(suggest-|drive-)/.test(route) ? 50000 : 30000) })
  } catch {
    return { status: "error", message: "odds did not answer." }
  }
  keyAccepted(res)
  if (res.status === 401) {
    await keyRefused()
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
    // The server's reason ("The file is in Google Drive, and odds can no longer reach it.") goes with the failure, so the person hears it.
    if (!res.ok) return { status: "error", message: String((await res.json().catch(() => null))?.error || `The CV file did not load (${res.status}).`).slice(0, 200) }
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length > 8_000_000) return { status: "error" }
    let text = ""
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return { status: "ok", name: decodeURIComponent(res.headers.get("x-file-name") || "CV.pdf"), type: res.headers.get("content-type") || "application/pdf", base64: btoa(text) }
  } catch {
    return { status: "error" }
  }
}

// What an application needs is asked for as soon as it is started, while the page is still loading: the details and the CV file are ready by the time the form is.
const PREPARED_MS = 120_000
const kits = new Map()
const cvFiles = new Map()
/** The last apply kit (the person's details, CV and saved answers) kept in this browser, so the first fill of a page does not wait for the server.
 * It is refreshed by every kit that arrives; a page fills from it at once and takes the fresh kit when it comes. */
const KIT_CACHE = "oddsKitCache"
const KIT_CACHE_MAX_MS = 24 * 3_600_000
async function cachedKit() {
  try {
    const { [KIT_CACHE]: hit } = await chrome.storage.local.get(KIT_CACHE)
    return hit && hit.kit?.status === "ok" && Date.now() - hit.at < KIT_CACHE_MAX_MS ? hit.kit : null
  } catch { return null }
}
function keepKit(kit) {
  if (kit?.status !== "ok" || !kit.facts) return
  chrome.storage.local.set({ [KIT_CACHE]: { at: Date.now(), kit } }).catch(() => undefined)
}
function kitFor(url, fresh = false, hints = {}) {
  const hit = kits.get(url)
  if (!fresh && hit && Date.now() - hit.at < PREPARED_MS) return hit.promise
  // hints: the page's title and the job Odds started from, so an employer's own form is known as the job (server: formJob).
  const promise = ext("apply-kit", { method: "POST", body: JSON.stringify({ url, ...hints }) })
  kits.set(url, { at: Date.now(), promise })
  promise.then((kit) => {
    keepKit(kit)
    const doc = kit?.cv?.id
    if (typeof doc === "string" && !cvFiles.has(doc)) cvFileFor(doc)
  }).catch(() => kits.delete(url))
  return promise
}
function cvFileFor(doc) {
  const hit = cvFiles.get(doc)
  if (hit && Date.now() - hit.at < PREPARED_MS) return hit.promise
  const promise = cvFile(doc)
  cvFiles.set(doc, { at: Date.now(), promise })
  promise.then((file) => { if (file?.status !== "ok") cvFiles.delete(doc) })
  return promise
}

const PLAYBOOK_CACHE = "oddsPlaybooks"
const PLAYBOOK_FRESH_MS = 6 * 3_600_000
async function playbookFor(page) {
  let host = ""
  try { host = new URL(page).hostname.toLowerCase() } catch { return ext("drive-playbook", { method: "POST", body: JSON.stringify({ page }) }) }
  const load = async () => {
    const res = await ext("drive-playbook", { method: "POST", body: JSON.stringify({ page }) })
    if (res?.playbook) {
      try {
        const { [PLAYBOOK_CACHE]: all = {} } = await chrome.storage.local.get(PLAYBOOK_CACHE)
        const keep = Object.entries({ ...all, [host]: { at: Date.now(), playbook: res.playbook } }).sort((a, b) => b[1].at - a[1].at).slice(0, 60)
        await chrome.storage.local.set({ [PLAYBOOK_CACHE]: Object.fromEntries(keep) })
      } catch { /* storage blocked: the next page asks again */ }
    }
    return res
  }
  try {
    const { [PLAYBOOK_CACHE]: all = {} } = await chrome.storage.local.get(PLAYBOOK_CACHE)
    const hit = all[host]
    if (hit?.playbook) {
      if (Date.now() - hit.at > PLAYBOOK_FRESH_MS) void load().catch(() => undefined)
      return { playbook: hit.playbook, cached: true }
    }
  } catch { /* no local copy */ }
  return load()
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
  keyAccepted(res)
  if (res.status === 401) {
    await keyRefused()
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
  keyAccepted(res)
  if (res.status === 401) {
    await keyRefused()
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
  // A new key is another person: their details and site recipes are fetched again.
  chrome.storage.local.remove(["oddsKitCache", "oddsPlaybooks"])
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
  // "odds apply" in the panel: the job is opened in the person's tab and its form filled in there (apply.js on LinkedIn, apply-any.js elsewhere).
  if (message?.type === "apply-in-tab" && typeof message.url === "string" && /^https:\/\//.test(message.url)) {
    const reveal = message.reveal === true
    const postingId = typeof message.postingId === "string" ? message.postingId : null
    openApplication(message.url, sender.tab, { reveal, postingId })
      .then(reply)
      .catch(() => reply({ ok: false, message: "Could not open the application tab. Try again from Odds." }))
    return true
  }
  // The panel asking how this job's application is going: the state its tab last reported (filling, needs_input, ready, failed), or none.
  if (message?.type === "application-status" && typeof message.url === "string") {
    ;(async () => {
      const job = globalThis.oddsSites.jobLink(message.url)?.url || message.url
      const postingId = typeof message.postingId === "string" && message.postingId ? message.postingId : null
      const { oddsApplyIntents = {} } = await chrome.storage.local.get("oddsApplyIntents")
      let found = null
      for (const [id, intent] of Object.entries(oddsApplyIntents)) {
        if (Date.now() - intent.at > INTENT_MS) continue
        const byPost = postingId && intent.postingId === postingId
        const byUrl = (globalThis.oddsSites.jobLink(intent.job)?.url || intent.job) === job
        if (!byPost && !byUrl) continue
        if (!found || intent.at > found.at) found = { ...intent, tabId: Number(id) }
      }
      if (!found) return reply({ state: null })
      const tab = await chrome.tabs.get(found.tabId).catch(() => null)
      if (!tab && !["submitted", "failed"].includes(found.status)) return reply({ state: null })
      reply({ state: { status: found.status || "filling", message: found.message || "", at: found.at, postingId: found.postingId || null } })
    })().catch(() => reply({ state: null }))
    return true
  }
  // All live applies (by postingId) so the tracker chips stay in sync with detail closed.
  if (message?.type === "application-statuses") {
    liveApplicationStatuses().then((runs) => reply({ runs })).catch(() => reply({ runs: [] }))
    return true
  }
  // A page asking whether it was opened to apply: the job it is for, while that is fresh (the tab's own, or the one that opened it).
  // "Fill with Odds" pressed on a form the person opened themselves: this tab becomes an application (the job is saved in the tracker),
  // Broods fills the page in front of them, and each page they move to is filled the same way (mode copilot).
  // The toolbar's "Fill with Odds": the page in front fills; a page Odds' script is not on yet (opened before a reload) gets it first.
  // The side panel's apply card: the page in front, the job Odds knows it as, what Odds will use, and how the filling is going.
  if (message?.type === "panel-apply-info") {
    ;(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
      const url = tab?.url || ""
      if (!tab || typeof tab.id !== "number" || !/^https:/.test(url) || /^https:\/\/(odds\.beeblast\.co|accounts\.google\.com|claude\.ai)/.test(url)) return reply({ page: null })
      const intent = await intentOf(tab.id)
      let kit = await Promise.race([kitFor(url, message.fresh === true).catch(() => null), new Promise((r) => setTimeout(() => r(null), 5000))])
      // A page Odds does not hold as a job (an employer's own form): asked once more with its title and the job the tab applies for.
      if (kit && !kit.job_id && !kitHinted.has(url) && (tab.title || intent?.postingId)) {
        kitHinted.add(url)
        kit = await Promise.race([kitFor(url, true, { title: String(tab.title || "").slice(0, 200), posting_id: intent?.postingId || null }).catch(() => kit), new Promise((r) => setTimeout(() => r(kit), 6000))])
      }
      const kind = await pageKindOf(tab.id)
      // Still no job: a job page is read from the page and kept for everyone, then asked about again (the card fills in by itself).
      if (kit && kit.status !== "connect" && !kit.job_id && !["captcha", "create_account", "sign_in"].includes(kind) && !enrichTried.has(url)) {
        const done = await Promise.race([enrichFromPage(tab.id, url, kind).catch(() => false), new Promise((r) => setTimeout(() => r(false), 9000))])
        if (done) kit = await Promise.race([kitFor(url, true, { title: String(tab.title || "").slice(0, 200), posting_id: intent?.postingId || null }).catch(() => kit), new Promise((r) => setTimeout(() => r(kit), 6000))])
      }
      const account = await siteAccount(new URL(url).hostname)
      const facts = kit?.facts || {}
      const answers = facts.answers || {}
      const has = (...keys) => keys.some((k) => typeof (facts[k] ?? answers[k]) === "string" && String(facts[k] ?? answers[k]).trim())
      const missing = [
        !has("phone") && "Phone", !has("place", "city") && "City", !has("street", "address", "address_line") && "Street address",
        !has("postcode", "postal_code", "zip") && "Postcode", !has("linkedin") && "LinkedIn", !has("dutch") && "Dutch level",
        !kit?.cv && "CV",
      ].filter(Boolean)
      reply({
        page: { tabId: tab.id, url, title: String(tab.title || "").slice(0, 160), form: formTabs.has(tab.id) || kind === "form", kind, account: Boolean(account) },
        connected: Boolean(kit && kit.status !== "connect"),
        job: kit?.job_title ? { title: kit.job_title, employer: kit.job_employer || null } : null,
        job_id: kit?.job_id || null,
        cv: kit?.cv ? kit.cv.name || kit.cv.file_name : null,
        letter: kit?.letter ? kit.letter.name || kit.letter.file_name : null,
        missing,
        status: intent ? { state: intent.status || "filling", message: String(intent.message || "").slice(0, 200) } : null,
      })
    })().catch(() => reply({ page: null }))
    return true
  }
  // The side panel: add the page's job to the person's Odds jobs; read the new answers on the form (Save to Autofill).
  if (message?.type === "panel-chance" && typeof message.tabId === "number" && typeof message.pct === "number") {
    const label = typeof message.label === "string" ? message.label : `${message.pct}%`
    chrome.tabs.sendMessage(message.tabId, { type: "odds-chance", pct: message.pct, label, url: typeof message.url === "string" ? message.url : "" }).catch(() => undefined)
    if (typeof message.url === "string") {
      savedKey().then((key) => {
        if (!key) return
        const id = `${key}:${message.url}`
        const cached = chanceCache.get(id)
        const answer = cached?.answer && typeof cached.answer === "object" ? { ...cached.answer, chance_pct: message.pct } : { status: "ok", known: true, chance_pct: message.pct }
        remember(id, answer)
      }).catch(() => undefined)
    }
    reply({ ok: true })
    return true
  }
  if (message?.type === "panel-add-job" && typeof message.url === "string") {
    addJob(message.url).then((res) => { kits.delete(message.url); reply(res) }).catch(() => reply({ status: "error" }))
    return true
  }
  if (message?.type === "panel-new-answers" && typeof message.tabId === "number") {
    chrome.tabs.sendMessage(message.tabId, { type: "odds-new-answers" }, { frameId: 0 }).then((res) => reply(res || { items: [] })).catch(() => reply({ items: [] }))
    return true
  }
  if (message?.type === "panel-keep-answers" && typeof message.tabId === "number" && Array.isArray(message.questions)) {
    const questions = message.questions.slice(0, 40).filter((q) => typeof q?.question === "string" && typeof q?.answer === "string").map((q) => ({ question: q.question.slice(0, 500), answer: q.answer.slice(0, 1000) }))
    ext("answers", { method: "POST", body: JSON.stringify({ questions, url: typeof message.url === "string" ? message.url : null }) }).then((res) => {
      chrome.tabs.sendMessage(message.tabId, { type: "odds-answers-kept", questions }, { frameId: 0 }).catch(() => undefined)
      reply(res)
    }).catch(() => reply({ error: true }))
    return true
  }
  // The side panel's Apply on a job page: the application opens in this same tab and is filled there, step by step (like Simplify).
  if (message?.type === "apply-here" && typeof message.tabId === "number" && typeof message.url === "string" && /^https:\/\//.test(message.url)) {
    applyHere(message.tabId, message.url, typeof message.postingId === "string" ? message.postingId : null).then(reply).catch(() => reply({ ok: false }))
    return true
  }
  // The orange Auto apply pill on a job page: same as the panel's Apply, for the tab the pill is in.
  if (message?.type === "auto-apply" && sender.tab && typeof sender.tab.id === "number") {
    const url = /^https:\/\//.test(String(message.url || "")) ? String(message.url) : String(sender.tab.url || "")
    if (!/^https:\/\//.test(url)) { reply({ ok: false }); return true }
    applyHere(sender.tab.id, url, null).then(reply).catch(() => reply({ ok: false }))
    return true
  }
  if (message?.type === "fill-tab" && typeof message.tabId === "number") {
    fillTab(message.tabId).then((ok) => reply({ ok }))
    return true
  }
  // The page showed a form after all: a "closed" stop on this tab was read too early and is dropped.
  if (message?.type === "drop-closed" && sender.tab && typeof sender.tab.id === "number") {
    changeIntents((all) => { if (all[sender.tab.id] && /no longer takes applications/i.test(String(all[sender.tab.id].message || ""))) delete all[sender.tab.id] }).then(() => reply({ ok: true }))
    return true
  }
  // What the page in front is (job / create_account / sign_in / captcha / form), for the side panel's one button.
  if (message?.type === "page-kind" && sender.tab && typeof sender.tab.id === "number" && sender.frameId === 0) {
    pageKinds.set(sender.tab.id, message.kind || null)
    void autoAccount(sender.tab.id, message.kind || null)
    reply({ ok: true })
    return true
  }
  // The saved logins page (the accounts Odds made, with Show / Copy / Forget): an extension page, so the passwords never reach a web page.
  if (message?.type === "panel-open-logins") {
    chrome.tabs.create({ url: chrome.runtime.getURL("logins.html") }).then(() => reply({ ok: true })).catch(() => reply({ ok: false }))
    return true
  }
  // Create account & Autofill / Sign in & Autofill from the side panel: the person's email and a password Odds makes for this site
  // (kept in this Chrome only), then the application is filled in this tab once the account step is past.
  if (message?.type === "panel-account" && typeof message.tabId === "number") {
    accountInTab(message.tabId, message.create === true).then(reply).catch(() => reply({ ok: false }))
    return true
  }
  // The page found an application form (or lost it): the toolbar icon says so with a pulsing orange "Fill".
  if (message?.type === "form-here" && sender.tab && typeof sender.tab.id === "number" && sender.frameId === 0) {
    if (message.on) formIsHere(sender.tab.id)
    else formGone(sender.tab.id)
    reply({ ok: true })
    return true
  }
  if (message?.type === "copilot-start" && sender.tab && typeof sender.tab.id === "number") {
    const tabId = sender.tab.id
    const url = String(message.url || sender.tab.url || "").slice(0, 2000)
    ;(async () => {
      const held = await intentOf(tabId)
      if (!held) await setIntent(tabId, { job: url, title: String(message.title || "").slice(0, 200), at: Date.now(), status: "filling", message: "Filling this page…", copilot: true, followed: false })
      else await changeIntents((all) => { if (all[tabId]) all[tabId] = { ...all[tabId], copilot: true, paused: false, at: Date.now() } })
      addJob(url).catch(() => undefined)
      reply({ ok: true })
    })().catch(() => reply({ ok: false }))
    return true
  }
  if (message?.type === "apply-intent" && sender.tab && typeof sender.tab.id === "number") {
    intentOf(sender.tab.id).then((intent) => reply({ intent }))
    return true
  }
  // The application was started: the tab no longer opens it by itself (going back to the job does not start it again).
  if (message?.type === "apply-started" && sender.tab && typeof sender.tab.id === "number") {
    changeIntents((all) => { if (all[sender.tab.id]) all[sender.tab.id].started = true }).then(() => reply({ ok: true }))
    return true
  }
  // A page about to open the employer's own application (a new tab or this one): the intent goes along.
  if (message?.type === "apply-follow" && sender.tab && typeof sender.tab.id === "number") {
    intentOf(sender.tab.id).then(async (intent) => {
      if (intent) followFrom.set(sender.tab.id, { ...intent, at: Date.now() })
      reply({ ok: Boolean(intent) })
    })
    return true
  }
  // Finding the application when the employer's link lands on their list of vacancies: what was tried survives page loads
  // (tries, dead ends), the job's title is kept for the checks, and the real form's address is learned for next time.
  if (message?.type === "apply-hunt" && sender.tab && typeof sender.tab.id === "number") {
    const tabId = sender.tab.id
    const tabUrl = typeof sender.tab.url === "string" ? sender.tab.url : ""
    ;(async () => {
      if (!(await intentOf(tabId))) return reply({ ok: false })
      let stop = null
      let learn = null
      // Every change is made on the newest record inside the queued write: progress updates arriving at the same time never wipe the count.
      await changeIntents((all) => {
        const intent = all[tabId]
        if (!intent) return
        const hunt = { tries: 0, dead: [], tried: [], ...(intent.hunt || {}) }
        if (message.op === "title" && typeof message.title === "string") {
          all[tabId] = { ...intent, title: message.title.slice(0, 200) }
        } else if (message.op === "note") {
          if (message.try) hunt.tries += 1
          if (typeof message.dead === "string" && !hunt.dead.includes(message.dead)) hunt.dead = [...hunt.dead, message.dead.slice(0, 500)].slice(-20)
          if (typeof message.label === "string" && !hunt.tried.includes(message.label)) hunt.tried = [...hunt.tried, message.label.slice(0, 120)].slice(-20)
          // Odds' own step back: the page it lands on must not take it for the person going back.
          if (message.back) hunt.backAt = Date.now()
          if (message.agent) hunt.agentCalls = (hunt.agentCalls || 0) + 1
          all[tabId] = { ...intent, hunt }
        } else if (message.op === "visit" && tabUrl) {
          // Loop stop across page loads: the same page 3 times, or 15 pages in one application, ends the run with a clear Stuck — never a reload storm.
          const page = tabUrl.split("#")[0]
          const visits = { ...(hunt.visits || {}) }
          visits[page] = (visits[page] || 0) + 1
          const loads = (hunt.loads || 0) + 1
          const keep = Object.fromEntries(Object.entries(visits).slice(-30))
          // Broods drives through in-between prompts (preferences, sign-in walls, job lists): room for that, still a hard stop.
          if (visits[page] >= 5 || loads >= 20) {
            let where = page
            try { const u = new URL(page); where = `${u.hostname}${u.pathname}` } catch { /* keep */ }
            stop = `Odds could not open the application form after assist: it kept landing on ${where.slice(0, 120)} without an application form. Open the job yourself and Odds fills it in.`
            all[tabId] = { ...intent, hunt: { ...hunt, visits: keep, loads }, status: "needs_input", message: stop, stopped: true, at: Date.now() }
          } else all[tabId] = { ...intent, hunt: { ...hunt, visits: keep, loads } }
        } else if (message.op === "form" && applicationPage(tabUrl) && !boardPage(tabUrl)) {
          // A real form: the search and the loop count start over (forms that reload the same address on every step are fine).
          all[tabId] = { ...intent, formSeen: true, stopped: false, hunt: { ...hunt, tries: 0, visits: {}, loads: 0 } }
          learn = intent.postingId || (intent.job ? `job:${jobKeyOf(intent.job, null)}` : "")
        }
      })
      if (learn) {
        const { oddsLearnedApply = {} } = await chrome.storage.local.get("oddsLearnedApply")
        oddsLearnedApply[learn] = { url: tabUrl, at: Date.now() }
        // Keep the store small: the most recent 300 jobs.
        const keep = Object.entries(oddsLearnedApply).sort((x, y) => y[1].at - x[1].at).slice(0, 300)
        await chrome.storage.local.set({ oddsLearnedApply: Object.fromEntries(keep) })
      }
      const fresh = await intentOf(tabId)
      reply({ ok: true, title: fresh?.title || null, hunt: fresh?.hunt || { tries: 0, dead: [], tried: [] }, formSeen: Boolean(fresh?.formSeen), ...(stop ? { stop: true, message: stop } : {}) })
    })().catch(() => reply({ ok: false }))
    return true
  }
  // Broods asks for a mail (a site's verification code or link): Gmail is opened in another tab of this Chrome (the person is signed in), polled
  // for a new message, read, and the tab is closed when the run asks again later or ends. Nothing is stored; only what the tool returns leaves.
  if (message?.type === "drive-mail" && sender.tab && typeof sender.tab.id === "number") {
    readMail(sender.tab.id, { from: String(message.from || ""), subject: String(message.subject || "") })
      .then(reply).catch((e) => reply({ error: String(e?.message || e).slice(0, 200) }))
    return true
  }
  // Broods looks at the application tab (only when its page tools are stuck): the tab is the visible one in the Odds window, so no focus is taken.
  if (message?.type === "drive-shot" && sender.tab && typeof sender.tab.id === "number") {
    const tab = sender.tab
    ;(async () => {
      // Through the debugger first: it needs no focus and shows the page whether or not its tab is in front.
      const viaDebugger = await shotViaDebugger(tab.id)
      if (viaDebugger.image) return reply(viaDebugger)
      // Look only when it disturbs no one: the tab is already showing, or it sits in a window the person is not using (the Odds window).
      // Never switch tabs in the window the person is working in; Broods then works from read_page.
      if (!tab.active) {
        const win = await chrome.windows.get(tab.windowId).catch(() => null)
        if (win?.focused) return reply(viaDebugger.blank ? viaDebugger : { error: "The application tab is in the window you are using; Odds does not switch your tabs to look. Use read_page." })
        await chrome.tabs.update(tab.id, { active: true }).catch(() => undefined)
        await new Promise((r) => setTimeout(r, 400))
      }
      // A window that is minimised or covered cannot be read back at once: one retry, then say plainly what to do instead.
      const grab = () => chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 55 })
      const url = await grab().catch(async () => { await new Promise((r) => setTimeout(r, 700)); return grab() }).catch(() => null)
      if (!url) return reply(viaDebugger.blank ? viaDebugger : { error: "This tab cannot be seen right now (its window is minimised or hidden). Work from read_page; do not retry screenshot." })
      const size = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => ({ w: innerWidth, h: innerHeight }) }).then((r) => r?.[0]?.result).catch(() => null)
      const bitmap = await createImageBitmap(await (await fetch(url)).blob())
      // A window macOS does not paint gives a white picture here too: then the debugger's answer (with why) stands.
      if (viaDebugger.blank && (await shotSpread(url.split(",")[1] || "")) < BLANK_SPREAD) { bitmap.close(); return reply(viaDebugger) }
      const width = Math.min(1280, bitmap.width)
      const height = Math.round(bitmap.height * width / bitmap.width)
      const canvas = new OffscreenCanvas(width, height)
      canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height)
      bitmap.close()
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/jpeg", quality: 0.65 })).arrayBuffer())
      let binary = ""
      for (const byte of bytes) binary += String.fromCharCode(byte)
      reply({ image: btoa(binary), width, height, viewportWidth: size?.w, viewportHeight: size?.h })
    })().catch((e) => reply({ error: String(e?.message || e).slice(0, 200) }))
    return true
  }
  if (message?.type === "drive-recipe" && sender.tab?.id) {
    changeIntents(all => {
      const intent = all[sender.tab.id]
      if (intent) intent.recipePending = message.pending && typeof message.pending === "object" ? message.pending : null
    }).then(() => reply({ ok: true })).catch(() => reply({ ok: false }))
    return true
  }
  // Broods drives the application tab: start (or resume after a page change) a run, take its next command, send back the result.
  if (message?.type === "drive" && sender.tab && typeof sender.tab.id === "number" && ["start", "next", "result", "continue", "playbook"].includes(message.op)) {
    const tabId = sender.tab.id
    // One start per tab at a time: the page and an embedded ATS frame asking together join the same run (never two agents on one form).
    if (message.op === "start") {
      const pending = driveStarts.get(tabId)
      if (pending) { pending.then((res) => reply(res)).catch(() => reply(null)); return true }
    }
    const body = message.op === "start"
      ? { ext_version: chrome.runtime.getManifest().version, url: String(message.url || ""), page: String(message.page || ""), run_id: typeof message.run_id === "string" ? message.run_id : null, recipe_attempts: message.recipe_attempts || [], tab_id: tabId, ...(message.ready === true ? { ready: true } : {}), ...(message.copilot === true ? { copilot: true } : {}), ...(message.odds_filled && typeof message.odds_filled === "object" ? { odds_filled: message.odds_filled } : {}) }
      : message.op === "playbook" ? { page: String(message.page || "") }
      : message.op === "next" ? { run_id: message.run_id, fresh: message.fresh === true, hold: message.hold === true, tab_id: tabId }
      : message.op === "continue" ? { run_id: message.run_id }
      : { run_id: message.run_id, id: message.id, result: message.result ?? null, tab_id: tabId, doc_gen: message.doc_gen }
    const call = (async () => {
      // A start asked while another page load of this tab already holds a run resumes that run.
      if (message.op === "start" && !body.run_id) {
        const held = (await intentOf(tabId))?.driveRun
        if (typeof held === "string") body.run_id = held
      }
      // Site recipes change slowly: the copy kept for this host answers at once and is refreshed for the next page.
      if (message.op === "playbook") return playbookFor(body.page)
      const res = await ext(`drive-${message.op}`, { method: "POST", body: JSON.stringify(body) })
      // The run follows the tab across page loads: the next page resumes it instead of starting another.
      if (message.op === "start" && typeof res?.run_id === "string") await changeIntents((all) => { if (all[tabId]) all[tabId] = { ...all[tabId], driveRun: res.run_id } })
      // ext() separates transport status from the application stage. Restore the
      // terminal stage for drive clients, which must distinguish Review from Stuck.
      return res?.status === "ok" && res.done && typeof res.result === "string"
        ? { ...res, status: res.result } : res
    })()
    if (message.op === "start") { driveStarts.set(tabId, call); call.finally(() => setTimeout(() => driveStarts.delete(tabId), 3000)) }
    call.then((res) => reply(res)).catch(() => reply(null))
    return true
  }
  // The person went back a step (Back, or the form's own Back/Previous): Odds pauses there and the app says so; their own Next/Apply resumes.
  if (message?.type === "apply-pause" && sender.tab && typeof sender.tab.id === "number") {
    const tabId = sender.tab.id
    const paused = message.resume !== true
    changeIntents((all) => {
      if (!all[tabId]) return
      all[tabId] = { ...all[tabId], paused, at: Date.now(), status: paused ? "needs_input" : "filling", message: paused ? String(message.message || PAUSED_MESSAGE).slice(0, 500) : "Continuing where you are…" }
    }).then(() => reply({ ok: true })).catch(() => reply({ ok: false }))
    return true
  }
  // Keep offsite handoffs inside the application's background tab. A short-lived
  // A CV button with no file field behind it (Hunkemöller): the site makes its file picker only when the button is clicked. For the next
  // 5 s, a file picker the page opens is kept on the page (hidden) instead of opening the system dialog, so Odds can put the CV in it.
  // Real mouse and keyboard for a field that refused Odds' own events (masked dates, toggles, search lists): Chrome's debugger sends
  // input the site cannot tell from a person's. Attached only for this one action, then detached at once.
  if (message?.type === "real-input" && sender.tab && typeof sender.tab.id === "number") {
    realInput(sender.tab.id, message).then(reply, (e) => reply({ ok: false, error: String(e?.message || e).slice(0, 160) }))
    return true
  }
  if (message?.type === "catch-file-picker" && sender.tab && typeof sender.tab.id === "number") {
    chrome.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] }, world: "MAIN", func: () => {
      const proto = HTMLInputElement.prototype
      const click = proto.click
      const picker = proto.showPicker
      const keep = function (input) {
        if (!input.isConnected) { input.style.display = "none"; document.body.appendChild(input) }
        input.setAttribute("data-odds-picker", String(Date.now()))
      }
      // Sites open it three ways: input.click(), input.showPicker(), or a click event fired at a made-up input (Hunkemöller).
      const dispatch = EventTarget.prototype.dispatchEvent
      proto.click = function (...args) { if (this.type === "file") return keep(this); return click.apply(this, args) }
      if (picker) proto.showPicker = function (...args) { if (this.type === "file") return keep(this); return picker.apply(this, args) }
      EventTarget.prototype.dispatchEvent = function (event) {
        if (event?.type === "click" && this instanceof HTMLInputElement && this.type === "file") { keep(this); return true }
        return dispatch.call(this, event)
      }
      setTimeout(() => { proto.click = click; if (picker) proto.showPicker = picker; EventTarget.prototype.dispatchEvent = dispatch }, 5000)
    } }).then(() => reply({ ok: true }), () => reply({ ok: false }))
    return true
  }
  // MAIN-world window.open wrapper avoids popup blocking without activating it.
  if (message?.type === "apply-arm-offsite" && sender.tab && typeof sender.tab.id === "number") {
    const tabId = sender.tab.id
    ;(async () => {
      const tab = await chrome.tabs.get(tabId).catch(() => null)
      await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: () => {
        const original = window.open
        const wrapped = function(url, ...args) {
          try {
            const next = new URL(String(url || ""), location.href)
            if (["http:", "https:"].includes(next.protocol) && url) {
              location.assign(next.href)
              return window
            }
          } catch { /* Let the browser reject unsupported destinations normally. */ }
          return original.call(window, url, ...args)
        }
        window.open = wrapped
        setTimeout(() => { if (window.open === wrapped) window.open = original }, 5000)
      } })
      reply({ ok: true, wasActive: Boolean(tab?.active) })
    })().catch(() => reply({ ok: false, wasActive: false }))
    return true
  }
  if (message?.type === "apply-disarm-offsite" && sender.tab && typeof sender.tab.id === "number") {
    reply({ ok: true })
    return false
  }
  // A LinkedIn job applied for on the employer's site: their form opens in the same tab, which is still applying for that job.
  if (message?.type === "apply-go" && sender.tab && typeof sender.tab.id === "number" && typeof message.url === "string" && /^https:\/\//.test(message.url)) {
    const tabId = sender.tab.id
    intentOf(tabId).then(async (intent) => {
      if (!intent) return reply({ ok: false })
      const next = preferEnglishApplyUrl(message.url)
      const cur = sender.tab.url || ""
      // Same path already open (e.g. Workday + locale=en_US rewrite): do not reload — that caused Philips "1 Erreur" reopen loops.
      try {
        const a = new URL(next)
        const b = new URL(cur)
        if (a.origin === b.origin && a.pathname.replace(/\/$/, "") === b.pathname.replace(/\/$/, "")) {
          await setIntent(tabId, { ...intent, at: Date.now(), followed: true })
          return reply({ ok: true, skipped: true })
        }
      } catch { /* navigate */ }
      await setIntent(tabId, { ...intent, at: Date.now(), followed: true })
      await oddsGo(tabId, next)
      reply({ ok: true })
    })
    return true
  }
  // Applying: what the form needs, the person's own answers kept, the job marked applied, their CV for the upload.
  if (message?.type === "apply-kit" && typeof message.url === "string") {
    // The local copy, answered at once; a refresh starts in the background for the next page.
    if (message.cached === true) {
      cachedKit().then((kit) => { if (kit) void kitFor(message.url).catch(() => undefined); reply(kit ? { ...kit, cached: true } : { status: "none" }) })
      return true
    }
    // Always an answer: a failed fetch is "error" (the page retries), never silence the page would read as "not connected".
    kitFor(message.url).then(reply).catch(() => { kits.delete(message.url); reply({ status: "error", message: "odds did not answer." }) })
    return true
  }
  if (message?.type === "application-questions" && sender.tab && typeof message.url === "string") {
    ext("application-questions", { method: "POST", body: JSON.stringify({ url: message.url, questions: message.questions }) }).then(reply)
    return true
  }
  if (message?.type === "suggest-answers" && sender.tab && typeof message.url === "string") {
    ext("suggest-answers", { method: "POST", body: JSON.stringify({ url: message.url, questions: Array.isArray(message.questions) ? message.questions : [], broods_only: message.broods_only === true }) }).then(reply)
    return true
  }
  if (message?.type === "suggest-action" && sender.tab && typeof message.url === "string") {
    const buttons = Array.isArray(message.buttons)
      ? message.buttons.filter((b) => typeof b === "string" || (b && typeof b === "object" && typeof b.text === "string")).slice(0, 40)
      : []
    const exclude = Array.isArray(message.exclude) ? message.exclude.filter((t) => typeof t === "string").slice(0, 12) : []
    ext("suggest-action", {
      method: "POST",
      body: JSON.stringify({
        url: message.url,
        buttons,
        status: typeof message.status === "string" ? message.status : null,
        force_llm: message.force_llm === true,
        exclude,
      }),
    }).then(reply)
    return true
  }
  if (message?.type === "suggest-scan" && sender.tab && typeof message.url === "string") {
    const snapshot = message.snapshot && typeof message.snapshot === "object" ? message.snapshot : {}
    ext("suggest-scan", {
      method: "POST",
      body: JSON.stringify({
        url: message.url,
        status: typeof message.status === "string" ? message.status : null,
        snapshot,
      }),
    }).then(reply)
    return true
  }
  if (message?.type === "application-refresh-answers" && sender.tab) {
    ext("answers").then(reply)
    return true
  }
  if (message?.type === "save-answers" && Array.isArray(message.questions)) {
    const questions = message.questions.slice(0, 40).filter((q) => typeof q?.question === "string" && typeof q?.answer === "string").map((q) => ({ question: q.question.slice(0, 500), answer: q.answer.slice(0, 1000) }))
    ext("answers", { method: "POST", body: JSON.stringify({ questions, url: typeof message.url === "string" ? message.url : null }) }).then(reply)
    return true
  }
  if (message?.type === "applied" && typeof message.url === "string") {
    ext("applied", { method: "POST", body: JSON.stringify({ url: message.url }) }).then(reply)
    return true
  }
  // LinkedIn (or employer) says applications closed — set postings.closed_at for everyone.
  if (message?.type === "job-closed" && typeof message.url === "string" && /^https:\/\//.test(message.url)) {
    ext("job-closed", { method: "POST", body: JSON.stringify({ url: message.url }) }).then(reply)
    return true
  }
  if (message?.type === "cv-file" && typeof message.doc === "string") {
    cvFileFor(message.doc).then(reply)
    return true
  }
  if (message?.type === "lookup-cached" && typeof message.url === "string") {
    ;(async () => {
      const key = await savedKey()
      await cacheReady
      const cached = key && chanceCache.get(`${key}:${message.url}`)
      reply(cached && cached.until > Date.now() ? cached.answer : null)
    })().catch(() => reply(null))
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
  if (message?.type === "native-panel-open") {
    reply({ open: sidePanels.size > 0 })
    return false
  }
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
    Promise.all([savedKey(), chrome.storage.local.get("oddsBoardSession")]).then(([key, got]) => {
      reply({ connected: key !== null, boards: got.oddsBoardSession && typeof got.oddsBoardSession === "object" ? got.oddsBoardSession : {} })
    })
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

// Applying from the panel: which tabs were opened to apply, for which job. Kept a few minutes (a sign-in or a slow page may come between),
// in local storage so neither a sleeping worker nor a reload of the extension forgets it.
const INTENT_MS = 60 * 60_000
const followFrom = new Map()
// Every change goes through one queue: tabs applying side by side report at the same time, and a read-modify-write would lose one of them.
let intentWrites = Promise.resolve()
function changeIntents(change) {
  const next = intentWrites.catch(() => undefined).then(async () => {
    const { oddsApplyIntents = {} } = await chrome.storage.local.get("oddsApplyIntents")
    for (const [id, it] of Object.entries(oddsApplyIntents)) if (Date.now() - it.at > 7 * 24 * INTENT_MS) delete oddsApplyIntents[id]
    change(oddsApplyIntents)
    await chrome.storage.local.set({ oddsApplyIntents })
  })
  intentWrites = next
  return next
}
// An application starting in a tab that already shows an account step (Auto apply pressed there) gets the same account step as one that reaches it.
function setIntent(tabId, intent) { return changeIntents((all) => { all[tabId] = intent }).then((r) => { void autoAccount(tabId, pageKinds.get(tabId) || null); return r }) }
/** Extension/browser restart invalidates old content-script ports. Stop their server runs before dropping tab ownership. */
async function stopAndClearApplyIntents(message) {
  const { oddsApplyIntents = {} } = await chrome.storage.local.get("oddsApplyIntents")
  const runs = [...new Set(Object.values(oddsApplyIntents).map((it) => it?.driveRun).filter((id) => typeof id === "string"))]
  await Promise.allSettled(runs.map((run_id) => ext("drive-stop", { method: "POST", body: JSON.stringify({ run_id, message }) })))
  await chrome.storage.local.remove("oddsApplyIntents")
}
// Tab ids are reused once the browser restarts: an application is only remembered across a reload of the extension.
chrome.runtime.onStartup.addListener(() => { void stopAndClearApplyIntents("Chrome restarted while Odds was applying. Press Apply with Odds to carry on.") })
// Reloaded or updated: every application record from before is dropped, so no tab the person is using stays attached to an old run.
chrome.runtime.onInstalled.addListener(() => { void stopAndClearApplyIntents("The Odds extension was updated while applying. Press Apply with Odds to carry on.") })
// The person takes an application tab for themselves (types an address, a bookmark, the address bar): Odds lets go of that tab and pauses
// the run, so it never works on a page they opened. Odds' own clicks and the site's redirects keep the application.
chrome.webNavigation?.onCommitted.addListener((d) => {
  if (d.frameId !== 0) return
  // Chrome's own hidden loads (the address bar warming up a search, a prerendered page) are not the person opening anything.
  if (d.documentLifecycle === "prerender" || /^https:\/\/www\.google\.[a-z.]+\/search\/warmup\.html/.test(d.url || "")) return
  const q = d.transitionQualifiers || []
  // Back/Forward is handled by the pause (the person went back a step), not here.
  if (q.includes("forward_back")) return
  const theirs = ["typed", "auto_bookmark", "generated", "keyword", "keyword_generated"].includes(d.transitionType) || q.includes("from_address_bar")
  if (!theirs) return
  // Odds opens and moves its own tabs (tabs.update / tabs.create): those navigations are the application's, never "the person took the tab".
  if (oddsNavigating.has(d.tabId)) return
  // Broods (or Odds) just clicked in this tab: the site moving on from that click (Unilever → its Workday site) is the application,
  // even when Chrome files it as a "generated" navigation. Only a navigation well after the last click is the person's.
  const clicked = followFrom.get(d.tabId)
  if (clicked && Date.now() - clicked.at < 15_000) return
  personTookTab(d.tabId)
})
/** The person took this application tab for themselves: Odds lets go of it, tells Broods to stop, keeps a paused record for the app. */
function personTookTab(tabId) {
  void changeIntents((all) => {
    const it = all[tabId]
    if (!it) return
    delete all[tabId]
    // Broods stops too: its run is over, nothing more is sent to this tab.
    if (typeof it.driveRun === "string") void ext("drive-stop", { method: "POST", body: JSON.stringify({ run_id: it.driveRun, message: "The person opened something else in the application tab." }) }).catch(() => undefined)
    // Kept as a paused run under another key, so Odds still shows what happened (no tab is attached to it any more).
    all[`left-${tabId}-${Date.now()}`] = { ...it, at: Date.now(), status: "needs_input", paused: true, message: "You opened something else in the application tab, so Odds stopped there. Press Apply with Odds to start again." }
  }).catch(() => undefined)
}
globalThis.personTookTab = personTookTab
async function intentOf(tabId) {
  const { oddsApplyIntents = {} } = await chrome.storage.local.get("oddsApplyIntents")
  const intent = oddsApplyIntents[tabId]
  return intent && Date.now() - intent.at < INTENT_MS ? intent : null
}
/** Live apply rows for the Odds app tracker — one per postingId, newest wins. */
async function liveApplicationStatuses() {
  const { oddsApplyIntents = {} } = await chrome.storage.local.get("oddsApplyIntents")
  const byPost = new Map()
  for (const [id, intent] of Object.entries(oddsApplyIntents)) {
    if (!intent || Date.now() - intent.at > INTENT_MS) continue
    const postingId = typeof intent.postingId === "string" && intent.postingId ? intent.postingId : null
    if (!postingId) continue
    const status = intent.status || "filling"
    if (!["filling", "needs_input", "ready", "submitted", "failed"].includes(status)) continue
    const tab = await chrome.tabs.get(Number(id)).catch(() => null)
    if (!tab && !["submitted", "failed"].includes(status)) continue
    const prev = byPost.get(postingId)
    if (prev && prev.at >= intent.at) continue
    byPost.set(postingId, {
      postingId,
      status,
      message: String(intent.message || "").slice(0, 500),
      at: intent.at,
      url: typeof intent.job === "string" ? intent.job : null,
      // The Broods run in this tab: the app reads the run itself (the truth) over this tab's last line.
      runId: typeof intent.driveRun === "string" ? intent.driveRun : null,
    })
  }
  return [...byPost.values()]
}
// Serialize double clicks per vacancy, and focus the existing application rather than lose its filled fields.
const applicationStarts = new Map()
/**
 * Bring the apply tab (+ its window) forward when the person pressed Open tab.
 * Uses highlight + drawAttention — tabs.update alone often fails when the tab is in another Chrome window.
 */
async function revealApplicationTab(tabId, revealFocus) {
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  if (!tab || typeof tab.id !== "number") return
  await chrome.tabs.update(tab.id, { active: true }).catch(() => undefined)
  if (typeof tab.index === "number" && typeof tab.windowId === "number") {
    await chrome.tabs.highlight({ windowId: tab.windowId, tabs: [tab.index] }).catch(() => undefined)
  }
  if (revealFocus && typeof tab.windowId === "number") {
    await chrome.windows.update(tab.windowId, { focused: true, drawAttention: true }).catch(() => undefined)
  }
}
/**
 * A form Odds filled is ready for the person's check and Submit, or needs them (a question, a sign-in): a Chrome notification, once per
 * change, unless they are already looking at that tab. Clicking it brings the filled tab forward. Odds never sends the application.
 */
async function notifyApplication(tabId, title, status, message) {
  if (!chrome.notifications?.create) return
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  if (!tab) return
  const focused = await chrome.windows.getLastFocused().catch(() => null)
  if (tab.active && focused?.focused && focused.id === tab.windowId) return
  const job = String(title || tab.title || "your application").replace(/\s+/g, " ").trim().slice(0, 80)
  await chrome.notifications.create(`odds-tab-${tabId}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
    title: status === "ready" ? "Ready to send: check it and press Submit" : "Odds needs you to carry on",
    message: status === "ready" ? job : `${job}: ${String(message || "").replace(/\s+/g, " ").slice(0, 120)}`,
    priority: 1,
  })
}
chrome.notifications?.onClicked.addListener((id) => {
  const m = /^odds-tab-(\d+)$/.exec(id)
  if (m) revealApplicationTab(Number(m[1]), true).catch(() => undefined)
  chrome.notifications.clear(id).catch?.(() => undefined)
})
chrome.tabs.onRemoved.addListener((tabId) => { chrome.notifications?.clear(`odds-tab-${tabId}`).catch?.(() => undefined) })

/** Content scripts die on extension reload; reinject so Continue can talk to the same tab without wiping the form. */
async function injectApplyScripts(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  if (!tab?.url || !/^https?:/i.test(tab.url)) return false
  let host = ""
  try { host = new URL(tab.url).hostname } catch { return false }
  const linkedin = /(^|\.)linkedin\.com$/i.test(host)
  const odds = /(^|\.)beeblast\.co$/i.test(host) || /^localhost$/i.test(host)
  if (odds) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content-site.js"] }).catch(() => undefined)
    return true
  }
  const files = linkedin
    ? ["job-sites.js", "site-dom.js", "panel.js", "content-job.js", "mascot.js", "application-handoff.js", "apply.js"]
    : ["job-sites.js", "site-dom.js", "panel.js", "content-job.js", "mascot.js", "application-handoff.js", "apply-any.js"]
  await chrome.scripting.executeScript({ target: { tabId }, files }).catch(() => undefined)
  await chrome.scripting.insertCSS({ target: { tabId }, files: ["content-job.css"] }).catch(() => undefined)
  return true
}
/** Ping the apply script; if the extension was reloaded, reinject, then send Continue. */
async function continueInTab(tabId, { reveal = false } = {}) {
  if (reveal) await revealApplicationTab(tabId, true)
  const ping = () => chrome.tabs.sendMessage(tabId, { type: "application-ping" }).then(() => true).catch(() => false)
  if (!await ping()) {
    const injected = await injectApplyScripts(tabId)
    // Content script must attach its Continue listener before we ping it (reload / reinject).
    await new Promise((r) => setTimeout(r, 400))
    if (!injected || !await ping()) {
      const message = "Odds could not reconnect to the application page. Reload it, then press Apply with Odds again."
      await changeIntents((all) => { if (all[tabId]) all[tabId] = { ...all[tabId], status: "failed", message, at: Date.now() } }).catch(() => undefined)
      return false
    }
  }
  const delivered = await chrome.tabs.sendMessage(tabId, { type: "application-continue" }).then(() => true).catch(() => false)
  if (!delivered) {
    const message = "Odds could not reconnect to the application page. Reload it, then press Apply with Odds again."
    await changeIntents((all) => { if (all[tabId]) all[tabId] = { ...all[tabId], status: "failed", message, at: Date.now() } }).catch(() => undefined)
  }
  return delivered
}
/** Find the open apply tab for a phone/desktop run after a reload (session map gone; intents in local still hold). */
async function tabForApplicationRun(runId, postingId) {
  const runs = await updateApplicationRuns(() => {})
  const known = runs[runId]
  if (known?.tabId) {
    const tab = await chrome.tabs.get(known.tabId).catch(() => null)
    if (tab) return tab
  }
  const { oddsApplyIntents = {} } = await chrome.storage.local.get("oddsApplyIntents")
  for (const [id, intent] of Object.entries(oddsApplyIntents)) {
    if (intent.runId !== runId && !(postingId && intent.postingId === postingId)) continue
    const tab = await chrome.tabs.get(Number(id)).catch(() => null)
    if (!tab) continue
    await updateApplicationRuns((current) => { current[runId] = { id: runId, tabId: tab.id, resumeVersion: current[runId]?.resumeVersion || 0, postingId: postingId || intent.postingId || null } })
    return tab
  }
  return null
}
/** Prefer English on multilingual ATS URLs so Apply labels match recipes; users' browser locale otherwise opens FR/VI/DE… */
/** Job platforms that serve every page in English at the same address with an English locale (Workday, SuccessFactors, Oracle,
 * Cornerstone). Elsewhere a language segment is the site's own page: /nl/ → /en-US/ on Ormit was a 404, read as "job closed". */
const ENGLISH_BY_LOCALE = /(\.myworkday(jobs|site)\.com|\.successfactors\.(com|eu)|\.oraclecloud\.com|\.csod\.com)$/i
function preferEnglishApplyUrl(url) {
  try {
    const u = new URL(url)
    if (!ENGLISH_BY_LOCALE.test(u.hostname)) return url
    u.pathname = u.pathname
      .replace(/\/([a-z]{2})-([A-Z]{2})(?=\/|$)/g, (m, lang, region) => (lang.toLowerCase() === "en" ? m : `/en-${region === "GB" ? "GB" : "US"}`))
      .replace(/\/(fr|nl|de|vi|es|it|pl|pt)(?=\/|$)/i, "/en-US")
    for (const key of ["locale", "lang", "language", "localeCode"]) {
      const v = u.searchParams.get(key)
      if (v && !/^en/i.test(v)) u.searchParams.set(key, /_/.test(v) ? "en_US" : "en-US")
    }
    // Workday / SuccessFactors often keep UI language from cookie / Accept-Language unless locale is forced.
    if (/\.myworkday(jobs|site)\.com$/i.test(u.hostname) || /\.successfactors\.(com|eu)$/i.test(u.hostname)) {
      const loc = u.searchParams.get("locale") || ""
      if (!loc || !/^en/i.test(loc)) u.searchParams.set("locale", "en_US")
    }
    return u.href
  } catch {
    return url
  }
}
/** Whether a page title or heading names this job ("Apply for: B2C Marketing Intern" for "B2C MARKETING INTERN (CONTENT & RETAIL)"): most of its words. */
function namesJob(jobTitle, text) {
  const words = (t) => (t || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !/^(the|and|for|with|van|een|der|die|het|m\/v|mvx|fte)$/.test(w))
  const want = [...new Set(words(jobTitle))]
  if (want.length < 2) return false
  const have = new Set(words(text))
  return want.filter((w) => have.has(w)).length / want.length >= 0.6
}
/** Where the person's application for a job really is, once found (the employer's form, not their list of vacancies): the next run opens it directly. */
/** Odds' own pages and the tools around it (Broods' dashboard, Claude, sign-in) are never an application, whatever tab they open in. */
const NOT_APPLICATION = /(^|\.)(broods\.app|beeblast\.co|claude\.ai|anthropic\.com|accounts\.google\.com)$/i
function applicationPage(url) {
  try { const u = new URL(url); return u.protocol === "https:" && !NOT_APPLICATION.test(u.hostname) } catch { return false }
}
/** A job board's own pages (Glassdoor's search results, a LinkedIn or Indeed list): never "where this job's application is" — their search box looks like a form. */
const JOB_BOARD_HOST = /(^|\.)(glassdoor|indeed|linkedin|magnet\.me|stepstone|monsterboard|nationalevacaturebank|werkzoeken|jobbird)\./i
function boardPage(url) {
  try { return JOB_BOARD_HOST.test(new URL(url).hostname) } catch { return false }
}
/** The employer's own form for a job listed on a board, from the server (Promise of a URL or null; never waits more than 4 s). */
async function directApplyUrl(url) {
  const kit = await Promise.race([kitFor(url).catch(() => null), new Promise((r) => setTimeout(() => r(null), 4000))])
  const direct = kit?.apply_url
  return typeof direct === "string" && applicationPage(direct) ? direct : null
}
async function learnedApplyUrl(postingId, job) {
  if (!postingId && !job) return null
  const { oddsLearnedApply = {} } = await chrome.storage.local.get("oddsLearnedApply")
  const url = (postingId && oddsLearnedApply[postingId]?.url) || (job && oddsLearnedApply[`job:${jobKeyOf(job, null)}`]?.url)
  // (a board's page learned by an older build — Glassdoor's search results — is ignored, not followed)
  return typeof url === "string" && applicationPage(url) && !boardPage(url) ? url : null
}
/** Tabs Odds itself is sending somewhere right now (opening the job, apply-go): their next navigation is the application's own. */
const oddsNavigating = new Set()
function oddsGo(tabId, url, extra = {}) {
  oddsNavigating.add(tabId)
  setTimeout(() => oddsNavigating.delete(tabId), 15000)
  return chrome.tabs.update(tabId, { url, ...extra })
}
/** Drive starts in flight per tab (see the drive handler). */
const driveStarts = new Map()
const PAUSED_MESSAGE = "You went back a step, so Odds paused here. Press Next or Apply yourself and Odds carries on, or press Apply with Odds again."
/**
 * The Odds window: one separate Chrome window for applications, created unfocused at the side of the screen so it never covers what the
 * person is doing. Reused while it is open; its first blank tab is closed once an application tab is in it.
 */
async function oddsWindow(reveal) {
  const { oddsRunWindow } = await chrome.storage.session.get("oddsRunWindow").catch(() => ({}))
  if (typeof oddsRunWindow === "number") {
    const w = await chrome.windows.get(oddsRunWindow).catch(() => null)
    if (w) { if (reveal) await chrome.windows.update(w.id, { focused: true, state: "normal" }).catch(() => undefined); return w.id }
  }
  const main = await chrome.windows.getLastFocused({ windowTypes: ["normal"] }).catch(() => null)
  const width = 1100
  const left = typeof main?.left === "number" && typeof main?.width === "number" ? Math.max(0, main.left + main.width - width) : undefined
  const created = await chrome.windows.create({ url: "about:blank", focused: Boolean(reveal), type: "normal", width, height: 820, ...(left !== undefined ? { left, top: main?.top ?? 0 } : {}) }).catch(() => null)
  if (!created?.id) return typeof main?.id === "number" ? main.id : null
  await chrome.storage.session.set({ oddsRunWindow: created.id }).catch(() => undefined)
  // The window's own blank tab goes once the application tab is in.
  const blank = created.tabs?.[0]?.id
  if (typeof blank === "number") setTimeout(() => chrome.tabs.remove(blank).catch(() => undefined), 1500)
  return created.id
}
/** Stable key for one vacancy: posting id when Odds sent it, else the canonical job link, else the exact apply URL (never merge unknown boards). */
function jobKeyOf(url, postingId) {
  if (postingId) return `post:${postingId}`
  return globalThis.oddsSites.jobLink(url)?.url || url
}
/**
 * Open or resume an application. By default this is silent: a background window, no tab switch, no OS focus steal.
 * `reveal: true` when the person pressed Open tab (including mid-fill, Review, captcha, account).
 * One job → one tab (resume the same tab; never attach another job's tab).
 */
function openApplication(url, from, opts = {}) {
  const reveal = opts.reveal === true
  const postingId = typeof opts.postingId === "string" && opts.postingId ? opts.postingId : null
  const applyUrl = preferEnglishApplyUrl(url)
  const job = jobKeyOf(applyUrl, postingId) || jobKeyOf(url, postingId)
  kitFor(applyUrl, true).catch(() => undefined)
  if (applicationStarts.has(job)) return applicationStarts.get(job)
  const opening = (async () => {
    if (!await savedKey()) return { ok: false, message: "Connect Odds from the extension icon first." }
    const { oddsApplyIntents = {} } = await chrome.storage.local.get("oddsApplyIntents")
    let matched = null
    for (const [id, intent] of Object.entries(oddsApplyIntents)) {
      if (intent.status === "submitted") continue
      const intentKey = jobKeyOf(intent.job, intent.postingId)
      // Same job by posting id, by full key, or by canonical URL alone (so Open application tab
      // still finds the tab when one side has postingId and the other only has the LinkedIn URL).
      const sameByPost = Boolean(postingId && intent.postingId && intent.postingId === postingId)
      const sameByUrl = jobKeyOf(intent.job, null) === jobKeyOf(applyUrl, null) || jobKeyOf(intent.job, null) === jobKeyOf(url, null)
      const sameJob = sameByPost || sameByUrl || intentKey === job
      if (!sameJob) continue
      const tab = await chrome.tabs.get(Number(id)).catch(() => null)
      if (!tab) {
        // Dead tab id — drop so we can reopen; keep looking for another match.
        await changeIntents((all) => { delete all[id] })
        continue
      }
      matched = { tab, intent }
      break
    }
    // Recover an already-open exact application URL even when an older extension
    // pruned its intent. Never match only by employer host: vacancies share hosts.
    if (!matched && reveal) {
      const sameApplication = value => {
        try {
          const wanted = new URL(applyUrl), current = new URL(value)
          return wanted.origin === current.origin && wanted.pathname === current.pathname
            && [...wanted.searchParams].every(([key, val]) => /^(utm_|source$)/i.test(key) || current.searchParams.get(key) === val)
        } catch { return false }
      }
      const tabs = await chrome.tabs.query({})
      const tab = tabs.find(t => t.id && sameApplication(t.url))
      if (tab) matched = { tab, intent: { job: applyUrl, postingId, at: Date.now(), status: "filling" } }
    }
    // The run's tab never reached a form (an employer list of vacancies): a tab that does show this job's application wins —
    // the learned address, else an open tab titled with the job (opened by the person or an earlier run).
    if (matched && !matched.intent.formSeen) {
      const learned = await learnedApplyUrl(matched.intent.postingId || postingId, matched.intent.job || applyUrl)
      const tabs = await chrome.tabs.query({})
      const better = tabs.find((t) => t.id !== matched.tab.id && learned && t.url && t.url.split("#")[0] === learned.split("#")[0])
        || (matched.intent.title ? tabs.find((t) => t.id !== matched.tab.id && /^https:/.test(t.url || "") && !/linkedin\.com|indeed\.|glassdoor\./i.test(t.url || "") && namesJob(matched.intent.title, t.title)) : null)
      if (better?.id) {
        await changeIntents((all) => { all[better.id] = { ...matched.intent, at: Date.now(), status: "filling", message: "Filling in the background…", hunt: undefined } })
        matched = { tab: better, intent: { ...matched.intent, status: "filling" } }
      }
    }
    if (matched) {
      const { tab, intent } = matched
      // Older builds could leave duplicate runs for one vacancy. Only this tab
      // owns progress now; keep the other page open without letting it overwrite status.
      await changeIntents(all => {
        for (const [id, other] of Object.entries(all)) {
          if (Number(id) === tab.id) continue
          if ((postingId && other.postingId === postingId) || jobKeyOf(other.job, null) === jobKeyOf(intent.job, null)) delete all[id]
        }
      })
      // Never wipe real progress (Account / outlined / Ready) when Apply or Open tab is pressed again.
      // ...but Review only stays when this tab really showed the application form (never a list of vacancies).
      const keepStatus = intent.status && !["submitted"].includes(intent.status) && !(intent.status === "ready" && !intent.formSeen) ? intent.status : "filling"
      await setIntent(tab.id, {
        ...intent,
        job: intent.job || applyUrl,
        postingId: intent.postingId || postingId,
        at: Date.now(),
        status: keepStatus,
        message: intent.message || (reveal ? "Opening the application tab…" : "Filling in the background…"),
        // Apply with Odds pressed again resumes a run the person paused by going back; Open application tab only shows it.
        paused: reveal ? intent.paused === true : false,
        // Apply with Odds pressed again: a fresh budget (tries, page count, asks); Open application tab keeps the run as it is.
        ...(reveal ? {} : { hunt: undefined, stopped: false }),
      })
      // Open tab: focus immediately and ACK — Continue/reinject must not lag the Odds button.
      if (reveal) {
        await revealApplicationTab(tab.id, true)
        if (!intent.paused) void continueInTab(tab.id, { reveal: false })
        return { ok: true, resumed: true }
      }
      const continued = await continueInTab(tab.id, { reveal: false })
      return continued ? { ok: true, resumed: true } : { ok: false, message: "Odds could not reconnect to the application page. Reload it, then press Apply with Odds again." }
    }
    // New application: in the Odds window — a separate Chrome window, opened without focus, where Broods works in the open (the person can
    // glance at it) while their own window is never touched. Its tab is the visible one in that window, which is what lets Broods see it.
    // Intent MUST be stored before the job URL loads — otherwise apply.js asks apply-intent too early and never watches Closed.
    // The person's own press (the app or the panel): the application opens as a visible tab next to the one they pressed in, and comes to
    // the front, like Simplify. Chrome slows a hidden window's tabs to a crawl, which stalled runs ("the tab stopped answering"); the
    // Odds window stays for applications nobody is watching (queued from the phone).
    const personWindow = from && typeof from.windowId === "number" ? from.windowId : null
    const windowId = personWindow ?? await oddsWindow(reveal)
    // Visible only inside the Odds window; if Odds had to fall back to the person's own window, the tab opens behind (never takes it over).
    const { oddsRunWindow: ownWindow } = await chrome.storage.session.get("oddsRunWindow").catch(() => ({}))
    const tab = typeof windowId === "number"
      ? await chrome.tabs.create({ windowId, url: "about:blank", active: personWindow !== null || windowId === ownWindow || reveal, ...(personWindow !== null && typeof from.index === "number" ? { index: from.index + 1 } : {}) })
      : (await chrome.windows.create({ url: "about:blank", focused: reveal, type: "normal" })).tabs?.[0]
    const tabId = tab?.id
    if (typeof tabId !== "number") return { ok: false, message: "Could not open an application tab." }
    await setIntent(tabId, { job: applyUrl, postingId, at: Date.now(), status: "filling", message: "Opening the application…", ...(personWindow !== null ? { foreground: true } : {}) })
    // Where this application was found last time (the employer's real form), straight away; the job's own link otherwise.
    // Where this application was found before, here or by anyone (the server's apply link): past the board's captcha and sign-in walls.
    const learned = await learnedApplyUrl(postingId, applyUrl) || await directApplyUrl(applyUrl)
    const moved = await oddsGo(tabId, learned || applyUrl, { active: reveal || personWindow !== null }).then(() => true).catch(() => false)
    if (!moved) {
      const message = "Odds could not open the application page. Press Apply with Odds to try again."
      await changeIntents((all) => { if (all[tabId]) all[tabId] = { ...all[tabId], status: "failed", message, at: Date.now() } })
      return { ok: false, message }
    }
    // Person asked to look: bring the new tab's window forward too.
    if (reveal) await revealApplicationTab(tabId, true)
    // Applying keeps the job in the person's tracker, in the same click.
    addJob(applyUrl).catch(() => undefined)
    return { ok: true, resumed: false }
  })().finally(() => applicationStarts.delete(job))
  applicationStarts.set(job, opening)
  return opening
}
/**
 * Apply in the person's own tab (the side panel's Apply on a job page): no new tab or window. The tab holds the application (copilot:
 * Odds presses Next itself, stops before Submit) and goes to the employer's form, or to the job's page where Odds finds Apply.
 */
async function applyHere(tabId, url, postingId) {
  if (!await savedKey()) return { ok: false, message: "Connect Odds from the extension icon first." }
  const present = await chrome.tabs.get(tabId).catch(() => null)
  if (!present) return { ok: false, message: "The application tab is no longer open." }
  const applyUrl = preferEnglishApplyUrl(url)
  await setIntent(tabId, { job: applyUrl, postingId, at: Date.now(), status: "filling", message: "Opening the application…", copilot: true, here: true })
  const learned = await learnedApplyUrl(postingId, applyUrl) || await directApplyUrl(applyUrl)
  const target = learned || applyUrl
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  if (tab?.url && tab.url.split("#")[0] === target.split("#")[0]) await continueInTab(tabId)
  else {
    const moved = await oddsGo(tabId, target, { active: true }).then(() => true).catch(() => false)
    if (!moved) {
      const message = "Odds could not open the application page. Press Apply with Odds to try again."
      await changeIntents((all) => { if (all[tabId]) all[tabId] = { ...all[tabId], status: "failed", message, at: Date.now() } })
      return { ok: false, message }
    }
  }
  addJob(applyUrl).catch(() => undefined)
  return { ok: true }
}
/** Pages already read for a job this load (address → true), so a page Odds cannot read is not tried again on every look. */
const enrichTried = new Set()
/**
 * A job page Odds does not hold, read from the page itself (what it tells search engines, else its title and text) and kept for everyone, so the
 * panel's job card is filled without the person pressing anything. Not kept for the person: Track does that. Returns true when Odds now holds it.
 */
async function enrichFromPage(tabId, url, kind) {
  if (enrichTried.has(url)) return false
  enrichTried.add(url)
  const [read] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const meta = (n) => document.querySelector(`meta[property="${n}"],meta[name="${n}"]`)?.content || ""
      const main = document.querySelector("main,[role=main],article") || document.body
      return {
        ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent.slice(0, 200000)),
        h1: (document.querySelector("h1")?.innerText || "").trim(),
        og: meta("og:title").trim(),
        doc: (document.title || "").trim(),
        company: meta("og:site_name").trim(),
        text: (main.innerText || "").trim().slice(0, 30000),
      }
    },
  }).then((r) => r || []).catch(() => [])
  const found = read?.result
  if (!found) return false
  const S = globalThis.oddsSites
  let posting = null
  for (const block of found.ld) {
    try { const p = S.postingFrom(JSON.parse(block)); if (S.postingUsable(p)) { posting = p; break } } catch { /* next block */ }
  }
  const readable = found.text.length >= 400 && /\b(apply|sollicit\w*|bewerb\w*)\b/i.test(found.text)
  if (!posting && readable) {
    // The heading, unless it is a site-wide one ("Careers", "Contact us", a browser warning): then the title the page gives search engines.
    const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, "")
    const others = [found.og, found.doc].map(norm)
    const h1 = found.h1 && norm(found.h1).length >= 4 && others.some((o) => o.includes(norm(found.h1))) ? found.h1 : ""
    const whole = (h1 || found.og || found.doc).trim()
    // "Job Application for Analyst at Examplepay", "Analyst at Examplepay", "Analyst | Examplepay", "Examplepay Analyst | SmartRecruiters".
    const at = /^(?:job application for\s+)?(.+?)\s+at\s+([^|–—-]+?)\s*$/i.exec(whole) || /^(?:job application for\s+)?(.+?)\s+at\s+([^|–—-]+?)\s*$/i.exec(found.doc)
    const title = (at ? at[1] : whole.split(/\s+[|–—-]\s+/)[0] || whole).replace(/^job application for\s+/i, "").trim()
    const host = new URL(url).hostname.replace(/^(www|careers?|jobs?|werkenbij|apply)\./i, "").split(".")[0] || ""
    const company = found.company || (at ? at[2].trim() : "") || (/(greenhouse|lever|workday|myworkdayjobs|smartrecruiters|ashbyhq|recruitee|teamtailor)/i.test(host) ? "" : host.replace(/^./, (c) => c.toUpperCase()))
    if (title && company) {
      posting = { title: title.slice(0, 300), company: company.slice(0, 200), location: "", description: found.text, posted: null, valid: null, logo: null, employment: null }
      if (!S.postingUsable(posting)) posting = null
    }
  }
  // Nothing readable in the page but it is a job page (an Apply button, a real text): odds reads it itself (its own request, then Apify's page reader), once.
  if (!posting && !(kind === "job" && found.text.length >= 400) && !/\.myworkdayjobs\.com$/i.test(new URL(url).hostname)) return false
  if (posting) posting = { ...posting, title: posting.title.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"'), company: posting.company.replace(/&amp;/g, "&") }
  const answer = await addJob(url, true, posting ? postingOf({ posting }) : null)
  return answer?.status === "added" || answer?.status === "exists"
}
/** Pages already asked about with their title (panel-apply-info). */
const kitHinted = new Set()
/** What each tab's page is, as its script last said (page-kind). */
const pageKinds = new Map()
chrome.tabs.onRemoved.addListener((tabId) => pageKinds.delete(tabId))
/** The page's kind, asked live (falls back to the last report). */
async function pageKindOf(tabId) {
  const ask = () => Promise.race([chrome.tabs.sendMessage(tabId, { type: "odds-page-kind" }, { frameId: 0 }).catch(() => null), new Promise((r) => setTimeout(() => r(null), 1200))])
  let live = await ask()
  // A tab opened before Odds was updated still runs the old script (or none): Odds' script is put on it once, then asked again.
  if (!(live && "kind" in live) && !kindInjected.has(tabId)) {
    kindInjected.add(tabId)
    const tab = await chrome.tabs.get(tabId).catch(() => null)
    if (tab?.url && /^https:/.test(tab.url) && !/linkedin\.com/i.test(tab.url) && applicationPage(tab.url)) {
      await injectApplyScripts(tabId)
      await new Promise((r) => setTimeout(r, 500))
      live = await ask()
    }
  }
  if (live && "kind" in live) { pageKinds.set(tabId, live.kind || null); return live.kind || null }
  return pageKinds.get(tabId) ?? null
}
const kindInjected = new Set()
chrome.tabs.onUpdated.addListener((tabId, change) => { if (change.status === "loading") kindInjected.delete(tabId) })
/** A strong password with every kind of character sites ask for (upper, lower, digit, special), 16 long. */
function makePassword() {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#$%&*?"]
  const all = sets.join("")
  const rnd = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n
  const chars = sets.map((set) => set[rnd(set.length)])
  while (chars.length < 16) chars.push(all[rnd(all.length)])
  for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]] }
  return chars.join("")
}
/** The account Odds made on a site (by host), kept in this Chrome only, never sent to the server. */
async function siteAccount(host) {
  const { oddsAccounts = {} } = await chrome.storage.local.get("oddsAccounts")
  return oddsAccounts[host] || null
}
/** Account steps Odds already tried in a tab (tab + host + kind), so a site that refuses is not hit again and again. */
const autoAccountTried = new Map()
/**
 * While Odds applies in a tab (never on a page the person is only browsing): a sign-in for a site Odds already made an account on, or a
 * create-account step for one it has not, is done by Odds, once per tab and site. Switch it off with chrome.storage.local oddsAutoAccount = false.
 * A captcha, a refusal or a mail to confirm stays with the person (the run ends needs_you with its reason).
 */
async function autoAccount(tabId, kind) {
  if (kind !== "create_account" && kind !== "sign_in") return
  const { oddsAutoAccount, oddsNoAccountClicks } = await chrome.storage.local.get(["oddsAutoAccount", "oddsNoAccountClicks"])
  if (oddsAutoAccount === false || oddsNoAccountClicks === true) return
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  if (!tab?.url || !/^https:/.test(tab.url)) return
  if (!(await intentOf(tabId))) return
  const host = new URL(tab.url).hostname
  const key = `${tabId}|${host}|${kind}`
  if (Date.now() - (autoAccountTried.get(key) || 0) < 120_000) return
  const saved = await siteAccount(host)
  // Sign in with what was saved; or create the account when none exists. A sign-in with nothing saved, or a create step for a site that
  // already has an account here, is the person's.
  if ((kind === "sign_in" && !saved) || (kind === "create_account" && saved)) return
  autoAccountTried.set(key, Date.now())
  await new Promise((r) => setTimeout(r, 1500)) // the page finishes drawing its boxes
  // A click on the site's button can be lost while the page is still drawing or Odds is starting: while the same step is still on screen,
  // press again (same email and password), up to three times.
  for (let attempt = 0; attempt < 3; attempt++) {
    // While Broods drives this tab it presses the site's own Create / Sign in button itself: Odds only fills the boxes (never a second press).
    const press = !(await intentOf(tabId))?.driveRun
    await accountInTab(tabId, kind === "create_account", press).catch(() => undefined)
    if (!press) return
    await new Promise((r) => setTimeout(r, 4000))
    if ((await pageKindOf(tabId).catch(() => null)) !== kind) return
  }
}
async function accountInTab(tabId, create, press = true) {
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  if (!tab?.url || !/^https:/.test(tab.url)) return { ok: false }
  const host = new URL(tab.url).hostname
  const kit = await Promise.race([kitFor(tab.url).catch(() => null), new Promise((r) => setTimeout(() => r(null), 5000))])
  const email = String(kit?.facts?.email || "")
  if (!email) return { ok: false, message: "Add your email in Odds first." }
  let account = await siteAccount(host)
  if (create && !account) {
    account = { email, password: makePassword(), at: Date.now() }
    await chrome.storage.local.get("oddsAccounts").then(({ oddsAccounts = {} }) => chrome.storage.local.set({ oddsAccounts: { ...oddsAccounts, [host]: account } }))
  }
  // The tab holds the application from here: once the account step is past, Odds fills every page up to Submit.
  const held = await intentOf(tabId)
  if (!held) await setIntent(tabId, { job: tab.url, title: String(tab.title || "").slice(0, 200), at: Date.now(), status: "filling", message: create ? "Creating your account…" : "Signing in…", copilot: true, here: true })
  else await changeIntents((all) => { if (all[tabId]) all[tabId] = { ...all[tabId], copilot: true, here: true, paused: false, at: Date.now() } })
  if (!held) addJob(tab.url).catch(() => undefined)
  const res = await chrome.tabs.sendMessage(tabId, { type: "odds-account", email: account?.email || email, password: account?.password || "", create, press }, { frameId: 0 }).catch(() => null)
  if (!res?.ok) {
    const message = res?.message || "Odds could not use the account form on this page. Finish this step yourself, then press Apply with Odds again."
    await changeIntents((all) => { if (all[tabId]) all[tabId] = { ...all[tabId], status: "needs_input", message, at: Date.now() } })
  }
  return { ok: Boolean(res?.ok), pressed: Boolean(res?.pressed) }
}
/** A new tab's first real address (window.open often starts at about:blank). */
async function firstUrlOf(tabId, ms = 6000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const t = await chrome.tabs.get(tabId).catch(() => null)
    if (!t) return null
    const url = t.pendingUrl || t.url || ""
    if (/^https:\/\//.test(url)) return url
    await new Promise((r) => setTimeout(r, 150))
  }
  return null
}
// A tab opened by a tab that was applying (the employer's application in a new tab) is applying too.
chrome.tabs.onCreated.addListener((tab) => {
  const from = typeof tab.openerTabId === "number" ? followFrom.get(tab.openerTabId) : null
  if (!from || Date.now() - from.at >= 30_000 || typeof tab.id !== "number") return
  const opener = tab.openerTabId
  const tabId = tab.id
  // Applying in the person's own tab: the site's new tab is folded back into it (same tab all the way, like Simplify).
  if (from.here && typeof opener === "number") {
    void (async () => {
      const url = await firstUrlOf(tabId)
      if (!url) {
        const message = "The employer opened a new tab that did not finish loading. Open that tab, then press Apply with Odds again."
        await changeIntents((all) => { if (all[opener]) all[opener] = { ...all[opener], status: "needs_input", message, at: Date.now() } })
        return
      }
      followFrom.delete(opener)
      await setIntent(opener, { ...from, at: Date.now(), followed: true, status: "filling", message: "Opening the employer’s application…" })
      await chrome.tabs.remove(tabId).catch(() => undefined)
      const moved = await oddsGo(opener, url, { active: true }).then(() => true).catch(() => false)
      if (!moved) {
        const message = "Odds could not move the employer’s application into this tab. Open the new tab, then press Apply with Odds again."
        await changeIntents((all) => { if (all[opener]) all[opener] = { ...all[opener], status: "needs_input", message, at: Date.now() } })
      }
    })()
    return
  }
  // MUST await intent before apply-any asks apply-intent — otherwise fill never starts (silent empty form).
  void (async () => {
    await setIntent(tabId, { ...from, at: Date.now(), followed: true, status: "filling", message: "Opening the employer’s application…" })
    if (from.runId) await updateApplicationRuns((runs) => { runs[from.runId] = { id: from.runId, tabId, resumeVersion: runs[from.runId]?.resumeVersion || 0, postingId: from.postingId || null } })
    // One job, one tab: drop the LinkedIn listing after the employer tab has the intent.
    if (typeof opener === "number") {
      await changeIntents((all) => { delete all[opener] })
      chrome.tabs.remove(opener).catch(() => undefined)
    }
    // Keep fill running in the background (Apply with Odds); do not steal focus.
    if (tab.active && !from.foreground) chrome.tabs.update(tabId, { active: false }).catch(() => undefined)
    // Wake apply-any if it loaded before intent was written.
    chrome.tabs.sendMessage(tabId, { type: "application-continue" }).catch(() => undefined)
  })()
})
chrome.tabs.onRemoved.addListener(async (tabId) => {
  followFrom.delete(tabId)
  // The application tab closed: Broods stops there at once and the tracker goes back to the job's own status.
  const { oddsApplyIntents = {} } = await chrome.storage.local.get("oddsApplyIntents")
  const run = oddsApplyIntents[tabId]?.driveRun
  if (typeof run === "string") ext("drive-stop", { method: "POST", body: JSON.stringify({ run_id: run, reason: "tab_closed", message: "You closed the application tab." }) }).catch(() => undefined)
  await changeIntents((all) => { delete all[tabId] })
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
  // Only fires without a popup (the manifest sets one: its Fill with Odds button fills the page in front). Fallback: the side panel.
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => undefined)
  allowOddsInTab(tab.id).catch(() => undefined)
})

/** Fill with Odds in a tab: the application there is filled to the end (Submit stays the person's). Odds' script is put on first if missing. */
async function fillTab(tabId) {
  const tell = () => chrome.tabs.sendMessage(tabId, { type: "odds-fill-now" }, { frameId: 0 })
  let res = await tell().catch(() => null)
  if (!res?.ok) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["job-sites.js", "site-dom.js", "panel.js", "content-job.js", "mascot.js", "application-handoff.js", "apply-any.js"] }).catch(() => undefined)
    await new Promise((r) => setTimeout(r, 400))
    res = await tell().catch(() => null)
  }
  if (res?.ok) return true
  const message = "Odds could not run on this page. Reload the page, then press Apply with Odds again."
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  await changeIntents((all) => {
    const held = all[tabId]
    all[tabId] = { ...(held || { job: tab?.url || "", postingId: null }), at: Date.now(), status: "failed", message, copilot: true, here: true }
  }).catch(() => undefined)
  return false
}

/** Tabs whose page holds an application form: the toolbar icon pulses an orange "Fill" there for a few seconds, then stays. */
const formTabs = new Map()
function formIsHere(tabId) {
  if (formTabs.has(tabId)) return
  chrome.action.setBadgeText({ tabId, text: "Fill" }).catch(() => undefined)
  chrome.action.setBadgeTextColor?.({ tabId, color: "#ffffff" })?.catch?.(() => undefined)
  chrome.action.setTitle({ tabId, title: "Fill with Odds: fills the application on this page (you press Submit)" }).catch(() => undefined)
  let on = true
  let beats = 0
  const timer = setInterval(() => {
    on = !on
    chrome.action.setBadgeBackgroundColor({ tabId, color: on ? "#f2802a" : "#c65b00" }).catch(() => undefined)
    if (++beats >= 24) { clearInterval(timer); chrome.action.setBadgeBackgroundColor({ tabId, color: "#f2802a" }).catch(() => undefined) }
  }, 500)
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#f2802a" }).catch(() => undefined)
  formTabs.set(tabId, timer)
}
function formGone(tabId) {
  const timer = formTabs.get(tabId)
  if (timer) clearInterval(timer)
  formTabs.delete(tabId)
  chrome.action.setBadgeText({ tabId, text: "" }).catch(() => undefined)
  chrome.action.setTitle({ tabId, title: "odds" }).catch(() => undefined)
}
chrome.tabs.onRemoved.addListener((tabId) => { const t = formTabs.get(tabId); if (t) clearInterval(t); formTabs.delete(tabId) })
chrome.tabs.onUpdated.addListener((tabId, info) => { if (info.url) formGone(tabId) })


// Phone control is explicitly enabled in the desktop panel. Each request gets its own
// tab; the server claims it once, even when several desktops are connected.
let pollingApplications = false
async function applicationDevice() {
  const stored = await chrome.storage.local.get("oddsDesktopId")
  if (stored.oddsDesktopId) return stored.oddsDesktopId
  const id = crypto.randomUUID()
  await chrome.storage.local.set({ oddsDesktopId: id })
  return id
}
/** `key`: the key just removed on a disconnect, so the server still hears that this desktop gave its queued runs up. */
async function reportApplication(run, status, message, key = null) {
  return ext("application-report", { method: "POST", body: JSON.stringify({ device_id: await applicationDevice(), id: run.id, status, message }) }, key)
}
let applicationWrites = Promise.resolve()
/** Run → tab map in local storage so an extension reload still finds the tab Continue should resume. */
function updateApplicationRuns(change) {
  const next = applicationWrites.catch(() => undefined).then(async () => {
    const local = await chrome.storage.local.get("oddsApplicationRuns")
    const session = await chrome.storage.session.get(["oddsApplicationRuns", "oddsApplicationRun"]).catch(() => ({}))
    const runs = { ...(session.oddsApplicationRuns || {}), ...(local.oddsApplicationRuns || {}) }
    if (session.oddsApplicationRun?.id) runs[session.oddsApplicationRun.id] = session.oddsApplicationRun
    // Rebuild from apply intents after a reload wiped the map.
    const { oddsApplyIntents = {} } = await chrome.storage.local.get("oddsApplyIntents")
    for (const [id, intent] of Object.entries(oddsApplyIntents)) {
      if (!intent.runId || runs[intent.runId]) continue
      runs[intent.runId] = { id: intent.runId, tabId: Number(id), resumeVersion: 0, postingId: intent.postingId || null }
    }
    change(runs)
    await chrome.storage.local.set({ oddsApplicationRuns: runs })
    if (session.oddsApplicationRuns || session.oddsApplicationRun) {
      await chrome.storage.session.set({ oddsApplicationRuns: runs }).catch(() => undefined)
      if (session.oddsApplicationRun) await chrome.storage.session.remove("oddsApplicationRun").catch(() => undefined)
    }
    return runs
  })
  applicationWrites = next
  return next
}
async function pollApplications() {
  if (pollingApplications) return
  pollingApplications = true
  let claimed = null
  try {
    // Connected is enough: the desktop takes the applications queued for it (from the phone, the app or Claude) with no setting to tick.
    if (!await savedKey()) return
    const runs = await updateApplicationRuns(() => {})
    const answer = await ext("application-poll", { method: "POST", body: JSON.stringify({ device_id: await applicationDevice(), ids: Object.keys(runs), id: Object.keys(runs)[0] }) })
    if (answer.status !== "ok") return
    // Legacy response support lets an extension update roll out before the server update.
    const states = Array.isArray(answer.runs) ? answer.runs : answer.previous ? [answer.previous] : []
    for (const state of states) {
      let run = runs[state.id]
      if (!run) {
        // Reloaded extension / empty map: reattach via intent tab for this run or posting.
        const tab = await tabForApplicationRun(state.id, state.posting_id)
        if (tab) run = (await updateApplicationRuns(() => {}))[state.id]
      }
      if (!run) continue
      if (["filling", "needs_input", "ready"].includes(state.status) && (state.resume_version || 0) > (run.resumeVersion || 0)) {
        const tab = await chrome.tabs.get(run.tabId).catch(() => null) || await tabForApplicationRun(state.id, state.posting_id)
        if (tab) {
          // Person pressed Open application tab / Continue — always bring that tab (+ window) forward.
          await continueInTab(tab.id, { reveal: true })
          await updateApplicationRuns(current => { if (current[state.id]) current[state.id].resumeVersion = state.resume_version })
        }
      }
      if (!["cancelled", "failed", "submitted"].includes(state.status)) continue
      await updateApplicationRuns(current => { delete current[state.id] })
      if (state.status === "cancelled") await chrome.tabs.remove(run.tabId).catch(() => undefined)
    }
    const task = answer.task
    if (!task || runs[task.id]) return
    claimed = task
    if (!await savedKey()) return
    if (task.status !== "filling" || !/^https:\/\//.test(task.url)) return
    // Phone/desktop queue: fill in the background; surface the tab only at needs_input/ready.
    const applyUrl = preferEnglishApplyUrl(task.url)
    // In the Odds window, as its showing tab: a hidden tab in the person's own window has its timers slowed by Chrome to about once a
    // minute, and the fill and Broods' steps stall there.
    const windowId = await oddsWindow(false)
    const tab = typeof windowId === "number"
      ? await chrome.tabs.create({ windowId, url: "about:blank", active: true })
      : await chrome.tabs.create({ url: "about:blank", active: false })
    const run = { id: task.id, tabId: tab.id, postingId: task.posting_id || null }
    await updateApplicationRuns(current => { current[run.id] = run })
    await setIntent(tab.id, { job: applyUrl, at: Date.now(), runId: task.id, postingId: task.posting_id || null })
    await oddsGo(tab.id, (await learnedApplyUrl(task.posting_id, applyUrl)) || (await directApplyUrl(applyUrl)) || applyUrl, { active: false })
  } catch {
    if (claimed) await reportApplication(claimed, "failed", "Could not open the application. Please start again on your desktop.").catch(() => undefined)
  } finally { pollingApplications = false }
}
// Recreating the alarm every time MV3 wakes postpones delivery indefinitely.
chrome.alarms.get("odds-applications").then(alarm => {
  if (!alarm || alarm.periodInMinutes !== 0.5) chrome.alarms.create("odds-applications", { periodInMinutes: 0.5 })
})
/**
 * A build on disk newer than the one running (the unpacked folder was updated) reloads itself once nothing is filling, so an old build
 * never meets a newer server: runs went wrong that way again and again. The extension's own manifest, read through its address, is
 * always the file on disk. Nothing is touched while an application filled in the last 20 minutes (a reload would stop it).
 */
async function reloadIfStale() {
  let disk = null
  try { disk = (await (await fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" })).json()).version } catch { return false }
  if (!disk || disk === chrome.runtime.getManifest().version) return false
  const { oddsApplyIntents = {} } = await chrome.storage.local.get("oddsApplyIntents")
  if (Object.values(oddsApplyIntents).some((it) => it?.status === "filling" && Date.now() - it.at < 20 * 60_000)) return false
  chrome.runtime.reload()

  return true
}
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === "odds-applications") {
    reloadIfStale().then((reloading) => { if (!reloading) pollApplications().catch(() => undefined) }).catch(() => undefined)
  }
})
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  // The application form sits in a blank frame (HubSpot and similar embeds): Odds' form script goes into the page's frames, where it
  // drives only a blank frame that holds the form (apply-any.js checks).
  if (message?.type === "apply-frames" && sender.tab && typeof sender.tab.id === "number") {
    chrome.scripting.executeScript({ target: { tabId: sender.tab.id, allFrames: true }, files: ["job-sites.js", "mascot.js", "application-handoff.js", "apply-any.js"], injectImmediately: true })
      .then(() => reply({ ok: true }), (e) => reply({ ok: false, error: String(e?.message || e) }))
    return true
  }
  // A wait for a hidden application tab (see sleep in apply-any.js): answered on time from here.
  if (message?.type === "odds-sleep") {
    setTimeout(() => reply({ ok: true }), Math.min(30_000, Math.max(0, Number(message.ms) || 0)))
    return true
  }
  if (message?.type === "application-poll") {
    pollApplications().then(() => reply({ ok: true })).catch(() => reply({ ok: false }))
    return true
  }
  if (message?.type === "open-profile") {
    chrome.tabs.create({ url: `${SITE}/profile` })
    reply({ ok: true })
    return true
  }
  if (message?.type === "application-progress" && sender.tab) {
    updateApplicationRuns(() => {}).then(async runs => {
      if (!["filling", "needs_input", "ready", "submitted", "failed"].includes(message.status)) return
      let turned = null
      // Merged into the newest record: never overwrite what another message just wrote (the loop count, a pause, a stop).
      await changeIntents((all) => {
        const intent = all[sender.tab.id]
        if (!intent) return
        // A run Odds stopped (loop) or the person paused keeps that message until they act: later "Filling…" chatter cannot hide it.
        if ((intent.stopped || intent.paused) && message.status === "filling") return
        if (intent.status !== message.status && ["ready", "needs_input"].includes(message.status)) turned = { title: intent.title || sender.tab.title || "", status: message.status }
        all[sender.tab.id] = { ...intent, at: Date.now(), status: message.status, message: String(message.message || "").slice(0, 500) }
      })
      if (turned) notifyApplication(sender.tab.id, turned.title, turned.status, String(message.message || "")).catch(() => undefined)
      // Never auto-focus on progress (login / account creation / ready). The person opens the tab from Odds when ready.
      let run = Object.values(runs).find(run => run.tabId === sender.tab.id)
      // Reloading an extension clears session storage. Reattach only a request
      // owned by this account and desktop for this exact job, verified by the server.
      if (!run && sender.url && globalThis.oddsSites.jobLink(sender.url)) {
        const resumed = await ext("application-resume", { method: "POST", body: JSON.stringify({ device_id: await applicationDevice(), url: sender.url }) })
        if (resumed.run?.id) {
          run = { id: resumed.run.id, tabId: sender.tab.id }
          await updateApplicationRuns(current => { current[run.id] = run })
        }
      }
      if (!run) return
      await reportApplication(run, message.status, String(message.message || "").slice(0, 500))
    }).then(() => reply({ ok: true })).catch(() => reply({ ok: false }))
    return true
  }
})
chrome.tabs.onRemoved.addListener(tabId => {
  updateApplicationRuns(() => {}).then(async runs => {
    const run = Object.values(runs).find(run => run.tabId === tabId)
    if (!run) return
    await updateApplicationRuns(current => { if (current[run.id]?.tabId === tabId) delete current[run.id] })
    await reportApplication(run, "failed", "The application tab was closed. You can start again.").catch(() => undefined)
  })
})
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.oddsKey?.newValue) pollApplications().catch(() => undefined)
  // Disconnected (the key removed): the queued applications this desktop held are given up; a new key alone keeps them.
  if (area === "local" && changes.oddsKey && !changes.oddsKey.newValue) {
    updateApplicationRuns(() => {}).then(async runs => {
      await updateApplicationRuns(current => { for (const id of Object.keys(runs)) delete current[id] })
      for (const run of Object.values(runs)) {
        await reportApplication(run, "failed", "Odds was disconnected on this desktop. Your open application remains on your desktop.", changes.oddsKey.oldValue || null).catch(() => undefined)
        // Preserve filled forms and documents; disconnecting must not discard someone's work.
      }
    })
  }
})

// Recover queued phone requests immediately when Chrome wakes the worker.
pollApplications().catch(() => undefined)


/** In the Gmail tab: the recent messages the list shows (Gmail's own markup), or the page's text when there are none. */
function mailRowsInPage() {
  if (/accounts\.google\.com/.test(location.hostname)) return { signedOut: true }
  const rows = [...document.querySelectorAll("tr.zA")].slice(0, 10).map((r, i) => ({
    i,
    from: (r.querySelector(".yW span[email]")?.getAttribute("email") || r.querySelector(".yW")?.innerText || "").trim().slice(0, 80),
    name: (r.querySelector(".yW")?.innerText || "").trim().slice(0, 60),
    subject: (r.querySelector(".bog")?.innerText || "").trim().slice(0, 140),
    snippet: (r.querySelector(".y2")?.innerText || "").replace(/^\s*-\s*/, "").trim().slice(0, 200),
    unread: r.classList.contains("zE"),
  }))
  return { rows, text: rows.length ? "" : (document.body?.innerText || "").slice(0, 3000) }
}
/** In the Gmail tab: open the i-th message of the list. */
function mailOpenInPage(i) { document.querySelectorAll("tr.zA")[i]?.click() }
/** In the Gmail tab: the open message's text and its links (Google's redirect links unwrapped). */
function mailBodyInPage() {
  const el = [...document.querySelectorAll(".a3s")].pop()
  const decode = (h) => { try { const u = new URL(h); return u.hostname.endsWith("google.com") && u.pathname === "/url" ? (u.searchParams.get("q") || h) : h } catch { return h } }
  return el ? { text: el.innerText.replace(/\n{3,}/g, "\n\n").slice(0, 4000), links: [...el.querySelectorAll("a[href]")].map((a) => ({ text: (a.innerText || "").trim().slice(0, 80), href: decode(a.href) })).filter((l) => /^https:/.test(l.href)).slice(0, 15) } : null
}
/** One Gmail tab per application tab, kept for the length of the wait. */
const mailTabs = new Map()
/** Opens (or reuses) Gmail in a background tab, waits up to ~18 s for mail of the last hour, and returns what it shows and the best match in full. */
async function readMail(appTabId, hint) {
  // (chrome.storage.local oddsMailBase points the tests at a stand-in for Gmail; the person's Chrome always uses Gmail itself.)
  const { oddsMailBase } = await chrome.storage.local.get("oddsMailBase")
  const MAIL_URL = `${typeof oddsMailBase === "string" && /^https:\/\//.test(oddsMailBase) ? oddsMailBase.replace(/\/$/, "") : "https://mail.google.com"}/mail/u/0/#search/in%3Aanywhere+newer_than%3A1h`
  let mailTab = mailTabs.get(appTabId) ? await chrome.tabs.get(mailTabs.get(appTabId)).catch(() => null) : null
  if (!mailTab) {
    const app = await chrome.tabs.get(appTabId).catch(() => null)
    // The tab right next to the application tab, in the background: the person stays on the application, nothing takes the focus.
    mailTab = await chrome.tabs.create({ url: MAIL_URL, active: false, windowId: app?.windowId, ...(typeof app?.index === "number" ? { index: app.index + 1 } : {}), openerTabId: appTabId })
    mailTabs.set(appTabId, mailTab.id)
  } else {
    await chrome.tabs.update(mailTab.id, { url: MAIL_URL }).catch(() => undefined)
  }
  const end = Date.now() + 18_000
  let scriptError = ""
  const run = (func, args) => chrome.scripting.executeScript({ target: { tabId: mailTab.id }, func, args }).then((r) => r?.[0]?.result).catch((e) => { scriptError = String(e?.message || e).slice(0, 160); return null })
  const list = () => run(mailRowsInPage)
  let seen = null
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 2500))
    seen = await list()
    if (seen?.signedOut) return { error: "Gmail asks the person to sign in: they must sign in to Gmail in this Chrome first." }
    if (seen?.rows?.length) break
  }
  if (!seen?.rows?.length) return { messages: [], text: seen?.text || "", note: "Nothing in Gmail from the last hour yet (or it has not loaded). Call check_email again in a moment.", ...(scriptError ? { debug: scriptError } : {}) }
  const want = (hint.from + " " + hint.subject).toLowerCase().trim()
  const score = (m) => (want && `${m.from} ${m.name} ${m.subject}`.toLowerCase().includes(hint.from.toLowerCase() || "\u0000") ? 2 : 0) + (want && hint.subject && m.subject.toLowerCase().includes(hint.subject.toLowerCase()) ? 2 : 0) + (m.unread ? 1 : 0) + (/verif|confirm|code|activate|welcome|account|bevestig/i.test(m.subject + m.snippet) ? 1 : 0)
  const best = [...seen.rows].sort((a, b) => score(b) - score(a) || a.i - b.i)[0]
  await run(mailOpenInPage, [best.i])
  await new Promise((r) => setTimeout(r, 2200))
  const body = await run(mailBodyInPage)
  // Read: the Gmail tab is no longer needed.
  if (body?.text) { chrome.tabs.remove(mailTab.id).catch(() => undefined); mailTabs.delete(appTabId) }
  return { messages: seen.rows.map(({ i, ...m }) => m), opened: { from: best.from, subject: best.subject, ...(body || { text: "", links: [] }) } }
}
chrome.tabs.onRemoved.addListener((id) => { for (const [app, mail] of mailTabs) { if (app === id) { chrome.tabs.remove(mail).catch(() => undefined); mailTabs.delete(app) } else if (mail === id) mailTabs.delete(app) } })

/** How much a picture varies (grey-level standard deviation on a 64x32 thumbnail): about 0 for a blank (all white) one. */
async function shotSpread(base64) {
  try {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${base64}`)).blob())
    const canvas = new OffscreenCanvas(64, 32)
    const g = canvas.getContext("2d")
    g.drawImage(bitmap, 0, 0, 64, 32)
    bitmap.close()
    const px = g.getImageData(0, 0, 64, 32).data
    let sum = 0, sq = 0, n = 0
    for (let i = 0; i < px.length; i += 4) { const v = (px[i] + px[i + 1] + px[i + 2]) / 3; sum += v; sq += v * v; n++ }
    const mean = sum / n
    return Math.sqrt(Math.max(0, sq / n - mean * mean))
  } catch {
    return -1
  }
}
/** Below this spread a picture shows nothing: a real application page is 25+ (a white page with text still ~10). */
const BLANK_SPREAD = 2
/**
 * The tab as an image through Chrome's debugger: no focus, no tab switch, the page need not be in front. At most 1024 px wide.
 * A blank picture is never handed on (it made Broods stop with "the screen is completely blank"): Odds waits and takes it again,
 * then once more with the page told it has focus; still blank, it says so with what the tab and window looked like, for the trace.
 */
async function shotViaDebugger(tabId) {
  const prior = realInputQueue.get(tabId) || Promise.resolve()
  const next = prior.catch(() => undefined).then(async () => {
    const target = { tabId }
    try { await chrome.debugger.attach(target, "1.3") } catch (e) { return { error: `screenshot unavailable: ${String(e?.message || e).slice(0, 120)}` } }
    try {
      const m = await chrome.debugger.sendCommand(target, "Page.getLayoutMetrics")
      const vw = Math.max(1, Math.round(m?.cssVisualViewport?.clientWidth || m?.layoutViewport?.clientWidth || 1000))
      const vh = Math.max(1, Math.round(m?.cssVisualViewport?.clientHeight || m?.layoutViewport?.clientHeight || 700))
      const scale = Math.min(1, 1024 / vw)
      // The clip is in page coordinates: at the scroll position, or a scrolled page comes out as a white picture of its top.
      const px = Math.max(0, Math.round(m?.cssVisualViewport?.pageX ?? m?.cssLayoutViewport?.pageX ?? 0))
      const py = Math.max(0, Math.round(m?.cssVisualViewport?.pageY ?? m?.cssLayoutViewport?.pageY ?? 0))
      const clip = { x: px, y: py, width: vw, height: vh, scale }
      const tries = []
      const take = async (how, extra) => {
        const shot = await chrome.debugger.sendCommand(target, "Page.captureScreenshot", { format: "jpeg", quality: 50, clip, ...extra }).catch((e) => ({ error: String(e?.message || e) }))
        const spread = shot?.data ? await shotSpread(shot.data) : -1
        tries.push({ how, kb: shot?.data ? Math.round(shot.data.length * 3 / 4 / 1024) : 0, spread: Math.round(spread * 10) / 10, ...(shot?.error ? { error: shot.error.slice(0, 80) } : {}) })
        return shot?.data && spread >= BLANK_SPREAD ? shot.data : ""
      }
      let image = await take("plain", { optimizeForSpeed: true })
      if (!image) { await new Promise((r) => setTimeout(r, 700)); image = await take("again", {}) }
      if (!image) {
        await chrome.debugger.sendCommand(target, "Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => undefined)
        await new Promise((r) => setTimeout(r, 300))
        image = await take("focus", { captureBeyondViewport: true })
        await chrome.debugger.sendCommand(target, "Emulation.setFocusEmulationEnabled", { enabled: false }).catch(() => undefined)
      }
      if (image) return { image, width: Math.round(vw * scale), height: Math.round(vh * scale), viewportWidth: vw, viewportHeight: vh, ...(tries.length > 1 ? { tries } : {}) }
      const visibility = await chrome.debugger.sendCommand(target, "Runtime.evaluate", { expression: "document.visibilityState + ' ' + document.readyState + ' ' + (document.body ? document.body.innerText.length : 0)", returnByValue: true }).then((r) => r?.result?.value).catch(() => null)
      const tab = await chrome.tabs.get(tabId).catch(() => null)
      const win = tab ? await chrome.windows.get(tab.windowId).catch(() => null) : null
      return { error: "blank screenshot", blank: true, diag: { tries, visibility, tabActive: tab?.active, discarded: tab?.discarded, windowState: win?.state, windowFocused: win?.focused, viewport: `${vw}x${vh}` } }
    } catch (e) {
      return { error: String(e?.message || e).slice(0, 160) }
    } finally {
      await chrome.debugger.detach(target).catch(() => undefined)
    }
  })
  realInputQueue.set(tabId, next.catch(() => undefined))
  return next
}
/** One real input action in a tab through Chrome's debugger (one at a time per tab). click {x,y} | type {text, clear} | key {key}. */
const realInputQueue = new Map()
function realInput(tabId, action) {
  const prior = realInputQueue.get(tabId) || Promise.resolve()
  const next = prior.catch(() => undefined).then(() => realInputNow(tabId, action))
  realInputQueue.set(tabId, next.catch(() => undefined))
  return next
}
async function realInputNow(tabId, action) {
  const target = { tabId }
  const send = (method, params) => chrome.debugger.sendCommand(target, method, params)
  const KEYS = { Enter: [13, "\r"], Tab: [9, ""], Escape: [27, ""], Backspace: [8, ""], Delete: [46, ""], ArrowDown: [40, ""], ArrowUp: [38, ""], ArrowLeft: [37, ""], ArrowRight: [39, ""], Space: [32, " "] }
  const key = async (name, modifiers = 0) => {
    const [code, text] = KEYS[name] || [0, ""]
    await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key: name === "Space" ? " " : name, code: name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers, ...(text ? { text } : {}) })
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: name === "Space" ? " " : name, code: name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers })
  }
  try { await chrome.debugger.attach(target, "1.3") } catch (e) { return { ok: false, error: `real input unavailable: ${String(e?.message || e).slice(0, 120)}` } }
  try {
    if (action.op === "click" || action.op === "type") {
      if (Number.isFinite(action.x) && Number.isFinite(action.y)) {
        const at = { x: Math.round(action.x), y: Math.round(action.y), button: "left", clickCount: 1 }
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x, y: at.y })
        await send("Input.dispatchMouseEvent", { type: "mousePressed", ...at })
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...at })
      }
    }
    if (action.op === "type") {
      if (action.clear) {
        // Select everything in the box (Ctrl/Cmd+A) and delete it, as a person would.
        const mod = /Mac/i.test(navigator.platform || navigator.userAgent) ? 4 : 2
        await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: mod, commands: ["selectAll"] })
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: mod })
        await key("Backspace")
      }
      for (const ch of String(action.text || "").slice(0, 2000)) {
        await send("Input.dispatchKeyEvent", { type: "keyDown", key: ch, text: ch, unmodifiedText: ch })
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: ch })
      }
    }
    if (action.op === "key") await key(String(action.key || "Enter"))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 160) }
  } finally {
    await chrome.debugger.detach(target).catch(() => undefined)
  }
}
