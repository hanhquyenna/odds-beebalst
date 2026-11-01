// The apply queue, extension side. The person presses Apply in the Odds app (or the side panel); the job goes into their queue on the
// server and this works it: at most three at a time, each in a background tab of the person's own window (the Odds tab group), so their own
// tab is never touched. Every application stops before Submit (or at one reason only the person can fix): Odds never submits.
// Loaded by background.js with importScripts; it uses openApplication, setIntent, savedKey, ext and the apply intents from there.
//
//   every 30 s (and when the app asks):  look at the jobs being worked → tell the server how each ended → ask for more → open them
//   tab states come from the same intents the side panel reads (filling | needs_input | ready | submitted | failed)
//
// Nothing drops midway: the jobs being worked are kept in local storage with their tab, so a reload of the extension carries each one on in
// its own tab. A tab that was lost or a form that stalled goes back to the server as "retry", which starts it again by itself twice.

/** At most this many applications are worked on at once (the server never hands out more). */
const QUEUE_PARALLEL = 3
/** A form with no news for this long has stalled: it is started again (the server decides whether once more, or asks the person). */
const QUEUE_QUIET_MS = 8 * 60_000
/** How long after Review the tab is still watched for the site's own thank-you. */
const QUEUE_WATCH_MS = 24 * 60 * 60_000

/** The one reason an application stopped for the person, from the tab's last words. The server prefers the Broods run's own reason. */
function queueReasonOf(message) {
  const m = String(message || "")
  if (/no longer accepting|not currently accepting|applications are closed|no longer available|vacature gesloten|job is closed/i.test(m)) return "closed"
  if (/captcha|verify you are human|security (check|verification)/i.test(m)) return "captcha"
  if (/apply by email|by e-?mail/i.test(m)) return "email"
  if (/cover letter|motivation letter|motivatiebrief/i.test(m)) return "letter"
  if (/password|create (an )?account|sign in|log ?in|inloggen|account aanmaken|never types passwords/i.test(m)) return "account"
  if (/question|answer|marked|outlined|consent/i.test(m)) return "questions"
  return "other"
}

/** What an intent's status means for the queue: null while Odds is still working. `quietSince` is the intent's last news. */
function queueOutcomeOf(intent, now = Date.now()) {
  if (!intent) return null
  if (intent.status === "submitted") return { state: "sent", message: "The site said your application went through." }
  if (intent.status === "ready") return { state: "review", message: "Filled in. Check it and press Submit yourself." }
  if (intent.status === "failed") {
    const reason = queueReasonOf(intent.message)
    return { state: "failed", reason: reason === "other" ? undefined : reason, message: String(intent.message || "Odds could not finish this form.").slice(0, 500) }
  }
  if (intent.status === "needs_input") return { state: "needs_you", reason: queueReasonOf(intent.message), message: String(intent.message || "").slice(0, 500) }
  if (now - (intent.at || now) > QUEUE_QUIET_MS) return { state: "retry", message: "This form went quiet for a while, so Odds took too long." }
  return null
}

globalThis.oddsQueueLogic = { queueReasonOf, queueOutcomeOf, QUEUE_PARALLEL }

let queueRunning = false

/**
 * Jobs being worked on (posting id → { at, tabId, url }) and jobs at Review or stopped, still watched for the person getting them further.
 * Local storage, not session: a reload of the extension must not forget a job halfway.
 */
async function queueState() {
  const { oddsQueue } = await chrome.storage.local.get("oddsQueue").catch(() => ({}))
  return { working: oddsQueue?.working || {}, watching: oddsQueue?.watching || {} }
}
const queueSave = (state) => chrome.storage.local.set({ oddsQueue: state }).catch(() => undefined)

/** The newest application record for a job, by posting id, and its tab when it still has one. */
async function queueTabOf(postingId) {
  const { oddsApplyIntents = {} } = await chrome.storage.local.get("oddsApplyIntents")
  let best = null
  for (const [id, intent] of Object.entries(oddsApplyIntents)) {
    if (intent.postingId !== postingId) continue
    if (!best || intent.at > best.intent.at) best = { key: id, intent }
  }
  if (!best) return null
  const tab = /^\d+$/.test(best.key) ? await chrome.tabs.get(Number(best.key)).catch(() => null) : null
  return { ...best, tab }
}

async function queueTell(postingId, outcome) {
  await ext("queue-done", { method: "POST", body: JSON.stringify({ posting_id: postingId, state: outcome.state, reason: outcome.reason, message: outcome.message }) })
}

