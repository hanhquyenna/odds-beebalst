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
    res = await fetch(`${await apiBase()}/ext/${route}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(/^(suggest-|drive-)/.test(route) ? 50000 : 30000) })
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
        } else if (message.op === "form" && /^https:\/\//.test(tabUrl)) {
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
  // Broods looks at the application tab (only when its page tools are stuck): the tab is the visible one in the Odds window, so no focus is taken.
  if (message?.type === "drive-shot" && sender.tab && typeof sender.tab.id === "number") {
    const tab = sender.tab
    ;(async () => {
      if (!tab.active) { await chrome.tabs.update(tab.id, { active: true }).catch(() => undefined); await new Promise((r) => setTimeout(r, 400)) }
      const url = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 55 })
      const image = url.replace(/^data:image\/jpeg;base64,/, "")
      const size = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => ({ w: Math.round(innerWidth * devicePixelRatio), h: Math.round(innerHeight * devicePixelRatio) }) }).then((r) => r?.[0]?.result).catch(() => null)
      reply({ image, width: size?.w ?? null, height: size?.h ?? null })
    })().catch((e) => reply({ error: String(e?.message || e).slice(0, 200) }))
    return true
  }
  // Broods drives the application tab: start (or resume after a page change) a run, take its next command, send back the result.
  if (message?.type === "drive" && sender.tab && typeof sender.tab.id === "number" && ["start", "next", "result"].includes(message.op)) {
    const tabId = sender.tab.id
    const body = message.op === "start"
      ? { url: String(message.url || ""), page: String(message.page || ""), run_id: typeof message.run_id === "string" ? message.run_id : null }
      : message.op === "next" ? { run_id: message.run_id } : { run_id: message.run_id, id: message.id, result: message.result ?? null }
    ext(`drive-${message.op}`, { method: "POST", body: JSON.stringify(body) }).then(async (res) => {
      // The run follows the tab across page loads: the next page resumes it instead of starting another.
      if (message.op === "start" && typeof res?.run_id === "string") await changeIntents((all) => { if (all[tabId]) all[tabId] = { ...all[tabId], driveRun: res.run_id } })
      reply(res)
    }).catch(() => reply(null))
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
      await chrome.tabs.update(tabId, { url: next })
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
function setIntent(tabId, intent) { return changeIntents((all) => { all[tabId] = intent }) }
// Tab ids are reused once the browser restarts: an application is only remembered across a reload of the extension.
chrome.runtime.onStartup.addListener(() => chrome.storage.local.remove("oddsApplyIntents"))
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
    ? ["job-sites.js", "site-dom.js", "panel.js", "content-job.js", "application-handoff.js", "apply.js"]
    : ["job-sites.js", "site-dom.js", "panel.js", "content-job.js", "application-handoff.js", "apply-any.js"]
  await chrome.scripting.executeScript({ target: { tabId }, files }).catch(() => undefined)
  await chrome.scripting.insertCSS({ target: { tabId }, files: ["content-job.css"] }).catch(() => undefined)
  return true
}
/** Ping the apply script; if the extension was reloaded, reinject, then send Continue. */
async function continueInTab(tabId, { reveal = false } = {}) {
  if (reveal) await revealApplicationTab(tabId, true)
  const ping = () => chrome.tabs.sendMessage(tabId, { type: "application-ping" }).then(() => true).catch(() => false)
  if (!await ping()) {
    await injectApplyScripts(tabId)
    // Content script must attach its Continue listener before we ping it (reload / reinject).
    await new Promise((r) => setTimeout(r, 400))
  }
  await chrome.tabs.sendMessage(tabId, { type: "application-continue" }).catch(() => undefined)
  return true
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
function preferEnglishApplyUrl(url) {
  try {
    const u = new URL(url)
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
async function learnedApplyUrl(postingId, job) {
  if (!postingId && !job) return null
  const { oddsLearnedApply = {} } = await chrome.storage.local.get("oddsLearnedApply")
  const url = (postingId && oddsLearnedApply[postingId]?.url) || (job && oddsLearnedApply[`job:${jobKeyOf(job, null)}`]?.url)
  return typeof url === "string" && /^https:\/\//.test(url) ? url : null
}
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
      await continueInTab(tab.id, { reveal: false })
      return { ok: true, resumed: true }
    }
    // New application: in the Odds window — a separate Chrome window, opened without focus, where Broods works in the open (the person can
    // glance at it) while their own window is never touched. Its tab is the visible one in that window, which is what lets Broods see it.
    // Intent MUST be stored before the job URL loads — otherwise apply.js asks apply-intent too early and never watches Closed.
    const windowId = await oddsWindow(reveal)
    const tab = typeof windowId === "number"
      ? await chrome.tabs.create({ windowId, url: "about:blank", active: true })
      : (await chrome.windows.create({ url: "about:blank", focused: reveal, type: "normal" })).tabs?.[0]
    const tabId = tab?.id
    if (typeof tabId !== "number") return { ok: false, message: "Could not open an application tab." }
    await setIntent(tabId, { job: applyUrl, postingId, at: Date.now(), status: "filling", message: "Opening the application…" })
    // Where this application was found last time (the employer's real form), straight away; the job's own link otherwise.
    const learned = await learnedApplyUrl(postingId, applyUrl)
    await chrome.tabs.update(tabId, { url: learned || applyUrl, active: reveal }).catch(() => undefined)
    // Person asked to look: bring the new tab's window forward too.
    if (reveal) await revealApplicationTab(tabId, true)
    // Applying keeps the job in the person's tracker, in the same click.
    addJob(applyUrl).catch(() => undefined)
    return { ok: true, resumed: false }
  })().finally(() => applicationStarts.delete(job))
  applicationStarts.set(job, opening)
  return opening
}
// A tab opened by a tab that was applying (the employer's application in a new tab) is applying too.
chrome.tabs.onCreated.addListener((tab) => {
  const from = typeof tab.openerTabId === "number" ? followFrom.get(tab.openerTabId) : null
  if (!from || Date.now() - from.at >= 30_000 || typeof tab.id !== "number") return
  const opener = tab.openerTabId
  const tabId = tab.id
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
    if (tab.active) chrome.tabs.update(tabId, { active: false }).catch(() => undefined)
    // Wake apply-any if it loaded before intent was written.
    chrome.tabs.sendMessage(tabId, { type: "application-continue" }).catch(() => undefined)
  })()
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
    const { oddsPhoneControl } = await chrome.storage.local.get("oddsPhoneControl")
    if (!oddsPhoneControl || !await savedKey()) return
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
    if (!(await chrome.storage.local.get("oddsPhoneControl")).oddsPhoneControl || !await savedKey()) return
    if (task.status !== "filling" || !/^https:\/\//.test(task.url)) return
    // Phone/desktop queue: fill in the background; surface the tab only at needs_input/ready.
    const applyUrl = preferEnglishApplyUrl(task.url)
    const tab = await chrome.tabs.create({ url: "about:blank", active: false })
    const run = { id: task.id, tabId: tab.id, postingId: task.posting_id || null }
    await updateApplicationRuns(current => { current[run.id] = run })
    await setIntent(tab.id, { job: applyUrl, at: Date.now(), runId: task.id, postingId: task.posting_id || null })
    await chrome.tabs.update(tab.id, { url: applyUrl, active: false })
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
      // Merged into the newest record: never overwrite what another message just wrote (the loop count, a pause, a stop).
      await changeIntents((all) => {
        const intent = all[sender.tab.id]
        if (!intent) return
        // A run Odds stopped (loop) or the person paused keeps that message until they act: later "Filling…" chatter cannot hide it.
        if ((intent.stopped || intent.paused) && message.status === "filling") return
        all[sender.tab.id] = { ...intent, at: Date.now(), status: message.status, message: String(message.message || "").slice(0, 500) }
      })
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
