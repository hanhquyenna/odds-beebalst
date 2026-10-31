// Runs on job pages: LinkedIn, Indeed, Glassdoor, Magnet.me, AcademicTransfer, employers' own job boards, and any page that says it is a job.
// One quiet button beside the open job's Save shows the person's interview chance for it, and a badge beside each job in a list does the same.
// Pressing either views the job without saving it and slides the odds panel in (panel.js). A job odds does not hold yet is read first: a LinkedIn job by odds
// itself (only its address is sent), a job anywhere else from its own page as the person's browser shows it, so odds holds it for everyone.
// What each site's pages look like is in site-dom.js; which addresses are jobs, in job-sites.js.
const PAGE = globalThis.oddsPage
const SITE = PAGE.site

let button = null
let panelSelection = 0
/** The job the button is showing: its id and address, and what odds said about it. */
let current = { id: "", url: "", phase: "peeking", chance: null, saved: false, known: false, closed: false, needsProfile: false }

function draw(state, label, title, note) {
  if (!button) return
  button.dataset.state = state
  button.dataset.kind = /%$/.test(label) ? "chance" : "plain"
  button.replaceChildren()
  const text = document.createElement("span")
  text.className = "odds-text"
  text.textContent = label
  button.append(text)
  if (note) {
    const bubble = document.createElement("span")
    bubble.className = "odds-note"
    bubble.textContent = note
    button.append(bubble)
  }
  button.title = title
  button.setAttribute("aria-label", title)
}

// Same rule as the app (point in engine.ts): from 9.5% up a whole number, below it one decimal, so a badge and the panel never disagree.
const shownPct = (n) => (n >= 9.5 ? `${Math.round(n)}%` : `${(Math.round(n * 10) / 10).toFixed(1)}%`)
const percent = (n) => (typeof n === "number" ? shownPct(n) : "Check")

/** The side panel's figure for this page, until the open job changes. Same rounding as the panel ring. */
let panelChance = null
function chanceFor(url, serverPct) {
  if (panelChance && panelChance.url === url && typeof panelChance.pct === "number") return panelChance.pct
  return serverPct
}
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "odds-chance" || typeof message.pct !== "number") return
  const url = typeof message.url === "string" ? message.url : current.url
  panelChance = { url, pct: message.pct }
  if (!message.url || current.url === url) {
    current = { ...current, chance: message.pct, ...(current.phase === "peeking" ? { phase: "ready", known: true } : {}) }
    show()
  }
  for (const [id, held] of cardJobs) {
    if (held?.job?.url !== url) continue
    const prev = cardResults.get(id) || {}
    cardResult(id, { ...prev, status: "ok", known: true, chance_pct: message.pct, loading: false })
  }
})

/** Draws the button for whatever is known about the open job. */
function show() {
  if (!button) return
  const c = current
  if (c.phase === "peeking" || c.phase === "adding") return draw("busy", "…", "Looking up your chance for this job")
  if (c.phase === "connect") return draw("problem", "Connect", "Connect odds to see your interview chance here")
  if (c.phase === "error") return draw("problem", "Retry", "Try again", c.message || "odds did not answer.")
  if (c.closed) return draw("idle", "Closed", "This job is closed")
  if (c.needsProfile) return draw("idle", "Add CV", "Import your LinkedIn profile or add a CV in Odds to calculate your interview chance")
  if (c.saved) return draw("done", percent(c.chance), "Estimated interview chance. Open this job in the side panel", c.needsProfile ? "Add your CV on odds to see your chance." : null)
  if (!c.known) return draw("idle", "Check", "odds does not have this job yet. Open the job details while Odds reads this job")
  draw("idle", percent(c.chance), `Your interview chance for this job is ${percent(c.chance)}. Open this job in the side panel`, c.needsProfile ? "Add your CV on odds to see your chance." : null)
}

