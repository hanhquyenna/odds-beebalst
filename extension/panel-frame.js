// The page inside the odds panel on a job site (extension/panel.js frames this page). It shows the odds app, signs it in, and drops the job that was
// just added over it.
const ODDS = "https://odds.beeblast.co"
const app = document.getElementById("app")
const note = document.getElementById("note")

let appReady = false
let waiting = null
let lastOpened = null

function say(text) {
  note.hidden = !text
  note.textContent = text || ""
}

function toApp(message) {
  app.contentWindow.postMessage({ source: "odds-extension", ...message }, ODDS)
}

/**
 * Opens a job in the app; every press opens it, whatever the person did in the app since (went back, opened another page). `once` is for the
 * browser's side panel, which hears of one press twice as it opens (asking the background, and the background telling it): that opens once.
 */
function openJob(id, once = false) {
  if (appReady) {
    if (once && lastOpened && lastOpened.id === id && Date.now() - lastOpened.at < 1500) return
    lastOpened = { id, at: Date.now() }
    toApp({ type: "open-job", id })
  } else waiting = id
}

function viewJob(job) {
  // A job added or opened from a page (its % pressed): the apply card for the page in front shows it (job, Apply, insights), never the
  // app's home. While Odds is still reading the job, the card says so and fills in once the job is known.
  jobViewUrl = null
  // The job the page's button just read: the apply card shows it even before the server's page lookup knows this address.
  if (job.id) knownJob = { id: job.id, title: job.title || "", employer: job.company || null, url: lastPageUrl }
  if (job.pending) {
    waiting = null
    lastOpened = null
    app.hidden = true
    say(`${job.title || "Job details"}${job.company ? " · " + job.company : ""}\n${job.message || "Reading the full job and preparing your details…"}`)
    return
  }
  if (!appReady) {
    app.hidden = true
    say(`Opening ${job.title || "job details"}…`)
    waiting = null
    showOnReady = true
  } else { app.hidden = false; say("") }
  kitRefresh = Date.now()
  sendPanelInfo()
  setTimeout(sendPanelInfo, 2500)
}


window.addEventListener("message", (event) => {
  // From the odds app in the frame below: it asks for a sign-in when it has none, and says when it is ready.
  if (event.source === app.contentWindow) {
    if (event.origin !== ODDS || !event.data || event.data.source !== "odds-site") return
    if (event.data.type === "need-session") {
      appReady = false
      lastOpened = null
      chrome.runtime.sendMessage({ type: "session" }, (answer) => {
        if (chrome.runtime.lastError || !answer) return say("odds did not answer.")
        if (answer.status === "connect") return say("Connect odds from the extension's icon, then open this again.")
        if (answer.status !== "ok") return say(answer.message || "Could not sign you in.")
        say("")
        toApp({ type: "session", session: answer.session })
      })
    }
    if (event.data.type === "home") {
      lastOpened = null
      appReady = false
    }
    // "odds apply" on a job in the app: open it in the person's tab and fill its application in there.
    if (event.data.type === "apply" && typeof event.data.url === "string") {
      chrome.runtime.sendMessage({ type: "apply-in-tab", url: event.data.url, reveal: event.data.reveal === true, postingId: typeof event.data.postingId === "string" ? event.data.postingId : null }, (answer) => {
        void chrome.runtime.lastError
        toApp({ type: "application-started", url: event.data.url, ok: answer?.ok !== false, message: answer?.message || "" })
      })
    }
    // The app asking how a job's application is going.
    if (event.data.type === "application-status" && typeof event.data.url === "string") {
      const url = event.data.url
      const postingId = typeof event.data.postingId === "string" ? event.data.postingId : null
      chrome.runtime.sendMessage({ type: "application-status", url, postingId }, (answer) => {
        if (!chrome.runtime.lastError) toApp({ type: "application-status", url, state: answer?.state || null })
      })
    }
    if (event.data.type === "ready") {
      appReady = true
      if (!app.hidden) say("")
      // A job added before the app was ready: its apply card now.
      if (showOnReady) { showOnReady = false; app.hidden = false; say(""); sendPanelInfo() }
      if (waiting) {
        app.hidden = false
        say("")
        openJob(waiting)
        waiting = null
      }
    }
    return
  }
  // From the job page's script: a job was added.
  if (event.source === window.parent && event.data && event.data.source === "odds-content" && event.data.type === "added" && event.data.job) {
    viewJob(event.data.job)
  }
})

// Inside a page the cross asks the page to hide the panel; in the browser's own side panel it closes it.
document.getElementById("close").onclick = () => (window.parent !== window ? window.parent.postMessage({ source: "odds-panel", type: "close" }, "*") : window.close())
// The app announces ready while its script runs, before iframe load fires.
// Resetting readiness on load loses that handshake and stalls job selection.
// Saved-job counts are refreshed only after an explicit save, not while browsing.

// In the browser's side panel, the page that added a job tells it by way of the background; only the panel of that tab reacts.
if (window.parent === window) {
  chrome.runtime.sendMessage({ type: "panel-ready" }, (answer) => {
    if (!chrome.runtime.lastError && answer?.job) viewJob(answer.job)
  })
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "panel-added" || !message.job) return
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs[0] || tabs[0].id !== message.tabId) return
      viewJob(message.job)
    })
  })
}

