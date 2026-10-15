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
    else if (!peekTimer) peekTimer = setTimeout(flushPeeks, 16)
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

// What an application needs is asked for as soon as it is started, while the page is still loading: the details and the CV file are ready by the time the form is.
const PREPARED_MS = 120_000
const kits = new Map()
const cvFiles = new Map()
function kitFor(url, fresh = false) {
  const hit = kits.get(url)
  if (!fresh && hit && Date.now() - hit.at < PREPARED_MS) return hit.promise
  const promise = ext("apply-kit", { method: "POST", body: JSON.stringify({ url }) })
  kits.set(url, { at: Date.now(), promise })
  promise.then((kit) => {
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
  // "odds apply" in the panel: the job is opened in the person's tab and its form filled in there (apply.js on LinkedIn, apply-any.js elsewhere).
  if (message?.type === "apply-in-tab" && typeof message.url === "string" && /^https:\/\//.test(message.url)) {
    openApplication(message.url, sender.tab).then(reply).catch(() => reply({ ok: false, message: "Could not open the application. Try again." }))
    return true
  }
  // The panel asking how this job's application is going: the state its tab last reported (filling, needs_input, ready, failed), or none.
  if (message?.type === "application-status" && typeof message.url === "string") {
    ;(async () => {
      const job = globalThis.oddsSites.jobLink(message.url)?.url || message.url
      const { oddsApplyIntents = {} } = await chrome.storage.local.get("oddsApplyIntents")
      let found = null
      for (const [id, intent] of Object.entries(oddsApplyIntents)) {
        if (Date.now() - intent.at > INTENT_MS || (globalThis.oddsSites.jobLink(intent.job)?.url || intent.job) !== job) continue
        if (!found || intent.at > found.at) found = { ...intent, tabId: Number(id) }
      }
      if (!found) return reply({ state: null })
      const tab = await chrome.tabs.get(found.tabId).catch(() => null)
      if (!tab) return reply({ state: null })
      reply({ state: { status: found.status || "filling", message: found.message || "", at: found.at } })
    })().catch(() => reply({ state: null }))
    return true
  }
  // A page asking whether it was opened to apply: the job it is for, while that is fresh (the tab's own, or the one that opened it).
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
  // A LinkedIn job applied for on the employer's site: their form opens in the same tab, which is still applying for that job.
  if (message?.type === "apply-go" && sender.tab && typeof sender.tab.id === "number" && typeof message.url === "string" && /^https:\/\//.test(message.url)) {
    const tabId = sender.tab.id
    intentOf(tabId).then(async (intent) => {
      if (!intent) return reply({ ok: false })
      await setIntent(tabId, { ...intent, at: Date.now(), followed: true })
      await chrome.tabs.update(tabId, { url: message.url })
      reply({ ok: true })
    })
    return true
  }
  // Applying: what the form needs, the person's own answers kept, the job marked applied, their CV for the upload.
  if (message?.type === "apply-kit" && typeof message.url === "string") {
    kitFor(message.url).then(reply)
    return true
  }
  if (message?.type === "application-questions" && sender.tab && typeof message.url === "string") {
    ext("application-questions", { method: "POST", body: JSON.stringify({ url: message.url, questions: message.questions }) }).then(reply)
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

// Applying from the panel: which tabs were opened to apply, for which job. Kept a few minutes (a sign-in or a slow page may come between),
// in local storage so neither a sleeping worker nor a reload of the extension forgets it.
const INTENT_MS = 60 * 60_000
const followFrom = new Map()
// Every change goes through one queue: tabs applying side by side report at the same time, and a read-modify-write would lose one of them.
let intentWrites = Promise.resolve()
function changeIntents(change) {
  const next = intentWrites.catch(() => undefined).then(async () => {
    const { oddsApplyIntents = {} } = await chrome.storage.local.get("oddsApplyIntents")
    for (const [id, it] of Object.entries(oddsApplyIntents)) if (Date.now() - it.at > INTENT_MS) delete oddsApplyIntents[id]
    change(oddsApplyIntents)
    await chrome.storage.local.set({ oddsApplyIntents })
  })
  intentWrites = next
  return next
}
function setIntent(tabId, intent) { return changeIntents((all) => { all[tabId] = intent }) }
// Tab ids are reused once the browser restarts: an application is only remembered across a reload of the extension.
chrome.runtime.onStartup.addListener(() => chrome.storage.local.remove("oddsApplyIntents"))
async function intentOf(tabId) {
  const { oddsApplyIntents = {} } = await chrome.storage.local.get("oddsApplyIntents")
  const intent = oddsApplyIntents[tabId]
  return intent && Date.now() - intent.at < INTENT_MS ? intent : null
}
// Serialize double clicks per vacancy, and focus the existing application rather than lose its filled fields.
const applicationStarts = new Map()
/** The application opens in a tab of its own right beside the one it was asked from, which stays where it is. */
function openApplication(url, from) {
  const job = globalThis.oddsSites.jobLink(url)?.url || url
  kitFor(url, true).catch(() => undefined)
  if (applicationStarts.has(job)) return applicationStarts.get(job)
  const opening = (async () => {
    if (!await savedKey()) return { ok: false, message: "Connect Odds from the extension icon first." }
    const { oddsApplyIntents = {} } = await chrome.storage.local.get("oddsApplyIntents")
    for (const [id, intent] of Object.entries(oddsApplyIntents)) {
      if (Date.now() - intent.at > INTENT_MS || intent.status === "submitted" || intent.status === "failed") continue
      if ((globalThis.oddsSites.jobLink(intent.job)?.url || intent.job) !== job) continue
      const tab = await chrome.tabs.get(Number(id)).catch(() => null)
      if (!tab) continue
      await setIntent(tab.id, { ...intent, at: Date.now() })
      await chrome.tabs.update(tab.id, { active: true })
      if (typeof tab.windowId === "number") await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined)
      await chrome.tabs.sendMessage(tab.id, { type: "application-continue" }).catch(() => undefined)
      return { ok: true, resumed: true }
    }
    const origin = from ?? (await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []))[0]
    const beside = origin && typeof origin.index === "number" ? { index: origin.index + 1, windowId: origin.windowId, ...(typeof origin.id === "number" ? { openerTabId: origin.id } : {}) } : {}
    const tab = await chrome.tabs.create({ url: "about:blank", active: true, ...beside })
    if (typeof tab.id !== "number") return { ok: false, message: "Could not open an application tab." }
    await setIntent(tab.id, { job: url, at: Date.now(), status: "filling" })
    await chrome.tabs.update(tab.id, { url, active: true })
    // Applying keeps the job in the person's tracker, in the same click.
    addJob(url).catch(() => undefined)
    return { ok: true, resumed: false }
  })().finally(() => applicationStarts.delete(job))
  applicationStarts.set(job, opening)
  return opening
}
// A tab opened by a tab that was applying (the employer's application in a new tab) is applying too.
chrome.tabs.onCreated.addListener((tab) => {
  const from = typeof tab.openerTabId === "number" ? followFrom.get(tab.openerTabId) : null
  if (from && Date.now() - from.at < 30_000 && typeof tab.id === "number") {
    setIntent(tab.id, { ...from, at: Date.now(), followed: true })
    if (from.runId) updateApplicationRuns(runs => { runs[from.runId] = { id: from.runId, tabId: tab.id } })
  }
})
chrome.tabs.onRemoved.addListener(async (tabId) => {
  followFrom.delete(tabId)
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
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => undefined)
  allowOddsInTab(tab.id).catch(() => undefined)
})


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
async function reportApplication(run, status, message) {
  return ext("application-report", { method: "POST", body: JSON.stringify({ device_id: await applicationDevice(), id: run.id, status, message }) })
}
let applicationWrites = Promise.resolve()
function updateApplicationRuns(change) {
  const next = applicationWrites.catch(() => undefined).then(async () => {
    const stored = await chrome.storage.session.get(["oddsApplicationRuns", "oddsApplicationRun"])
    const runs = stored.oddsApplicationRuns || (stored.oddsApplicationRun ? { [stored.oddsApplicationRun.id]: stored.oddsApplicationRun } : {})
    change(runs)
    await chrome.storage.session.set({ oddsApplicationRuns: runs })
    if (stored.oddsApplicationRun) await chrome.storage.session.remove("oddsApplicationRun")
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
    const { oddsPhoneControl } = await chrome.storage.local.get("oddsPhoneControl")
    if (!oddsPhoneControl || !await savedKey()) return
    const runs = await updateApplicationRuns(() => {})
    const answer = await ext("application-poll", { method: "POST", body: JSON.stringify({ device_id: await applicationDevice(), ids: Object.keys(runs), id: Object.keys(runs)[0] }) })
    if (answer.status !== "ok") return
    // Legacy response support lets an extension update roll out before the server update.
    const states = Array.isArray(answer.runs) ? answer.runs : answer.previous ? [answer.previous] : []
    for (const state of states) {
      const run = runs[state.id]
      if (!run) continue
      if (["filling", "needs_input", "ready"].includes(state.status) && (state.resume_version || 0) > (run.resumeVersion || 0)) {
        const tab = await chrome.tabs.get(run.tabId).catch(() => null)
        if (tab) {
          await chrome.tabs.update(run.tabId, { active: true })
          if (typeof tab.windowId === "number") await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined)
          await chrome.tabs.sendMessage(run.tabId, { type: "application-continue" }).catch(() => undefined)
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
    if (!(await chrome.storage.local.get("oddsPhoneControl")).oddsPhoneControl || !await savedKey()) return
    if (task.status !== "filling" || !/^https:\/\//.test(task.url)) return
    const tab = await chrome.tabs.create({ url: "about:blank", active: true })
    const run = { id: task.id, tabId: tab.id }
    await updateApplicationRuns(current => { current[run.id] = run })
    await setIntent(tab.id, { job: task.url, at: Date.now(), runId: task.id })
    await chrome.tabs.update(tab.id, { url: task.url })
    // Requests may come from a phone or Codex's browser: make the real form visible.
    if (typeof tab.windowId === "number") await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined)
  } catch {
    if (claimed) await reportApplication(claimed, "failed", "Could not open the application. Please start again on your desktop.").catch(() => undefined)
  } finally { pollingApplications = false }
}
// Recreating the alarm every time MV3 wakes postpones delivery indefinitely.
chrome.alarms.get("odds-applications").then(alarm => {
  if (!alarm || alarm.periodInMinutes !== 0.5) chrome.alarms.create("odds-applications", { periodInMinutes: 0.5 })
})
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === "odds-applications") pollApplications().catch(() => undefined)
})
chrome.runtime.onMessage.addListener((message, sender, reply) => {
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
      const intent = await intentOf(sender.tab.id)
      if (intent) await setIntent(sender.tab.id, { ...intent, at: Date.now(), status: message.status, message: String(message.message || "").slice(0, 500) })
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
  if (area === "local" && changes.oddsPhoneControl?.newValue) pollApplications().catch(() => undefined)
  if (area === "local" && (changes.oddsKey || changes.oddsPhoneControl?.newValue === false)) {
    if (changes.oddsKey) chrome.storage.local.set({ oddsPhoneControl: false })
    updateApplicationRuns(() => {}).then(async runs => {
      await updateApplicationRuns(current => { for (const id of Object.keys(runs)) delete current[id] })
      for (const run of Object.values(runs)) {
        await reportApplication(run, "failed", "Phone control was disconnected. Your open application remains on your desktop.").catch(() => undefined)
        // Preserve filled forms and documents; disconnecting must not discard someone's work.
      }
    })
  }
})

// Recover queued phone requests immediately when Chrome wakes the worker.
pollApplications().catch(() => undefined)
