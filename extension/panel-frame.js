// The page inside the odds panel on LinkedIn (extension/panel.js frames this page). It shows the odds app, signs it in, and drops the job that was
// just added over it.
const ODDS = "https://odds.beeblast.co"
const app = document.getElementById("app")
const note = document.getElementById("note")
const toast = document.getElementById("toast")
const count = document.getElementById("count")

let appReady = false
let waiting = null

function say(text) {
  note.hidden = !text
  note.textContent = text || ""
}

function toApp(message) {
  app.contentWindow.postMessage({ source: "odds-extension", ...message }, ODDS)
}

function openJob(id) {
  if (appReady) toApp({ type: "open-job", id })
  else waiting = id
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
      chrome.runtime.sendMessage({ type: "session" }, (answer) => {
        if (chrome.runtime.lastError || !answer) return say("odds did not answer.")
        if (answer.status === "connect") return say("Connect odds from the extension's icon, then open this again.")
        if (answer.status !== "ok") return say(answer.message || "Could not sign you in.")
        say("")
        toApp({ type: "session", session: answer.session })
      })
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
  // From the LinkedIn page's script: a job was added.
  if (event.source === window.parent && event.data && event.data.source === "odds-content" && event.data.type === "added" && event.data.job) {
    dropIn(event.data.job)
    openJob(event.data.job.id)
  }
})

// Inside a page the cross asks the page to hide the panel; in the browser's own side panel it closes it.
document.getElementById("close").onclick = () => (window.parent !== window ? window.parent.postMessage({ source: "odds-panel", type: "close" }, "*") : window.close())
app.addEventListener("load", () => {
  appReady = false
})
refreshCount(false)