const phoneControl = document.getElementById("phone-control")
chrome.storage.local.get("oddsPhoneControl").then(v => { phoneControl.checked = v.oddsPhoneControl === true })
phoneControl.addEventListener("change", () => chrome.storage.local.set({ oddsPhoneControl: phoneControl.checked }))
// Poll immediately on opening and every five seconds while the panel is visible.
const pollPhone = () => chrome.runtime.sendMessage({ type: "application-poll" }, () => void chrome.runtime.lastError)
const syncApplyChips = () => chrome.runtime.sendMessage({ type: "application-statuses" }, (answer) => {
  if (chrome.runtime.lastError || !Array.isArray(answer?.runs)) return
  toApp({ type: "apply-activity-sync", runs: answer.runs })
})
pollPhone()
syncApplyChips()
setInterval(pollPhone, 5000)
setInterval(syncApplyChips, 2000)


// The page in front, for the odds app's apply view (src/components/ApplyPanel.tsx): the form on it, its job, how filling goes, and at review
// the form's new answers for Autofill. The app draws it with its own components; its presses come back here (panel-fill, panel-add-job,
// panel-keep-answers) and go to the background.
let lastAnswers = { tabId: null, at: 0, items: [] }
let lastPageUrl = null
let jobViewUrl = null
/** When a job was just added from the page: the next panel info asks the server afresh (the new job's card). */
let kitRefresh = 0
/** The job a page's button last added or opened, with the address it was for (null until the next panel info says which page). */
let knownJob = null
/** A job was added before the app was ready: show the app (its apply card) once it is. */
let showOnReady = false
function sendPanelInfo() {
  chrome.runtime.sendMessage({ type: "panel-apply-info", fresh: Date.now() - kitRefresh < 10000 }, (info) => {
    if (chrome.runtime.lastError) return
    let page = info?.page || null
    if (knownJob && page) {
      if (!knownJob.url) knownJob.url = page.url
      if (knownJob.url === page.url && info && !info.job_id) info = { ...info, job_id: knownJob.id, job: { title: knownJob.title, employer: knownJob.employer } }
      else if (knownJob.url !== page.url) knownJob = null
    }
    if (jobViewUrl && (jobViewUrl === "*" || page?.url === jobViewUrl)) { if (jobViewUrl === "*") jobViewUrl = page?.url || "*"; page = null }
    else jobViewUrl = null
    lastPageUrl = info?.page?.url || null
    const state = info?.status?.state
    const send = (answers) => toApp({ type: "panel-info", info: page ? { ...info, answers } : null })
    // Two-way Autofill: whenever the page has a form or an application under way (not only at review), the answers on it that Autofill
    // does not have yet (written by Odds, or typed by the person) are offered to keep.
    if (page && (page.form || state) && state !== "filling") {
      if (lastAnswers.tabId === page.tabId && Date.now() - lastAnswers.at < 6000) return send(lastAnswers.items)
      chrome.runtime.sendMessage({ type: "panel-new-answers", tabId: page.tabId }, (res) => {
        void chrome.runtime.lastError
        lastAnswers = { tabId: page.tabId, at: Date.now(), items: res?.items || [] }
        send(lastAnswers.items)
      })
    } else send([])
  })
}
window.addEventListener("message", (event) => {
  if (event.source !== app.contentWindow || event.origin !== ODDS || event.data?.source !== "odds-site") return
  const d = event.data
  if (d.type === "panel-fill" && typeof d.tabId === "number") chrome.runtime.sendMessage({ type: "fill-tab", tabId: d.tabId }, () => { void chrome.runtime.lastError; sendPanelInfo() })
  if (d.type === "apply-here" && typeof d.tabId === "number" && typeof d.url === "string") chrome.runtime.sendMessage({ type: "apply-here", tabId: d.tabId, url: d.url, postingId: typeof d.postingId === "string" ? d.postingId : null }, () => { void chrome.runtime.lastError; sendPanelInfo() })
  if (d.type === "panel-account" && typeof d.tabId === "number") chrome.runtime.sendMessage({ type: "panel-account", tabId: d.tabId, create: d.create === true }, () => { void chrome.runtime.lastError; sendPanelInfo() })
  if (d.type === "panel-add-job" && typeof d.url === "string") chrome.runtime.sendMessage({ type: "panel-add-job", url: d.url }, () => { void chrome.runtime.lastError; sendPanelInfo() })
  if (d.type === "panel-chance" && typeof d.tabId === "number" && typeof d.pct === "number") {
    chrome.runtime.sendMessage({ type: "panel-chance", tabId: d.tabId, url: typeof d.url === "string" ? d.url : "", pct: d.pct, label: typeof d.label === "string" ? d.label : `${d.pct}%` }, () => { void chrome.runtime.lastError })
  }
  if (d.type === "panel-keep-answers" && typeof d.tabId === "number" && Array.isArray(d.questions)) {
    chrome.runtime.sendMessage({ type: "panel-keep-answers", tabId: d.tabId, url: null, questions: d.questions }, () => { void chrome.runtime.lastError; lastAnswers = { tabId: null, at: 0, items: [] } })
  }
})
sendPanelInfo()
setInterval(sendPanelInfo, 2000)
chrome.tabs?.onActivated?.addListener(() => sendPanelInfo())