const ask = (message) => new Promise((resolve) => chrome.runtime.sendMessage(message, (answer) => resolve(chrome.runtime.lastError ? null : answer)))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The job at `url` as its page shows it, for a site whose pages odds reads in the browser: the open job from this page; a job in the list from its
 * own page on this site (the person's own session, as if they opened it); or, where that page turns scripts away, opened beside the list and read
 * from there. Null when it cannot be read.
 */
async function readJob(job, card) {
  if (!SITE.readable) return null
  // A site with a page of its own for each job, made to be read (LinkedIn's public job pages).
  if (SITE.remote) {
    try {
      return await SITE.remote(job)
    } catch {
      return null
    }
  }
  const open = SITE.open()
  if (open && open.id === job.id) {
    const here = PAGE.pagePosting() || SITE.read?.()
    if (here) return here
  }
  if (SITE.fetchable && new URL(job.url).hostname === location.hostname) {
    try {
      const res = await fetch(job.url, { credentials: "include", signal: AbortSignal.timeout(15000) })
      if (res.ok) {
        const found = PAGE.postingOf(new DOMParser().parseFromString(await res.text(), "text/html"))
        if (found) return found
      }
    } catch {
      // not answered: try the next way
    }
  }
  if (card && SITE.select) {
    SITE.select(card)
    for (let waited = 0; waited < 8000; waited += 250) {
      await sleep(250)
      if (SITE.open()?.id !== job.id) continue
      const shown = PAGE.pagePosting() || SITE.read?.()
      if (shown) return shown
    }
  }
  return null
}

/** The person's chance for a job: free when odds holds it; else, where the page can be read, read now so odds holds it for everyone (not saved for them). */
const inspecting = new Map()
function chanceOf(job, card) {
  if (!inspecting.has(job.url)) inspecting.set(job.url, readChanceOf(job, card).finally(() => inspecting.delete(job.url)))
  return inspecting.get(job.url)
}
async function readChanceOf(job, card) {
  const answer = await ask({ type: "lookup", url: job.url })
  if (!answer || answer.status !== "ok" || answer.known !== false || !SITE.readable) return answer
  return readAndKeep(job, card, answer)
}

/** A job odds does not hold, read now so odds holds it for everyone (not saved for the person); `answer` is what to show when it cannot be read. */
const reading = new Map()
function readAndKeep(job, card, answer) {
  if (!reading.has(job.url)) reading.set(job.url, enrichJob(job, card, answer).finally(() => reading.delete(job.url)))
  return reading.get(job.url)
}
async function enrichJob(job, card, answer) {
  const posting = await readJob(job, card)
  // Not readable here: a LinkedIn job is still read by odds itself; elsewhere it waits for a press.
  if (!posting && !SITE.remote) return answer
  const read = await ask(posting ? { type: "analyze", url: job.url, posting } : { type: "analyze", url: job.url })
  if (read && ["added", "exists"].includes(read.status)) return { ...read, status: "ok", known: true }
  if (read?.status === "closed") return { status: "ok", known: true, closed: true }
  // Why it was not read (the day's allowance, odds not answering), said instead of a percentage.
  if (read?.status === "connect") return read
  return read?.message && read.status !== "unreadable" ? { status: "error", message: read.message } : answer
}

function peek(job) {
  current = { id: job.id, url: job.url, phase: "peeking", chance: null, saved: false, known: false, closed: false, needsProfile: false }
  show()
  chanceOf(job).then(answer => receiveChance(job, answer))
}

function receiveChance(job, answer) {
    // Pressed while it was being looked up: the press's own answer is the one shown.
    if (current.id !== job.id || current.url !== job.url || current.phase !== "peeking") return
    if (!answer) current = { ...current, phase: "error" }
    else if (answer.status === "connect") current = { ...current, phase: "connect" }
    else if (answer.status !== "ok") current = { ...current, phase: "error", message: answer.message }
    else current = { ...current, phase: "ready", known: Boolean(answer.known), closed: Boolean(answer.closed), saved: Boolean(answer.saved), chance: chanceFor(job.url, typeof answer.chance_pct === "number" ? answer.chance_pct : null), needsProfile: Boolean(answer.needs_profile), job: answer.job || (answer.id ? { id: answer.id } : null) }
    show()
}

/** Opens the browser's side panel on this tab (inside the press, which is what Chrome requires); where it cannot, the panel is drawn in the page. */
function showPanel(then) {
  chrome.runtime.sendMessage({ type: "open-side-panel" }, (answer) => {
    const native = !chrome.runtime.lastError && Boolean(answer && answer.ok)
    if (native) document.documentElement.dataset.oddsPanel = "side"
    then(native)
  })
}

/** Viewing is separate from saving. A known job is delivered before any network work. */
function inspectJob(job, card, result, update) {
  const selection = ++panelSelection
  const deliver = (native, selected) => {
    if (selection !== panelSelection) return
    if (native) chrome.runtime.sendMessage({ type: "panel-added", job: selected })
    else openPanel(selected)
  }
  showPanel((native) => {
    if (selection !== panelSelection) return
    const held = result?.job || (result?.id ? { id: result.id } : null)
    if (held?.id) return deliver(native, { ...held, chance_pct: result.chance_pct })
    const here = SITE.open()?.id === job.id ? PAGE.pagePosting() || SITE.read?.() : null
    deliver(native, { pending: true, url: job.url, title: here?.title || card?.querySelector("a")?.textContent?.trim() || "Job details", company: here?.company || "" })
    // Join the read already running for the badge; never call the save endpoint.
    chanceOf(job, card).then(answer => {
      if (selection !== panelSelection) return
      update(answer || { status: "error" })
      const resolved = answer?.job || (answer?.id ? { id: answer.id } : null)
      if (resolved?.id) deliver(native, { ...resolved, chance_pct: answer.chance_pct })
      else deliver(native, { pending: true, url: job.url, title: here?.title || "Job details", message: answer?.message || (answer?.closed ? "This job is closed." : "Could not read the full job yet. Try opening its job page and clicking again."), error: true })
    })
  })
}

/** The orange Auto apply pill beside the chance chip (and so beside the site's own buttons): opens the panel and starts the application in this tab. */
let autoPill = null
function placeAuto() {
  if (!button) return
  if (!autoPill) {
    autoPill = document.createElement("div")
    autoPill.id = "odds-auto"
    const root = autoPill.attachShadow({ mode: "open" })
    root.innerHTML = `<style>
      :host{all:initial;display:inline-flex;flex:none;align-self:center;vertical-align:middle;margin-left:var(--odds-gap,8px)}
      :host([data-where="stack"]){display:inline-flex;width:auto;min-width:160px;margin:var(--odds-mt,12px) 0 0;vertical-align:middle}
      :host([data-where="float"]){position:fixed;right:24px;bottom:144px;z-index:2147483645;margin:0}
      button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;height:max(40px,var(--odds-h,32px));padding:0 18px 0 7px;border:0;border-radius:var(--odds-r,999px);background:#EE7A2A;color:#1C1A18;font:800 var(--odds-fs,15px)/1 "odds Inter Tight",system-ui,-apple-system,"Segoe UI",sans-serif;white-space:nowrap;cursor:pointer}
      button:hover{background:#F28B45}
      button:focus-visible{outline:2px solid #1C1A18;outline-offset:2px}
      button:disabled{opacity:.7;cursor:default}
      i{display:block;width:26px;height:26px}
      @keyframes blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
      @keyframes hop{0%,100%{transform:translate(0,0)}50%{transform:translate(1px,-3px)}}
      .lid{transform-origin:15px 17px;animation:blink 3.4s infinite}
      .orb{animation:hop 1.6s ease-in-out infinite}
      @media (prefers-reduced-motion:reduce){.lid,.orb{animation:none}}
    </style><button type="button" title="Odds fills in the application for you"><i>${globalThis.oddsMascot?.mark("#EE7A2A") || ""}</i><span>Auto apply</span></button>`
    // The odds mark comes from mascot.js; if the page script ran first, it is put in as soon as it is there.
    if (!globalThis.oddsMascot) {
      let tries = 0
      const fill = window.setInterval(() => {
        const icon = root.querySelector("i")
        if (globalThis.oddsMascot && icon) { icon.innerHTML = globalThis.oddsMascot.mark("#EE7A2A"); window.clearInterval(fill) }
        else if (++tries > 20) window.clearInterval(fill)
      }, 250)
    }
    root.querySelector("button").addEventListener("click", () => {
      openPanel()
      const c = current
      chrome.runtime.sendMessage({ type: "auto-apply", url: c.url }, () => void chrome.runtime.lastError)
    })
  }
  const closed = current.closed
  // Floating in a corner with nothing of the site to sit beside, it only repeats the mascot and the panel: not shown.
  autoPill.hidden = closed || button.dataset.where === "float"
  autoPill.dataset.where = button.dataset.where || "inline"
  if (button.dataset.where === "float") autoPill.dataset.where = "float"
  for (const prop of ["--odds-h", "--odds-r", "--odds-fs", "--odds-gap", "--odds-w", "--odds-mt"]) {
    const value = button.style.getPropertyValue(prop)
    if (value) autoPill.style.setProperty(prop, value)
    else autoPill.style.removeProperty(prop)
  }
  if (autoPill.previousElementSibling !== button || autoPill.parentElement !== button.parentElement) button.after(autoPill)
}

function press() {
  const c = current
  if (c.phase === "connect") return chrome.runtime.sendMessage({ type: "open-connect" })
  if (c.needsProfile) return chrome.runtime.sendMessage({ type: "open-profile" })
  inspectJob({ id: c.id, url: c.url }, null, { job: c.job, chance_pct: c.chance }, answer => {
    if (current.id !== c.id) return
    current = { ...current, phase: answer.status === "ok" ? "ready" : "error", known: Boolean(answer.known), saved: Boolean(answer.saved), closed: Boolean(answer.closed), chance: answer.chance_pct ?? null, job: answer.job || (answer.id ? { id: answer.id } : null), message: answer.message }
    show()
  })
}

/**
 * The size and shape of the site's own button beside odds: its height, its corners (a pill beside a pill, a rounded square beside a rounded square)
 * and its lettering, within limits that keep it readable; `row` is the row odds joins, whose own gap spaces it. `small` is for a badge in a list, kept compact whatever the site does. Measured while
 * odds is not in its row, so a row that stretches its buttons to the tallest one cannot make odds measure itself. Null when there is no button.
 */
function measure(beside, small, own, row = beside?.parentElement) {
  if (!beside) return null
  const hidden = own && own.isConnected && own.style.display !== "none"
  if (hidden) own.style.display = "none"
  const box = beside.getBoundingClientRect()
  const style = getComputedStyle(beside)
  const line = row && getComputedStyle(row)
  if (hidden) own.style.removeProperty("display")
  if (box.height < 16) return null
  const height = Math.round(Math.min(small ? 32 : 48, Math.max(small ? 24 : 28, box.height)))
  // A bare icon (no fill, no outline: Indeed's bookmark) has no shape to match: odds keeps its own pill beside it.
  const drawn = parseFloat(style.borderTopWidth) > 0 || !/^(transparent|rgba\(.*,\s*0\))$/.test(style.backgroundColor) || style.boxShadow !== "none"
  const corner = drawn ? parseFloat(style.borderTopLeftRadius) || 0 : Infinity
  const gap = line && /flex|grid/.test(line.display) ? parseFloat(line.columnGap) || 0 : 0
  // Buttons stacked as full-width rows (Magnet.me's Apply over Like): odds is one more row, as wide, as far below as they are from each other.
  const stacked = !small && line && box.width >= 150 && (/^(block|list-item)$/.test(line.display) || (/flex/.test(line.display) && /column/.test(line.flexDirection))) && /^(block|flex|grid)$/.test(style.display)
  return {
    stacked,
    "--odds-w": `${Math.round(box.width)}px`,
    "--odds-mt": "12px",
    "--odds-h": `${height}px`,
    "--odds-r": corner >= box.height / 2 - 1 ? "999px" : `${Math.round(Math.min(corner, height / 2))}px`,
    "--odds-fs": `${Math.min(small ? 13 : 16, Math.max(12, parseFloat(style.fontSize) || 14))}px`,
    "--odds-gap": gap > 0 ? "0px" : "8px",
    // A badge in a row that spaces its own items (a flex row with a gap) takes no margin of its own.
    "--odds-m": gap > 0 ? "0px" : "4px 8px 4px 0",
  }
}

/** Lines odds up with the middle of the site's button beside it, where the row puts it higher or lower (a button at the top of a taller box). */
function level(el, beside) {
  el.style.removeProperty("top")
  if (!beside || !el.isConnected) return
  const own = el.getBoundingClientRect()
  const other = beside.getBoundingClientRect()
  if (!own.height || !other.height) return
  const off = Math.round(other.top + other.height / 2 - (own.top + own.height / 2))
  if (off !== 0 && Math.abs(off) <= 24) el.style.top = `${off}px`
}

/** Gives odds a measured size, or its own when there is nothing to match. */
function fit(el, size) {
  for (const prop of ["--odds-h", "--odds-r", "--odds-fs", "--odds-gap", "--odds-m", "--odds-w", "--odds-mt"]) {
    if (size) el.style.setProperty(prop, size[prop])
    else el.style.removeProperty(prop)
  }
}

/** Puts the button next to Save when there is one, else floating; moves it again when the site redraws the page. */
function place() {
  const save = SITE.save()
  let anchor = save
  // Sites wrap each button in a div of its own: go up to the one that sits in the row beside Apply, and join that row.
  while (anchor && anchor.parentElement && anchor.parentElement.children.length === 1 && anchor.parentElement !== document.body) anchor = anchor.parentElement
  const parent = anchor ? anchor.parentElement : document.documentElement
  const where = anchor ? "inline" : "float"
  if (button.parentElement !== parent || (button.dataset.where === "float") !== (where === "float") || (anchor && anchor.nextElementSibling !== button) || placedBeside !== save) {
    button.dataset.where = where
    placedBeside = save
    // Measured before odds joins the row (or with odds hidden when it is already there), then placed.
    const size = where === "inline" ? measure(save, false, button, parent) : null
    if (size?.stacked) {
      button.dataset.where = "stack"
      // The space between the rows above it: the row of Save (anchor, maybe a wrapper) and the one before that.
      const above = anchor.previousElementSibling?.getBoundingClientRect()
      const own = anchor.getBoundingClientRect()
      if (above && above.bottom <= own.top) size["--odds-mt"] = `${Math.round(Math.min(24, own.top - above.bottom))}px`
    }
    fit(button, size)
    if (anchor) anchor.after(button)
    else parent.append(button)
    if (where === "inline" && !size?.stacked) level(button, save)
  }
}
/** The site's button odds was last sized against: sized again only when it changes, not on every redraw of the page. */
let placedBeside = null

let waiting = 0

function sync() {
  const job = SITE.open()
  if (!job) {
    button?.remove()
    autoPill?.remove()
    button = null
    current = { ...current, id: "", url: "" }
    return
  }
  if (!button) {
    button = document.createElement("button")
    button.id = "odds-add"
    button.type = "button"
    button.onclick = press
    document.documentElement.append(button)
    // Odds may be framed in this tab from now on (the side panel needs it), so the first press has nothing left to wait for.
    chrome.runtime.sendMessage({ type: "allow-frame" }, () => void chrome.runtime.lastError)
  }
  place()
  placeAuto()
  // Another job opened in the same page (job sites do not reload): look it up, after a short pause so flicking through a list asks once.
  if (current.id !== job.id) {
    const firstJob = !current.id
    if (panelChance && panelChance.url !== job.url) panelChance = null
    current = { id: job.id, url: job.url, phase: "peeking", chance: chanceFor(job.url, null), saved: false, known: false, closed: false, needsProfile: false }
    show()
    window.clearTimeout(waiting)
    waiting = window.setTimeout(() => {
      // Pressed in the meantime: the press is adding it already.
      if (current.id === job.id && current.phase === "peeking") peek(job)
    }, firstJob ? 0 : 120)
    // Cached scores need no navigation debounce and never cause an API request.
    ask({ type: "lookup-cached", url: job.url }).then(answer => { if (answer) receiveChance(job, answer) })
  }
}

// Badges beside the jobs in a list. A badge belongs to a job id, not a place in the page: sites reuse their cards while scrolling.
const cardResults = new Map()
const cardJobs = new Map()
const cardQueue = []
let cardRequests = 0
/** At most this many jobs in a list are read from their own pages at once, a moment apart, so browsing a list stays an ordinary visit for the site. */
const READS_AT_ONCE = SITE.readsAtOnce || 3
const READ_PAUSE = 250

function renderCard(badge, result) {
  if (result.loading) {
    if (badge.textContent !== "…") badge.textContent = "…"
    badge.dataset.state = "busy"
    return
  }
  const unknown = result.status === "ok" && result.known === false
  const label = result.needs_profile ? "Add CV" : typeof result.chance_pct === "number" ? shownPct(result.chance_pct) : unknown ? "Check" : "Retry"
  const title = result.needs_profile ? "Import your LinkedIn profile or add a CV in Odds to calculate your interview chance" : typeof result.chance_pct === "number" ? `Your interview chance: ${result.chance_pct}%. Open this job in Odds.` : result.status === "connect" ? "Connect Odds to see your interview chance" : result.closed ? "This job is closed" : unknown ? "Odds does not have this job yet. Open the job details while Odds reads this job." : result.message || "Open this job in Odds"
  const aria = `${label}. ${result.job?.title || "Open this job in Odds"}`
  const state = result.status === "ok" ? "ready" : "problem"
  if (badge.textContent !== label) badge.textContent = label
  if (badge.title !== title) badge.title = title
  if (badge.getAttribute("aria-label") !== aria) badge.setAttribute("aria-label", aria)
  if (badge.dataset.state !== state) badge.dataset.state = state
  const kind = /%$/.test(label) ? "chance" : "plain"
  if (badge.dataset.kind !== kind) badge.dataset.kind = kind
}
function cardResult(id, result) {
  // A look-up that answers after the job was pressed (and is being added) does not undo the press.
  if (cardResults.get(id)?.pressed && !result.pressed && !result.saved && result.status === "ok") return
  cardResults.set(id, result)
  for (const badge of document.querySelectorAll(`.odds-job-chance[data-job-id="${CSS.escape(id)}"]`)) renderCard(badge, result)
}
const watchedCards = new WeakSet()
const visibility = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue
    const id = entry.target.querySelector(".odds-job-chance")?.dataset.jobId
    if (!id || cardResults.has(id)) continue
    cardResults.set(id, { loading: true })
    cardQueue.push(id)
  }
  drainCards()
  // Looked up a screen and a half before they scroll into view, so they are ready by the time they are seen.
}, { rootMargin: "1200px 0px" })
/** Whether jobs in this site's lists are read from their own pages as they come into view (a request to the site each). */
const READS_LIST = SITE.readable && SITE.fetchable
function drainCards() {
  // Every job in view is looked up at once (the background asks odds about them together); only reading the ones odds does not hold is paced.
  while (cardQueue.length) {
    const id = cardQueue.shift()
    const entry = cardJobs.get(id)
    if (!entry) continue
    ask({ type: "lookup", url: entry.job.url }).then((answer) => {
      // A job in a list is read from its own page only where that needs no clicking (opening it beside the list would take over the page).
      if (READS_LIST && answer?.status === "ok" && answer.known === false) {
        readQueue.push([id, answer])
        drainReads()
      } else cardResult(id, answer || { status: "error" })
    })
  }
}
const readQueue = []
function drainReads() {
  while (cardRequests < READS_AT_ONCE && readQueue.length) {
    const [id, answer] = readQueue.shift()
    const entry = cardJobs.get(id)
    if (!entry) continue
    cardRequests++
    readAndKeep(entry.job, null, answer).then((read) => {
      cardResult(id, read || answer)
      setTimeout(() => {
        cardRequests--
        drainReads()
      }, READ_PAUSE)
    })
  }
}
function openCard(id) {
  const result = cardResults.get(id)
  const entry = cardJobs.get(id)
  if (!entry) return
  if (result?.status === "connect") return chrome.runtime.sendMessage({ type: "open-connect" })
  if (result?.needs_profile) return chrome.runtime.sendMessage({ type: "open-profile" })
  inspectJob(entry.job, entry.card, result, answer => cardResult(id, answer))
}

