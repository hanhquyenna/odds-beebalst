// Runs on odds.beeblast.co only. Lets the odds page and the extension find each other, and carries the key from the page to the extension.
// The page sends the key only after the person is signed in and taps Allow on /connect/extension.
const KEY_FORMAT = /^oddsx_[0-9a-f]{48}$/

function announce(type) {
  window.postMessage({ source: "odds-extension", type }, window.location.origin)
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return
  const data = event.data
  if (!data || data.source !== "odds-site") return
  if (data.type === "ping") announce("present")
  if (data.type === "prepare-application" && typeof data.url === "string" && /^https:\/\//.test(data.url) && typeof data.requestId === "string") {
    chrome.runtime.sendMessage({ type: "apply-in-tab", url: data.url, newTab: true }, answer => {
      const error = chrome.runtime.lastError
      window.postMessage({ source: "odds-extension", type: "application-started", requestId: data.requestId, ok: !error && answer?.ok === true, message: error ? "Reload the Odds extension and try again." : answer?.message }, location.origin)
    })
  }
  if (data.type === "key" && typeof data.key === "string" && KEY_FORMAT.test(data.key)) {
    chrome.runtime.sendMessage({ type: "set-key", key: data.key }, (answer) => announce(answer?.connected ? "connected" : "failed"))
  }
})
announce("present")
