// The Odds mark in the bottom right corner of every page while the extension is on. A click opens the panel.
// While Odds works on a page a coloured bar opens beside the mark with one plain sentence, and closes when the work is over.
// Everything is drawn inside a shadow root, so the site's own CSS cannot reach it. The words shown here are plain on purpose:
// `plain()` turns the longer lines the fill code speaks into short ones and never shows the name of the engine behind Odds.
;(() => {
  if (globalThis.oddsMascot) return

  const TONES = {
    filling: { bg: "#EE7A2A", fg: "#1C1A18" },
    ask: { bg: "#F7C948", fg: "#1C1A18" },
    done: { bg: "#1F7A4D", fg: "#FFFFFF" },
    sent: { bg: "#0A66C2", fg: "#FFFFFF" },
    problem: { bg: "#D93A2B", fg: "#FFFFFF" },
  }
  const toneOf = (state, text) => (state === "done" && /^sent\b/i.test(text) ? "sent" : state === "done" ? "done" : state === "ask" ? "ask" : state === "problem" ? "problem" : "filling")

  /** One short, plain sentence for what Odds is doing. */
  function plain(text, state) {
    let t = String(text || "").replace(/\s+/g, " ").trim()
    if (!t) return t
    if (/no longer (takes|accepts|accepting)|job is closed|no longer available/i.test(t)) return "This job is closed"
    if (state === "done" && /^sent\b/i.test(t)) return "Sent. Marked as applied"
    if (state === "done" && /submit|send/i.test(t)) return "Ready to send. Check it and press Submit"
    if (state === "ask" && /(marked|outlined|highlighted) questions?/i.test(t)) return "Answer the highlighted questions"
    t = t.replace(/\bBroods\b:?\s*/gi, "Odds ").replace(/\bodds\b/g, "Odds").replace(/\s+/g, " ").trim().replace(/…$/, "")
    return t.replace(/[.]$/, "")
  }

  const CSS = `
    :host{all:initial}
    *{box-sizing:border-box}
    .wrap{display:flex;align-items:center;height:56px;padding:0;border-radius:999px;background:transparent;color:var(--fg);font:800 15px/1.2 "odds Inter Tight",system-ui,-apple-system,"Segoe UI",sans-serif;transition:background .3s,padding .45s cubic-bezier(.5,0,.3,1)}
    .wrap[data-open="true"]{background:var(--bg);padding:0 22px 0 4px}
    .roll{flex:none;width:56px;height:56px;border:0;padding:0;background:none;cursor:pointer;display:block;transition:transform .2s}
    .wrap[data-open="true"] .roll{width:48px;height:48px}
    .roll:focus-visible{outline:2px solid #EE7A2A;outline-offset:2px;border-radius:50%}
    .wrap:not([data-open="true"]) .roll{filter:drop-shadow(0 4px 8px rgba(28,26,24,.25))}
    .bar{display:grid;grid-template-columns:0fr;transition:grid-template-columns .45s cubic-bezier(.5,0,.3,1)}
    .wrap[data-open="true"] .bar{grid-template-columns:1fr}
    .bar>span{overflow:hidden;white-space:nowrap;min-width:0}
    .msg{display:block;max-width:min(320px,calc(100vw - 150px));overflow:hidden;text-overflow:ellipsis;padding-left:10px}
    @media (prefers-reduced-motion:reduce){.bar,.wrap{transition:none}}
  `
  const mark = () => `<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true" style="display:block"><circle cx="32" cy="32" r="30" fill="#1c1a19"/><circle cx="30" cy="34" r="12" fill="none" stroke="#ffffff" stroke-width="6"/><circle cx="47.5" cy="17" r="6" fill="#f0872a"/></svg>`
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches

  /** A host element in the corner with the mascot (and, when it has words, the bar) drawn inside its shadow root. */
  function make() {
    const host = document.createElement("div")
    host.style.cssText = "all:initial!important;position:fixed!important;right:20px!important;bottom:20px!important;z-index:2147483646!important;display:block!important"
    const root = host.attachShadow({ mode: "open" })
    root.innerHTML = `<style>${CSS}</style><div class="wrap" data-open="false"><button class="roll" type="button" aria-label="Open Odds" title="Open Odds">${mark()}</button><div class="bar"><span><span class="msg" role="status"><slot></slot></span></span></div></div>`
    const wrap = root.querySelector(".wrap")
    const roll = root.querySelector(".roll")
    roll.addEventListener("click", () => {
      if (typeof togglePanel === "function") togglePanel()
      else if (typeof openPanel === "function") openPanel()
    })
    const set = (tone, open) => {
      const c = TONES[tone] || TONES.filling
      wrap.style.setProperty("--bg", c.bg)
      wrap.style.setProperty("--fg", c.fg)
      wrap.dataset.open = open ? "true" : "false"
    }
    return { host, set }
  }

  // ---- The idle mascot: always in the corner, hidden while a bar of this page is out, and out of the panel's way while it is open.
  let idle = null
  function showIdle() {
    if (idle || window !== top || !document.documentElement || document.contentType !== "text/html") return
    idle = make()
    idle.host.id = "odds-mascot"
    idle.set("filling", false)
    document.documentElement.append(idle.host)
    syncIdle()
  }
  function syncIdle() {
    if (!idle) return
    const panel = document.documentElement.dataset.oddsPanel === "open"
    idle.host.style.setProperty("right", panel ? "404px" : "20px", "important")
    idle.host.style.setProperty("display", bars().length ? "none" : "block", "important")
  }
  const bars = () => [...document.querySelectorAll(".odds-apply-bar[data-odds-mascot]")]

  // ---- The bar: the mascot rolled out to the left with one sentence. The element keeps the class and attributes the fill code and the tests look
  // for (.odds-apply-bar, data-state); the words are its plain text, shown through a slot.
  let current = null
  /** Says `text` in a bar of the right colour; the same bar is reused, so it only rolls out once. Returns the bar element. */
  function bar(text, state = "filling") {
    if (!current?.host.isConnected) {
      document.querySelectorAll(".odds-apply-bar[data-odds-mascot]").forEach((old) => old.remove())
      current = make()
      current.host.className = "odds-apply-bar odds-apply-float"
      current.host.setAttribute("data-odds-mascot", "")
      document.documentElement.append(current.host)
    }
    const shown = plain(text, state)
    const tone = toneOf(state, shown)
    if (current.host.textContent !== shown) current.host.textContent = shown
    current.host.dataset.state = state
    current.host.dataset.tone = tone
    current.set(tone, true)
    const panel = document.documentElement.dataset.oddsPanel === "open"
    current.host.style.setProperty("right", panel ? "404px" : "20px", "important")
    syncIdle()
    return current.host
  }
  /** The bar rolls back into the corner and goes. */
  function clear() {
    const old = current
    current = null
    if (!old) return
    old.set("filling", false)
    window.setTimeout(() => { old.host.remove(); syncIdle() }, reduced() ? 0 : 450)
  }

  globalThis.oddsMascot = { bar, clear, plain, mark, TONES }

  const start = () => {
    showIdle()
    new MutationObserver(syncIdle).observe(document.documentElement, { attributes: true, attributeFilter: ["data-odds-panel"], childList: true })
  }
  if (document.documentElement) start()
})()
