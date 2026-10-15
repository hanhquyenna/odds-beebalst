// Runs on odds.beeblast.co only. Lets the odds page and the extension find each other, and carries the key from the page to the extension.
// The page sends the key only after the person is signed in and taps Allow on /connect/extension.
const KEY_FORMAT = /^oddsx_[0-9a-f]{48}$/

function announce(type, extra = {}) {
  window.postMessage({ source: "odds-extension", type, ...extra }, window.location.origin)
}

function announcePresent() {
  chrome.runtime.sendMessage({ type: "status" }, (answer) => {
    if (chrome.runtime.lastError) {
      announce("present", { linked: false, boards: {} })
      return
    }
    announce("present", {
      linked: answer?.connected === true,
      boards: answer?.boards && typeof answer.boards === "object" ? answer.boards : {},
    })
  })
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return
  const data = event.data
  if (!data || data.source !== "odds-site") return
  if (data.type === "ping") announcePresent()
  if (data.type === "prepare-application" && typeof data.url === "string" && /^https:\/\//.test(data.url) && typeof data.requestId === "string") {
    const reveal = data.reveal === true
    const postingId = typeof data.postingId === "string" ? data.postingId : null
    chrome.runtime.sendMessage({ type: "apply-in-tab", url: data.url, newTab: true, reveal, postingId }, answer => {
      const error = chrome.runtime.lastError
      window.postMessage({ source: "odds-extension", type: "application-started", requestId: data.requestId,
        ok: !error && answer?.ok === true,
        message: error ? "Odds could not reach Chrome. Reconnect on Connect and try again." : answer?.message,
      }, location.origin)
    })
  }
  // The button on the site asking how a job's application is going, the same question the side panel asks.
  if (data.type === "application-status" && typeof data.url === "string" && /^https:\/\//.test(data.url)) {
    chrome.runtime.sendMessage({ type: "application-status", url: data.url, postingId: typeof data.postingId === "string" ? data.postingId : null }, answer => {
      if (chrome.runtime.lastError) return
      window.postMessage({ source: "odds-extension", type: "application-status", url: data.url, state: answer?.state || null }, location.origin)
    })
  }
  if (data.type === "application-statuses") {
    chrome.runtime.sendMessage({ type: "application-statuses" }, answer => {
      if (chrome.runtime.lastError) return
      window.postMessage({ source: "odds-extension", type: "apply-activity-sync", runs: Array.isArray(answer?.runs) ? answer.runs : [] }, location.origin)
    })
  }
  if (data.type === "key" && typeof data.key === "string" && KEY_FORMAT.test(data.key)) {
    chrome.runtime.sendMessage({ type: "set-key", key: data.key }, (answer) =>
      announce(answer?.connected ? "connected" : "failed", { linked: answer?.connected === true }))
  }
})
announcePresent()
// Keep tracker chips in sync even when job detail (OddsApply) is closed.
setInterval(() => {
  chrome.runtime.sendMessage({ type: "application-statuses" }, (answer) => {
    if (chrome.runtime.lastError || !Array.isArray(answer?.runs)) return
    window.postMessage({ source: "odds-extension", type: "apply-activity-sync", runs: answer.runs }, location.origin)
  })
}, 2000)
