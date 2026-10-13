// The odds panel on a LinkedIn job page: the person's saved jobs, live. It slides in from the right when a job is added, and the new job
// jumps into the top of the list. It is drawn inside a shadow root, so LinkedIn's styles cannot touch it and ours cannot touch LinkedIn.
const ODDS_SITE = "https://odds.beeblast.co"

const PANEL_CSS = `
:host { all: initial; }
.panel { position: fixed; top: 0; right: 0; z-index: 2147483646; width: 340px; max-width: 92vw; height: 100vh; display: flex; flex-direction: column; background: #fffdfb; color: #1b1b1b; border-left: 1px solid rgba(0,0,0,.12); box-shadow: -8px 0 28px rgba(0,0,0,.14); font: 400 14px/1.4 "odds Inter Tight", system-ui, -apple-system, "Segoe UI", sans-serif; transform: translateX(105%); transition: transform .38s cubic-bezier(.2,.8,.2,1); }
.panel[data-open="true"] { transform: translateX(0); }
header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 10px; }
.brand { font-weight: 800; font-size: 20px; letter-spacing: -.045em; }
.count { margin-left: 8px; padding: 1px 8px; border-radius: 999px; background: rgba(242,128,42,.14); color: #b8570d; font-weight: 600; font-size: 12px; letter-spacing: 0; display: inline-block; }
.count.bump { animation: bump .5s ease; }
.close { all: unset; cursor: pointer; width: 28px; height: 28px; display: grid; place-items: center; border-radius: 999px; font-size: 18px; color: #555; }
.close:hover { background: rgba(0,0,0,.07); }
.sub { padding: 0 16px 8px; color: #6b6b6b; font-size: 12.5px; }
ul { list-style: none; margin: 0; padding: 4px 12px 12px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 8px; }
li a { display: block; padding: 10px 12px; border: 1px solid rgba(0,0,0,.1); border-radius: 12px; background: #fff; color: inherit; text-decoration: none; }
li a:hover { border-color: #e8914d; }
.t { font-weight: 600; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.m { color: #6b6b6b; font-size: 12.5px; margin-top: 2px; }
.row { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 12.5px; }
.chip { padding: 1px 8px; border-radius: 999px; background: rgba(242,128,42,.12); color: #b8570d; font-weight: 600; }
.chip.none { background: rgba(0,0,0,.06); color: #6b6b6b; font-weight: 500; }
.st { color: #6b6b6b; text-transform: capitalize; }
li[data-new="true"] a { animation: jump .75s cubic-bezier(.2,.9,.25,1.25) both, glow 1.8s ease-out both; }
footer { padding: 10px 16px 14px; border-top: 1px solid rgba(0,0,0,.08); }
footer a { color: #b8570d; font-weight: 600; text-decoration: none; }
.empty, .note { padding: 18px 16px; color: #6b6b6b; }
.skeleton { height: 74px; border-radius: 12px; background: linear-gradient(90deg, rgba(0,0,0,.05), rgba(0,0,0,.09), rgba(0,0,0,.05)); background-size: 200% 100%; animation: shimmer 1.1s linear infinite; }
@keyframes jump { 0% { opacity: 0; transform: translateY(-46px) scale(.9); } 55% { opacity: 1; transform: translateY(6px) scale(1.02); } 100% { opacity: 1; transform: none; } }
@keyframes glow { 0% { box-shadow: 0 0 0 0 rgba(242,128,42,.55); border-color: #f2802a; } 100% { box-shadow: 0 0 0 14px rgba(242,128,42,0); border-color: rgba(0,0,0,.1); } }
@keyframes bump { 0% { transform: scale(1); } 40% { transform: scale(1.35); } 100% { transform: scale(1); } }
@keyframes shimmer { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .panel { transition: none; } li[data-new="true"] a, .count.bump, .skeleton { animation: none; } }
`

let host = null
let root = null
let seen = new Set()

function element(tag, className, text) {
  const el = document.createElement(tag)
  if (className) el.className = className
  if (text !== undefined) el.textContent = text
  return el
}

