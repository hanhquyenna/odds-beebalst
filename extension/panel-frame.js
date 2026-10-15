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
  } else { app.hidden = false; say("") }
  openJob(job.id)
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