function syncCards() {
  const seen = new Set()
  for (const entry of SITE.cards()) {
    const { id, url, card } = entry
    if (seen.has(id)) continue
    seen.add(id)
    cardJobs.set(id, { job: { id, url }, card })
    let badge = card.querySelector(".odds-job-chance")
    if (badge && badge.dataset.jobId !== id) {
      badge.remove()
      badge = null
    }
    if (!badge) {
      badge = document.createElement("button")
      badge.className = "odds-job-chance"
      badge.type = "button"
      badge.dataset.jobId = id
      badge.textContent = "…"
      badge.setAttribute("aria-label", "Odds interview chance for this job")
      badge.addEventListener("click", (event) => {
        event.preventDefault()
        event.stopPropagation()
        openCard(id)
      })
      const size = measure(entry.save, true, null, entry.row || entry.save?.parentElement)
      entry.put(badge)
      fit(badge, size)
      level(badge, entry.save)
    }
    if (cardResults.has(id) && !cardResults.get(id).loading) renderCard(badge, cardResults.get(id))
    if (!watchedCards.has(card)) {
      watchedCards.add(card)
      visibility.observe(card)
    } else if (!cardResults.has(id)) {
      visibility.unobserve(card)
      visibility.observe(card)
    }
  }
}

// Batch the sites' DOM bursts; visibility is tracked by the browser without forcing layout on scroll.
let scanPending = false
function scheduleScan() {
  if (scanPending) return
  scanPending = true
  setTimeout(() => {
    scanPending = false
    sync()
    syncCards()
  }, 100)
}
new MutationObserver((changes) => {
  if (
    changes.some((change) => {
      if (change.target.closest?.("#odds-add, #odds-auto, .odds-job-chance, #odds-panel-frame")) return false
      if (change.type === "attributes") return change.target.matches?.(SITE.watch)
      return [...change.addedNodes, ...change.removedNodes].some((node) => node.nodeType === 1 && (node.matches?.(SITE.watch + ", button, iframe") || node.querySelector?.(SITE.watch + ", button, iframe")))
    })
  )
    scheduleScan()
}).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "id", "data-job-id", "data-occludable-job-id", "data-jk", "data-jobid"] })
window.addEventListener("popstate", scheduleScan)
sync()
syncCards()
let lastAddress = location.href
setInterval(() => {
  if (location.href === lastAddress) return
  lastAddress = location.href
  scheduleScan()
}, 400)