function build() {
  host = document.createElement("div")
  host.id = "odds-panel-host"
  root = host.attachShadow({ mode: "open" })
  const style = document.createElement("style")
  style.textContent = PANEL_CSS
  const panel = element("aside", "panel")
  panel.dataset.open = "false"
  panel.setAttribute("aria-label", "odds")
  const head = element("header")
  const title = element("div")
  title.append(element("span", "brand", "odds"), element("span", "count", ""))
  const close = element("button", "close", "×")
  close.setAttribute("aria-label", "Close")
  close.onclick = closePanel
  head.append(title, close)
  const list = element("ul")
  list.id = "odds-list"
  const foot = element("footer")
  const open = element("a", "", "Open odds")
  open.href = ODDS_SITE
  open.target = "_blank"
  open.rel = "noopener"
  foot.append(open)
  panel.append(head, element("div", "sub", "Your saved jobs"), list, foot)
  root.append(style, panel)
  document.documentElement.append(host)
}

const panelEl = () => root.querySelector(".panel")
const listEl = () => root.getElementById("odds-list")

function card(job, isNew) {
  const li = element("li")
  if (isNew) li.dataset.new = "true"
  const a = element("a")
  a.href = job.link
  a.target = "_blank"
  a.rel = "noopener"
  a.append(element("div", "t", job.title))
  a.append(element("div", "m", [job.company, job.city].filter(Boolean).join(" · ")))
  const row = element("div", "row")
  row.append(typeof job.chance_pct === "number" ? element("span", "chip", `${job.chance_pct}% chance`) : element("span", "chip none", "no estimate"))
  row.append(element("span", "st", String(job.status || "saved").replace(/_/g, " ")))
  a.append(row)
  li.append(a)
  return li
}

function setCount(total, bump) {
  const c = root.querySelector(".count")
  c.textContent = String(total)
  c.classList.remove("bump")
  if (bump) {
    void c.offsetWidth
    c.classList.add("bump")
  }
}

function message(text) {
  listEl().replaceChildren(element("div", "note", text))
}

/**
 * Shows the panel. `added` is the job just added ({ id, title, company, city, chance_pct }): it is on screen at once and jumps in, and the rest of
 * the list fills in under it when odds has sent it. Without `added`, what was not in the list before is marked new.
 */
function openPanel(added) {
  if (!host) build()
  panelEl().dataset.open = "true"
  const list = listEl()
  let first = null
  if (added && added.id) {
    first = card({ link: `${ODDS_SITE}/job/${added.id}`, status: "saved", ...added }, true)
    list.replaceChildren(first)
  } else if (list.children.length === 0) list.replaceChildren(element("div", "skeleton"), element("div", "skeleton"), element("div", "skeleton"))
  chrome.runtime.sendMessage({ type: "pool" }, (answer) => {
    if (chrome.runtime.lastError || !answer) return message("odds did not answer.")
    if (answer.status === "connect") return message("Connect odds from the extension's icon to see your jobs here.")
    if (answer.status !== "ok") return message(answer.message || "Could not load your jobs.")
    if (answer.jobs.length === 0 && !first) return message("Nothing saved yet. Press the odds button on a job.")
    const newOnes = new Set(answer.jobs.filter((j) => !first && seen.size > 0 && !seen.has(j.id)).map((j) => j.id))
    // The card that already jumped in stays as it is (no second animation); the others are drawn under it.
    const cards = answer.jobs.map((j) => (first && added && j.id === added.id ? first : card(j, newOnes.has(j.id))))
    if (first && !answer.jobs.some((j) => j.id === added.id)) cards.unshift(first)
    list.replaceChildren(...cards)
    seen = new Set(answer.jobs.map((j) => j.id))
    setCount(Math.max(answer.total ?? answer.jobs.length, cards.length), Boolean(first) || newOnes.size > 0)
    list.scrollTo({ top: 0, behavior: "smooth" })
  })
}

function closePanel() {
  if (host) panelEl().dataset.open = "false"
}

function togglePanel() {
  if (host && panelEl().dataset.open === "true") closePanel()
  else openPanel()
}
