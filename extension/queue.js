// The apply queue, extension side. The person picks jobs in the Odds app; this works them one after another, at most two at a time, each
// in the Odds window so their own tabs are never touched. Every application stops at Review (or at one reason only the person can fix):
// Odds never submits. Loaded by background.js with importScripts; it uses openApplication, savedKey, ext and the apply intents from there.
//
//   every 30 s (and when the worker wakes):  look at the jobs being worked → tell the server how each ended → ask for more → open them
//   tab states come from the same intents the side panel reads (filling | needs_input | ready | submitted | failed)

/** At most this many applications are worked on at once (the server never hands out more). */
const QUEUE_PARALLEL = 2
/** A form that is still "filling" after this long is handed to the person with a reason, never left spinning. */
const QUEUE_FORM_MS = 12 * 60_000
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

/** What an intent's status means for the queue: null while Odds is still working. */
function queueOutcomeOf(intent, now = Date.now(), startedAt = now) {
  if (!intent) return null
  if (intent.status === "submitted") return { state: "sent", message: "The site said your application went through." }
  if (intent.status === "ready") return { state: "review", message: "Filled in. Check it and press Submit yourself." }
  if (intent.status === "failed") {
    const reason = queueReasonOf(intent.message)
    return { state: "failed", reason: reason === "other" ? undefined : reason, message: String(intent.message || "Odds could not finish this form.").slice(0, 500) }
  }
  if (intent.status === "needs_input") return { state: "needs_you", reason: queueReasonOf(intent.message), message: String(intent.message || "").slice(0, 500) }
  if (now - startedAt > QUEUE_FORM_MS) return { state: "needs_you", reason: "other", message: "This form took too long for Odds. Open it to finish." }
  return null
}

globalThis.oddsQueueLogic = { queueReasonOf, queueOutcomeOf, QUEUE_PARALLEL }

let queueRunning = false

/** Jobs being worked on (posting id → when it started) and jobs at Review still watched for a thank-you. Kept per browser session. */
async function queueState() {
  const { oddsQueue } = await chrome.storage.session.get("oddsQueue").catch(() => ({}))
  return { working: oddsQueue?.working || {}, watching: oddsQueue?.watching || {} }
}
const queueSave = (state) => chrome.storage.session.set({ oddsQueue: state }).catch(() => undefined)

/** The application tab (and its intent) for a job, by posting id. */
async function queueTabOf(postingId) {
  const { oddsApplyIntents = {} } = await chrome.storage.local.get("oddsApplyIntents")
  let best = null
  for (const [id, intent] of Object.entries(oddsApplyIntents)) {
    if (intent.postingId !== postingId) continue
    if (!best || intent.at > best.intent.at) best = { tabId: Number(id), intent }
  }
  if (!best) return null
  const tab = await chrome.tabs.get(best.tabId).catch(() => null)
  return { ...best, tab }
}

async function queueTell(postingId, outcome) {
  await ext("queue-done", { method: "POST", body: JSON.stringify({ posting_id: postingId, state: outcome.state, reason: outcome.reason, message: outcome.message }) })
}

async function queueTick() {
  if (queueRunning || !await savedKey()) return
  queueRunning = true
  try {
    const state = await queueState()
    const now = Date.now()
    // 1. How are the jobs being worked on? Whatever ended is told to the server and frees its place.
    for (const [postingId, startedAt] of Object.entries(state.working)) {
      const found = await queueTabOf(postingId)
      let outcome = queueOutcomeOf(found?.intent, now, startedAt)
      if (!outcome && (!found || !found.tab)) outcome = { state: "failed", message: "The application tab was closed before Odds finished." }
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
      const outcome = found?.tab ? queueOutcomeOf(found.intent) : null
      if (!outcome || outcome.state === seen.told || outcome.state === "failed") continue
      await queueTell(postingId, outcome)
      state.watching[postingId] = { since: seen.since, told: outcome.state }
      if (outcome.state === "sent") delete state.watching[postingId]
    }
    // 3. Ask for the next jobs (and which ones the person took out of the queue).
    const answer = await ext("queue-next", { method: "POST", body: JSON.stringify({ active: Object.keys(state.working) }) })
    if (answer.status === "ok") {
      for (const postingId of answer.drop || []) {
        const found = await queueTabOf(postingId)
        if (found?.tab?.id) await chrome.tabs.remove(found.tab.id).catch(() => undefined)
        delete state.working[postingId]
      }
      for (const job of (answer.start || []).slice(0, QUEUE_PARALLEL)) {
        if (!/^https:\/\//.test(job.url || "") || Object.keys(state.working).length >= QUEUE_PARALLEL) continue
        state.working[job.posting_id] = Date.now()
        await queueSave(state)
        // The Odds window, not the person's: openApplication with no tab to sit next to.
        const opened = await openApplication(job.url, null, { postingId: job.posting_id }).catch(() => ({ ok: false }))
        if (!opened?.ok) {
          await queueTell(job.posting_id, { state: "failed", message: opened?.message || "Odds could not open this application." })
          delete state.working[job.posting_id]
        }
      }
    }
    await queueSave(state)
  } catch {
    // The next tick tries again.
  } finally { queueRunning = false }
}

chrome.alarms.get("odds-queue").then((alarm) => {
  if (!alarm || alarm.periodInMinutes !== 0.5) chrome.alarms.create("odds-queue", { periodInMinutes: 0.5 })
})
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === "odds-queue") queueTick().catch(() => undefined) })
// The Odds app (content-site.js) or a test can ask for a look right now.
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== "queue-tick") return false
  queueTick().then(() => reply({ ok: true })).catch(() => reply({ ok: false }))
  return true
})
// After background.js has finished loading (it declares what this uses).
setTimeout(() => queueTick().catch(() => undefined), 0)
