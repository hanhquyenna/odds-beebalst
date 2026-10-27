const line = document.getElementById("line")
const main = document.getElementById("main")
const site = document.getElementById("site")
const off = document.getElementById("off")
const fill = document.getElementById("fill")
const fillnote = document.getElementById("fillnote")

function show(connected) {
  main.hidden = false
  off.hidden = !connected
  site.hidden = !connected
  fill.hidden = fillnote.hidden = !connected
  if (connected) {
    line.textContent = "Connected. Odds shows your interview chance beside jobs on LinkedIn, Indeed, Glassdoor, Magnet.me and employers' job pages, beside Save. Click a percentage to keep that job here."
    main.textContent = "Open odds in the side panel"
    main.onclick = openSidePanel
  } else {
    line.textContent = "Connect to see your interview chance and keep jobs in odds."
    main.textContent = "Connect odds"
    main.onclick = () => chrome.runtime.sendMessage({ type: "open-connect" }, () => window.close())
  }
}

/** The odds app in the browser's own side panel, on whatever page is in front, signed in. */
async function openSidePanel() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || typeof tab.id !== "number" || !chrome.sidePanel) {
    chrome.tabs.create({ url: "https://odds.beeblast.co" })
    return window.close()
  }
  await chrome.runtime.sendMessage({ type: "allow-tab", tabId: tab.id })
  try {
    await chrome.sidePanel.open({ tabId: tab.id })
  } catch {
    chrome.tabs.create({ url: "https://odds.beeblast.co" })
  }
  window.close()
}

site.onclick = () => chrome.tabs.create({ url: "https://odds.beeblast.co" })
chrome.runtime.sendMessage({ type: "status" }, (answer) => show(Boolean(answer?.connected)))
off.onclick = () => chrome.runtime.sendMessage({ type: "disconnect" }, () => show(false))

/** Fill with Odds on the page in front: Odds fills the application to the end in the background; the job and its status show in odds. */
fill.onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || typeof tab.id !== "number" || !/^https:/.test(tab.url || "")) { fillnote.textContent = "Open the application form in this tab first."; return }
  fill.disabled = true
  fill.textContent = "Filling…"
  chrome.runtime.sendMessage({ type: "fill-tab", tabId: tab.id }, (res) => {
    if (res?.ok) { fillnote.textContent = "Odds is filling this application. Follow it on the page or in odds."; setTimeout(() => window.close(), 1200) }
    else { fill.disabled = false; fill.textContent = "Fill with Odds"; fillnote.textContent = "Odds could not reach this page. Reload the page and try again." }
  })
}
