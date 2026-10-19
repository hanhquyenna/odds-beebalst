// The odds panel on a LinkedIn job page: the odds app itself, in a column on the right (extension/panel.html frames it). It slides in when a job is
// added and the job drops in over it; the odds button shows and hides it. The page is built the first time it is wanted.
let panelFrame = null
let panelLoaded = false
let panelLoadedAt = 0
let panelWaiting = null
const PANEL_ORIGIN = new URL(chrome.runtime.getURL("panel.html")).origin

function tellPanel(job) {
  panelFrame.contentWindow.postMessage({ source: "odds-content", type: "added", job }, PANEL_ORIGIN)
}

let panelAsked = false
/** While Odds fills a page the frame is inert: it shows what is happening but cannot take the keyboard or the mouse from the page Odds is typing into. */
let panelBusy = false
function setPanelBusy(busy) {
  panelBusy = Boolean(busy)
  if (panelFrame) panelFrame.inert = panelBusy
}

/** Builds the panel the first time it is wanted: the background first allows the odds site to be framed in this tab, then the frame is made. */
function ensurePanel(then) {
  if (panelFrame) return then()
  if (panelAsked) return
  panelAsked = true
  chrome.runtime.sendMessage({ type: "panel" }, () => {
    panelFrame = document.createElement("iframe")
    panelFrame.id = "odds-panel-frame"
    panelFrame.title = "odds"
    // Opening the panel by itself (an application is running) must not take the keyboard from the page Odds is typing into: the page's
    // focus is given back when the frame has loaded.
    const kept = document.activeElement
    const giveBack = () => {
      try { panelFrame.blur(); window.focus(); if (kept && kept !== document.body && kept.isConnected && typeof kept.focus === "function") kept.focus({ preventScroll: true }) } catch { /* the page may have changed */ }
    }
    panelFrame.addEventListener("load", () => {
      giveBack()
      window.setTimeout(giveBack, 400)
      window.setTimeout(giveBack, 1200)
      panelLoaded = true
      panelLoadedAt = Date.now()
      if (panelWaiting) {
        tellPanel(panelWaiting)
        panelWaiting = null
      }
    })
    panelFrame.inert = panelBusy
    panelFrame.src = chrome.runtime.getURL("panel.html")
    document.documentElement.append(panelFrame)
    window.addEventListener("message", (event) => {
      if (event.source === panelFrame.contentWindow && event.origin === PANEL_ORIGIN && event.data && event.data.source === "odds-panel" && event.data.type === "close") closePanel()
    })
    then()
  })
}

/** Shows the panel. `added` is the job just added ({ id, title, company, city, chance_pct }): it drops in and its page opens in the app. */
function openPanel(added) {
  // The browser's side panel is already open: it is the panel, the page draws no second one (the job just added goes to it).
  chrome.runtime.sendMessage({ type: "native-panel-open" }, (answer) => {
    if (!chrome.runtime.lastError && answer && answer.open) {
      document.documentElement.dataset.oddsPanel = "side"
      if (added && (added.id || added.pending)) chrome.runtime.sendMessage({ type: "panel-added", job: added }, () => void chrome.runtime.lastError)
      return
    }
    openPanelInPage(added)
  })
}

function openPanelInPage(added) {
  // Opened on purpose (the mascot, a badge press): the next page may open it by itself again.
  if (added !== undefined || document.documentElement.dataset.oddsPanel !== "open") try { sessionStorage.removeItem("odds-panel-closed") } catch { /* ignore */ }
  if (added && (added.id || added.pending)) panelWaiting = added
  ensurePanel(() => {
    // Set on the next frame so the slide in is seen the first time too.
    window.requestAnimationFrame(() => {
      panelFrame.dataset.open = "true"
      document.documentElement.dataset.oddsPanel = "open"
    })
    if (panelWaiting && panelLoaded) {
      tellPanel(panelWaiting)
      panelWaiting = null
    }
  })
}

/** The person closed the panel on this tab: the application never opens it again by itself here (they can open it with the mascot). */
const PANEL_CLOSED_KEY = "odds-panel-closed"
function closePanel() {
  if (panelFrame) panelFrame.dataset.open = "false"
  delete document.documentElement.dataset.oddsPanel
  try { sessionStorage.setItem(PANEL_CLOSED_KEY, "1") } catch { /* private mode: it may open again on the next page */ }
}

/** An application is running in this tab: the panel opens by itself, once per page, unless the person closed it. A page's own frame needs no click, unlike Chrome's side panel. */
let panelAutoTried = false
function autoOpenPanel() {
  if (panelAutoTried || window !== window.top) return
  panelAutoTried = true
  try { if (sessionStorage.getItem(PANEL_CLOSED_KEY)) return } catch { /* no storage: open it */ }
  openPanel()
}

function togglePanel() {
  if (panelFrame && panelFrame.dataset.open === "true") closePanel()
  else openPanel()
}

/** Resolves once a panel that is opening has loaded and settled (so it cannot take the keyboard while Odds types), or after `maxMs`; at once when no panel is opening. */
function panelReady(maxMs = 2500) {
  if (!panelFrame && !panelAsked) return Promise.resolve()
  return new Promise((resolve) => {
    const began = Date.now()
    const tick = () => {
      if ((panelLoaded && Date.now() - panelLoadedAt > 900) || Date.now() - began > maxMs) resolve()
      else window.setTimeout(tick, 100)
    }
    tick()
  })
}