/** Start (or start again) one job: in its own tab when it still has one, else a new background tab. Returns its tab id, or null. */
async function queueStart(postingId, url, knownTab) {
  const found = await queueTabOf(postingId)
  if (found?.tab) {
    // Started again in the same tab: a fresh run, not the last one's stop.
    await setIntent(found.tab.id, { ...found.intent, at: Date.now(), status: "filling", message: "Filling in the background…", stopped: false, paused: false, hunt: undefined })
  } else if (typeof knownTab === "number" && await chrome.tabs.get(knownTab).catch(() => null)) {
    // The extension was reloaded (its records are gone) but the tab is still there: carry on in it.
    await setIntent(knownTab, { job: url, postingId, at: Date.now(), status: "filling", message: "Carrying on where Odds was…" })
  }
  const opened = await openApplication(url, null, { postingId }).catch(() => ({ ok: false }))
  if (!opened?.ok) return { tabId: null, message: opened?.message || "Odds could not open this application." }
  return { tabId: (await queueTabOf(postingId))?.tab?.id ?? null }
}

async function queueTick() {
  if (queueRunning || !await savedKey()) return
  queueRunning = true
  try {
    const state = await queueState()
    const now = Date.now()
    // 1. How are the jobs being worked on? Whatever ended is told to the server and frees its place.
    for (const [postingId, job] of Object.entries(state.working)) {
      const found = await queueTabOf(postingId)
      // News from the form is the record's own time, or Broods' last step in that tab, whichever is later.
      const seen = found?.tab ? globalThis.oddsDriveSeen?.get(found.tab.id) || 0 : 0
      let outcome = queueOutcomeOf(found?.intent ? { ...found.intent, at: Math.max(found.intent.at || 0, seen) } : null, now)
      if (!outcome && !found?.tab) {
        // No record (the extension was reloaded): carry on in its tab. No tab at all: the person closed it, or it was lost.
        const alive = typeof job.tabId === "number" ? await chrome.tabs.get(job.tabId).catch(() => null) : null
        if (alive && job.url) {
          const started = await queueStart(postingId, job.url, job.tabId)
          if (started.tabId) { state.working[postingId] = { ...job, tabId: started.tabId }; continue }
        }
        outcome = { state: "retry", reason: "tab", message: "The application tab was closed before Odds finished." }
      }
      if (!outcome) continue
      await queueTell(postingId, outcome)
      delete state.working[postingId]
      if (outcome.state === "review" || outcome.state === "needs_you") state.watching[postingId] = { since: now, told: outcome.state }
      if (outcome.state === "sent") delete state.watching[postingId]
    }
    // 2. Jobs stopped at Review or at a reason: if the person got them further (fixed it, or the site's own thank-you shows) the server hears it.
    //    Nothing but the site's own thank-you marks a job sent from here.
    for (const [postingId, seen] of Object.entries(state.watching)) {
      if (now - seen.since > QUEUE_WATCH_MS) { delete state.watching[postingId]; continue }
      const found = await queueTabOf(postingId)
      const outcome = found?.tab ? queueOutcomeOf(found.intent, now) : null
      if (!outcome || outcome.state === seen.told || outcome.state === "failed" || outcome.state === "retry") continue
      await queueTell(postingId, outcome)
      state.watching[postingId] = { since: seen.since, told: outcome.state }
      if (outcome.state === "sent") delete state.watching[postingId]
    }
    // 3. Ask for the next jobs (and which ones the person skipped).
    const answer = await ext("queue-next", { method: "POST", body: JSON.stringify({ active: Object.keys(state.working) }) })
    if (answer.status === "ok") {
      for (const postingId of answer.drop || []) {
        const found = await queueTabOf(postingId)
        if (found?.tab?.id) await chrome.tabs.remove(found.tab.id).catch(() => undefined)
        delete state.working[postingId]
      }
      for (const job of (answer.start || []).slice(0, QUEUE_PARALLEL)) {
        if (!/^https:\/\//.test(job.url || "") || Object.keys(state.working).length >= QUEUE_PARALLEL) continue
        delete state.watching[job.posting_id]
        state.working[job.posting_id] = { at: Date.now(), tabId: null, url: job.url }
        await queueSave(state)
        const started = await queueStart(job.posting_id, job.url, null)
        if (!started.tabId) {
          await queueTell(job.posting_id, { state: "failed", message: started.message || "Odds could not open this application." })
          delete state.working[job.posting_id]
          continue
        }
        state.working[job.posting_id].tabId = started.tabId
      }
    }
    await queueSave(state)
  } catch {
    // The next tick tries again.
  } finally { queueRunning = false }
}

// Chrome started again: tab ids from before mean nothing now. The jobs go back to the server's line by themselves (no Chrome checks in on
// them), and are started again in new tabs.
chrome.runtime.onStartup.addListener(() => { void chrome.storage.local.set({ oddsQueue: { working: {}, watching: {} } }) })

chrome.alarms.get("odds-queue").then((alarm) => {
  if (!alarm || alarm.periodInMinutes !== 0.5) chrome.alarms.create("odds-queue", { periodInMinutes: 0.5 })
})
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === "odds-queue") queueTick().catch(() => undefined) })
// The Odds app (content-site.js), the side panel or a test can ask for a look right now.
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== "queue-tick") return false
  queueTick().then(() => reply({ ok: true })).catch(() => reply({ ok: false }))
  return true
})
// After background.js has finished loading (it declares what this uses).
setTimeout(() => queueTick().catch(() => undefined), 0)
