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
  const mark = () => `<svg viewBox="0 0 256 256" width="100%" height="100%" fill="none" aria-hidden="true" style="display:block"><path d="M256 128C256 198.692 198.692 256 128 256C57.3076 256 0 198.692 0 128C0 57.3076 57.3076 0 128 0C198.692 0 256 57.3076 256 128Z" fill="#F7F3F3"/><path d="M219.294 119.529C219.294 171.509 177.156 213.647 125.176 213.647C73.1967 213.647 31.0588 171.509 31.0588 119.529C31.0588 67.5495 73.1967 25.4116 125.176 25.4116C177.156 25.4116 219.294 67.5495 219.294 119.529Z" fill="#FF9F1C"/><path d="M132.543 236.644C123.858 236.296 116.37 234.14 110.078 230.174C103.835 226.21 99.0636 220.888 95.7635 214.208C92.5121 207.529 91.0533 200.019 91.387 191.676C91.7304 183.089 93.9336 175.652 97.9968 169.364C102.06 163.076 107.407 158.281 114.039 154.979C120.672 151.629 128.014 150.114 136.064 150.437C145.334 150.808 153.068 152.925 159.266 156.79C165.466 160.605 170.072 165.798 173.083 172.369C176.143 178.942 177.502 186.522 177.158 195.109C176.813 203.745 174.608 211.231 170.542 217.568C166.477 223.904 161.128 228.748 154.495 232.099C147.91 235.451 140.593 236.966 132.543 236.644ZM133.497 218.284C138.522 218.485 142.567 217.547 145.631 215.471C148.743 213.397 151.033 210.532 152.498 206.876C154.013 203.223 154.861 199.128 155.042 194.59C155.2 190.639 154.672 186.732 153.458 182.872C152.293 179.014 150.248 175.78 147.323 173.171C144.446 170.563 140.422 169.156 135.25 168.949C130.274 168.75 126.2 169.809 123.028 172.125C119.908 174.395 117.562 177.453 115.991 181.299C114.469 185.148 113.621 189.243 113.447 193.585C113.287 197.586 113.89 201.446 115.257 205.166C116.623 208.886 118.797 211.953 121.779 214.37C124.81 216.788 128.716 218.092 133.497 218.284Z" fill="black"/><path d="M206.706 22C211.414 22 214.566 23.52 216.162 26.5601C216.721 27.5734 217 28.8401 217 30.3601V80.8464C217 95.0332 213.688 107.121 207.065 117.11C199.165 129.27 187.075 135.35 170.796 135.35C159.704 135.35 150.447 132.455 143.025 126.664C136.482 121.453 132.332 114.793 130.577 106.687H130.098C129.539 117.761 125.988 126.954 119.445 134.264C111.784 142.588 101.49 146.75 88.562 146.75C69.7292 146.75 55.5647 140.489 46.0685 127.967C37.6895 117.037 33.5 102.199 33.5 83.4521V30.3601C33.5 27.3924 34.4975 25.2572 36.4925 23.9543C38.5673 22.6514 41.0012 22 43.7942 22H206.706ZM138.956 48.926C138.956 59.9281 139.195 68.7224 139.674 75.3092C140.392 86.456 143.105 94.6351 147.813 99.8466C152.601 105.058 159.265 107.664 167.803 107.664C176.342 107.664 182.447 104.877 186.117 99.3037C189.868 93.8027 191.743 85.5512 191.743 74.5492V48.926H138.956ZM58.9961 83.235C58.9961 99.159 63.9836 109.727 73.9586 114.938C77.6294 116.893 81.9386 117.87 86.8862 117.87C91.8338 117.87 95.7839 117.254 98.7365 116.024C101.689 114.793 104.203 113.129 106.278 111.03C108.352 108.931 109.988 106.47 111.185 103.647C112.462 100.824 113.46 97.8561 114.178 94.7437C115.295 89.3151 115.854 83.8864 115.854 78.4578C115.854 71.6539 115.654 64.4519 115.255 56.8518L114.896 48.926L58.9961 49.0346V83.235Z" fill="#0A0903"/><path d="M192 53.0235V49.0217H183L192 53.0235Z" fill="#FF9F1C"/><path d="M59 53.0235V49.0217H64L59 53.0235Z" fill="#FF9F1C"/></svg>`
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
