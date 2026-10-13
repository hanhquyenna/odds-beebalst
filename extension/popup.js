const line = document.getElementById("line")
const main = document.getElementById("main")
const off = document.getElementById("off")

function show(connected) {
  main.hidden = false
  off.hidden = !connected
  if (connected) {
    line.textContent = "Connected. Open a job on LinkedIn and press Add to odds."
    main.textContent = "Open odds"
    main.onclick = () => chrome.tabs.create({ url: "https://odds.beeblast.co" })
  } else {
    line.textContent = "Connect to see your interview chance and keep jobs in odds."
    main.textContent = "Connect odds"
    main.onclick = () => chrome.runtime.sendMessage({ type: "open-connect" }, () => window.close())
  }
}

chrome.runtime.sendMessage({ type: "status" }, (answer) => show(Boolean(answer?.connected)))
off.onclick = () => chrome.runtime.sendMessage({ type: "disconnect" }, () => show(false))
