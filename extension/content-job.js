// Runs on LinkedIn job pages. One quiet button beside Save shows "odds" and the person's interview chance for the job that is open, "?%" when
// odds does not hold that job yet. Pressing it keeps the job in odds and slides the odds panel in (panel.js); pressing it again hides it.
// Only the address of the page goes to odds, and only the page of a job that is open.
const JOB_ID_IN_ADDRESS = /(?:\/jobs\/view\/(?:[^/?#]*-)?|[?&]currentJobId=)(\d{8,12})/

let button = null
/** The job the button is showing: its id, and what odds said about it. */
let current = { id: "", phase: "peeking", chance: null, saved: false, known: false, closed: false, needsProfile: false }

function jobOnPage() {
  const found = JOB_ID_IN_ADDRESS.exec(location.pathname + location.search)
  return found ? found[1] : null
}

function draw(state, label, title, note) {
  if (!button) return
  button.dataset.state = state
  button.replaceChildren()
  const mark = document.createElement("span")
  mark.className = "odds-mark"
  mark.textContent = "odds"
  const text = document.createElement("span")
  text.className = "odds-text"
  text.textContent = label
  button.append(mark, text)
  if (note) {
    const bubble = document.createElement("span")
    bubble.className = "odds-note"
    bubble.textContent = note
    button.append(bubble)
  }
  button.title = title
}

const percent = (n) => (typeof n === "number" ? `${n}%` : "?%")

/** Draws the button for whatever is known about the open job. */
function show() {
  if (!button) return
  const c = current
  if (c.phase === "peeking") return draw("busy", "…", "Looking up your chance for this job")
  if (c.phase === "connect") return draw("problem", "Connect", "Connect odds to see your interview chance here")
  if (c.phase === "error") return draw("problem", "?%", "Try again", c.message || "odds did not answer.")
  if (c.closed) return draw("idle", "closed", "This job is closed")
  if (c.saved) return draw("done", `✓ ${percent(c.chance)}`, "Saved in odds. Press to show your jobs", c.needsProfile ? "Add your CV on odds to see your chance." : null)
  const known = c.known ? `Your interview chance for this job is ${percent(c.chance)}. Press to save it in odds` : "odds does not have this job yet. Press to add it and see your chance"
  draw("idle", percent(c.chance), known, c.known && c.needsProfile ? "Add your CV on odds to see your chance." : null)
}

function peek(id) {
  current = { id, phase: "peeking", chance: null, saved: false, known: false, closed: false, needsProfile: false }
  show()
  chrome.runtime.sendMessage({ type: "peek", url: location.href }, (answer) => {
    if (current.id !== id) return
    if (chrome.runtime.lastError || !answer) current = { ...current, phase: "error" }
    else if (answer.status === "connect") current = { ...current, phase: "connect" }
    else if (answer.status !== "ok") current = { ...current, phase: "error", message: answer.message }
    else current = { ...current, phase: "ready", known: Boolean(answer.known), closed: Boolean(answer.closed), saved: Boolean(answer.saved), chance: typeof answer.chance_pct === "number" ? answer.chance_pct : null, needsProfile: Boolean(answer.needs_profile) }
    show()
  })
}

function add() {
  const id = current.id
  draw("busy", "…", "Adding this job to odds")
  chrome.runtime.sendMessage({ type: "add", url: location.href }, (answer) => {
    if (current.id !== id) return
    if (chrome.runtime.lastError || !answer) current = { ...current, phase: "error", message: "odds did not answer." }
    else if (answer.status === "connect") current = { ...current, phase: "connect" }
    else if (answer.status === "added" || answer.status === "exists") {
      current = { ...current, phase: "ready", known: true, saved: true, chance: typeof answer.chance_pct === "number" ? answer.chance_pct : null, needsProfile: Boolean(answer.needs_profile) }
      show()
      openPanel(answer.job && answer.job.id ? { ...answer.job, chance_pct: current.chance } : undefined)
      return
    } else current = { ...current, phase: "error", message: answer.message || "That job could not be added." }
    show()
  })
}

function press() {
  const c = current
  if (c.phase === "connect") return chrome.runtime.sendMessage({ type: "open-connect" })
  if (c.phase === "error") return peek(c.id)
  if (c.phase !== "ready" || c.closed) return
  if (c.saved) return togglePanel()
  add()
}

/** LinkedIn's own Save button of the open job, so odds can sit beside it. Null when the page has none (then odds floats at the edge). */
function saveButton() {
  const candidates = document.querySelectorAll("main button, .jobs-search__job-details button, .job-view-layout button")
  for (const b of candidates) {
    const label = (b.getAttribute("aria-label") || b.textContent || "").trim()
    if (/^save\b/i.test(label) && b.offsetParent !== null && b.id !== "odds-add") return b
  }
  return null
}

/** Puts the button next to Save when there is one, else floating; moves it again when LinkedIn redraws the page. */
function place() {
  const save = saveButton()
  let anchor = save
  // LinkedIn wraps each button in a div of its own: go up to the one that sits in the row beside Easy Apply, and join that row.
  while (anchor && anchor.parentElement && anchor.parentElement.children.length === 1 && anchor.parentElement !== document.body) anchor = anchor.parentElement
  const parent = anchor ? anchor.parentElement : document.documentElement
  const where = anchor ? "inline" : "float"
  if (button.parentElement !== parent || button.dataset.where !== where || (anchor && anchor.nextElementSibling !== button)) {
    button.dataset.where = where
    if (anchor) anchor.after(button)
    else parent.append(button)
  }
}

let waiting = 0

function sync() {
  const id = jobOnPage()
  if (!id) {
    button?.remove()
    button = null
    current = { ...current, id: "" }
    closePanel()
    return
  }
  if (!button) {
    button = document.createElement("button")
    button.id = "odds-add"
    button.type = "button"
    button.onclick = press
    document.documentElement.append(button)
  }
  place()
  // Another job opened in the same page (LinkedIn does not reload): look it up, after a short pause so flicking through a list asks once.
  if (current.id !== id) {
    current = { id, phase: "peeking", chance: null, saved: false, known: false, closed: false, needsProfile: false }
    show()
    window.clearTimeout(waiting)
    waiting = window.setTimeout(() => {
      if (current.id === id) peek(id)
    }, 350)
  }
}

sync()
setInterval(sync, 700)
