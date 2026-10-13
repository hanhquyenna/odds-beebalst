const line = document.getElementById("line")
const main = document.getElementById("main")
const jobs = document.getElementById("jobs")
const off = document.getElementById("off")

function show(connected) {
  main.hidden = false
  off.hidden = !connected
  jobs.hidden = !connected
  if (connected) {
    line.textContent = "Connected. On a LinkedIn job, odds shows your interview chance beside Save. Press it to keep the job."
    main.textContent = "Open odds"
    main.onclick = () => chrome.tabs.create({ url: "https://odds.beeblast.co" })
  } else {
    line.textContent = "Connect to see your interview chance and keep jobs in odds."
    main.textContent = "Connect odds"
    main.onclick = () => chrome.runtime.sendMessage({ type: "open-connect" }, () => window.close())
  }
}

/** Opens the odds panel on the LinkedIn tab in front; on any other tab it opens odds itself. */
jobs.onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  chrome.tabs.sendMessage(tab?.id ?? -1, { type: "toggle-panel" }, () => {
    if (chrome.runtime.lastError) chrome.tabs.create({ url: "https://odds.beeblast.co" })
    window.close()
  })
}

chrome.runtime.sendMessage({ type: "status" }, (answer) => show(Boolean(answer?.connected)))
off.onclick = () => chrome.runtime.sendMessage({ type: "disconnect" }, () => show(false))
