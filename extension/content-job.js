// Runs on LinkedIn job pages. Shows one button, "Add to odds", while a job is open. Nothing is read until it is pressed, and then only the
// address of the page: odds looks the job up (or reads it) itself.
const JOB_ADDRESS = /\/jobs\/view\/(?:[^/?#]*-)?\d{8,12}|[?&]currentJobId=\d{8,12}/

let button = null
let shownFor = ""

function jobOpen() {
  return JOB_ADDRESS.test(location.pathname + location.search)
}

function render(state, text, link) {
  if (!button) return
  button.dataset.state = state
  button.replaceChildren()
  const mark = document.createElement("span")
  mark.className = "odds-mark"
  mark.textContent = "odds"
  const label = document.createElement("span")
  label.className = "odds-text"
  label.textContent = text
  button.append(mark, label)
  button.onclick = link ? () => window.open(link, "_blank", "noopener") : null
}

function idle() {
  render("idle", "Add to odds")
  button.onclick = add
}

function chanceWords(answer) {
  if (typeof answer.chance_pct === "number") return `${answer.chance_pct}% interview chance`
  return answer.needs_profile ? "Add your CV on odds to see your chance" : ""
}

function add() {
  if (button.dataset.state === "busy") return
  render("busy", "Reading the job…")
  chrome.runtime.sendMessage({ type: "add", url: location.href }, (answer) => {
    if (chrome.runtime.lastError || !answer) return render("problem", "odds did not answer. Try again.")
    switch (answer.status) {
      case "connect":
        render("problem", "Connect odds first")
        button.onclick = () => chrome.runtime.sendMessage({ type: "open-connect" })
        break
      case "added":
      case "exists":
        render("done", ["Saved", chanceWords(answer)].filter(Boolean).join(". "), answer.odds_link)
        break
      default:
        render("problem", answer.message || "That job could not be added.")
        button.onclick = idle
    }
  })
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

function sync() {
  const open = jobOpen()
  if (!open) {
    button?.remove()
    button = null
    shownFor = ""
    return
  }
  if (!button) {
    button = document.createElement("button")
    button.id = "odds-add"
    button.type = "button"
    document.documentElement.append(button)
    shownFor = ""
  }
  place()
  // Another job opened in the same page (LinkedIn does not reload): start again for it.
  const here = location.pathname + location.search
  if (shownFor !== here && button.dataset.state !== "busy") {
    shownFor = here
    idle()
  }
}

sync()
setInterval(sync, 700)
