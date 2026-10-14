// The page inside the odds panel on a job site (extension/panel.js frames this page). It shows the odds app, signs it in, and drops the job that was
// just added over it.
const ODDS = "https://odds.beeblast.co"
const app = document.getElementById("app")
const note = document.getElementById("note")
const toast = document.getElementById("toast")
const count = document.getElementById("count")

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

function setCount(total, bump) {
  if (typeof total !== "number") return
  count.hidden = false
  count.textContent = String(total)
  count.classList.remove("bump")
  if (bump) {
    void count.offsetWidth
    count.classList.add("bump")
  }
}

function refreshCount(bump) {
  chrome.runtime.sendMessage({ type: "pool" }, (answer) => {
    if (!chrome.runtime.lastError && answer && answer.status === "ok") setCount(answer.total ?? answer.jobs.length, bump)
  })
}

function dropIn(job) {
  const card = document.createElement("div")
  card.className = "card"
  const title = document.createElement("div")
  title.className = "t"
  title.textContent = job.title || "Job saved"
  const meta = document.createElement("div")
  meta.className = "m"
  meta.textContent = [job.company, job.city].filter(Boolean).join(" · ")
  card.append(title, meta)
  if (typeof job.chance_pct === "number") {
    const chip = document.createElement("span")
    chip.className = "chip"
    chip.textContent = `${job.chance_pct}% chance`
    card.append(chip)
  }
  toast.replaceChildren(card)
  toast.hidden = false
  window.setTimeout(() => card.classList.add("leave"), 2600)
  window.setTimeout(() => {
    toast.hidden = true
    refreshCount(true)
  }, 3100)
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
      chrome.runtime.sendMessage({ type: "apply-in-tab", url: event.data.url }, () => void chrome.runtime.lastError)
      if (window.parent !== window) window.parent.postMessage({ source: "odds-panel", type: "close" }, "*")
    }
    if (event.data.type === "ready") {
      appReady = true
      say("")
      if (waiting) {
        openJob(waiting)
        waiting = null
      }
    }
    return
  }
  // From the job page's script: a job was added.
  if (event.source === window.parent && event.data && event.data.source === "odds-content" && event.data.type === "added" && event.data.job) {
    dropIn(event.data.job)
    openJob(event.data.job.id)
  }
})

// Inside a page the cross asks the page to hide the panel; in the browser's own side panel it closes it.
document.getElementById("close").onclick = () => (window.parent !== window ? window.parent.postMessage({ source: "odds-panel", type: "close" }, "*") : window.close())
// The app announces ready while its script runs, before iframe load fires.
// Resetting readiness on load loses that handshake and stalls job selection.
refreshCount(false)

// In the browser's side panel, the page that added a job tells it by way of the background; only the panel of that tab reacts.
if (window.parent === window) {
  chrome.runtime.sendMessage({ type: "panel-ready" }, (answer) => {
    if (!chrome.runtime.lastError && answer?.job) openJob(answer.job.id, true)
  })
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "panel-added" || !message.job) return
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs[0] || tabs[0].id !== message.tabId) return
      dropIn(message.job)
      openJob(message.job.id, true)
    })
  })
}
