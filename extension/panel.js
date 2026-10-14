// The odds panel on a LinkedIn job page: the odds app itself, in a column on the right (extension/panel.html frames it). It slides in when a job is
// added and the job drops in over it; the odds button shows and hides it. The page is built the first time it is wanted.
let panelFrame = null
let panelLoaded = false
let panelWaiting = null
const PANEL_ORIGIN = new URL(chrome.runtime.getURL("panel.html")).origin

function tellPanel(job) {
  panelFrame.contentWindow.postMessage({ source: "odds-content", type: "added", job }, PANEL_ORIGIN)
}

let panelAsked = false

/** Builds the panel the first time it is wanted: the background first allows the odds site to be framed in this tab, then the frame is made. */
function ensurePanel(then) {
  if (panelFrame) return then()
  if (panelAsked) return
  panelAsked = true
  chrome.runtime.sendMessage({ type: "panel" }, () => {
    panelFrame = document.createElement("iframe")
    panelFrame.id = "odds-panel-frame"
    panelFrame.title = "odds"
    panelFrame.addEventListener("load", () => {
      panelLoaded = true
      if (panelWaiting) {
        tellPanel(panelWaiting)
        panelWaiting = null
      }
    })
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

function closePanel() {
  if (panelFrame) panelFrame.dataset.open = "false"
  delete document.documentElement.dataset.oddsPanel
}

function togglePanel() {
  if (panelFrame && panelFrame.dataset.open === "true") closePanel()
  else openPanel()
}
