const line = document.getElementById("line")
const main = document.getElementById("main")
const site = document.getElementById("site")
const off = document.getElementById("off")

function show(connected) {
  main.hidden = false
  off.hidden = !connected
  site.hidden = !connected
  if (connected) {
    line.textContent = "Connected. On a LinkedIn job, odds shows your interview chance beside Save. Open odds here for all your jobs, on any page."
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
