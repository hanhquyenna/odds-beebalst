// The accounts odds made on job sites (by site), read from this browser's own storage. Passwords are only drawn when the person presses Show or
// Copy, and are hidden again after a short while. Nothing here talks to a server.
const list = document.getElementById("list")
const empty = document.getElementById("empty")
const note = document.getElementById("note")
const SHOW_MS = 15_000

function say(text) { note.textContent = text || ""; if (text) setTimeout(() => { if (note.textContent === text) note.textContent = "" }, 4000) }
function made(at) { return at ? new Date(at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "" }
const button = (label, cls, on) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; if (cls) b.className = cls; b.onclick = on; return b }

async function accounts() {
  const { oddsAccounts = {} } = await chrome.storage.local.get("oddsAccounts")
  return oddsAccounts
}

async function render() {
  const all = await accounts()
  const hosts = Object.keys(all).sort((a, b) => (all[b].at || 0) - (all[a].at || 0))
  list.replaceChildren()
  empty.hidden = hosts.length > 0
  for (const host of hosts) {
    const a = all[host]
    const li = document.createElement("li")
    li.dataset.host = host
    const site = document.createElement("div"); site.className = "site"; site.textContent = host
    const meta = document.createElement("div"); meta.className = "meta"; meta.textContent = `${a.email || ""}${a.at ? ` · made ${made(a.at)}` : ""}`
    const pw = document.createElement("div"); pw.className = "pw"; pw.textContent = "••••••••••••••••"
    let timer = 0
    const hide = () => { pw.textContent = "••••••••••••••••"; show.textContent = "Show"; window.clearTimeout(timer); timer = 0 }
    const show = button("Show", "go", async () => {
      if (timer) return hide()
      const cur = (await accounts())[host]
      if (!cur) return render()
      pw.textContent = cur.password || ""
      show.textContent = "Hide"
      timer = window.setTimeout(hide, SHOW_MS)
    })
    const copy = button("Copy password", "", async () => {
      const cur = (await accounts())[host]
      if (!cur?.password) return render()
      try { await navigator.clipboard.writeText(cur.password); say(`Password for ${host} copied.`) } catch { say("Copying was blocked. Use Show instead.") }
    })
    const open = button("Open site", "", () => { chrome.tabs.create({ url: `https://${host}/` }) })
    const remove = button("Forget", "danger", async () => {
      if (!window.confirm(`Forget the login for ${host}? Odds will not know the password any more. The account on the site stays.`)) return
      const { oddsAccounts = {} } = await chrome.storage.local.get("oddsAccounts")
      delete oddsAccounts[host]
      await chrome.storage.local.set({ oddsAccounts })
      say(`Forgot ${host}.`)
      render()
    })
    const row = document.createElement("div"); row.className = "row"; row.append(show, copy, open, remove)
    li.append(site, meta, pw, row)
    list.append(li)
  }
}
async function renderClicks() {
  const { oddsClickLog = [] } = await chrome.storage.local.get("oddsClickLog")
  const ol = document.getElementById("clicks")
  ol.replaceChildren()
  for (const c of [...oddsClickLog].reverse()) {
    const li = document.createElement("li")
    li.textContent = `${new Date(c.t).toLocaleTimeString()} · ${c.who} · "${c.label}" · ${c.host}`
    ol.append(li)
  }
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return
  if (changes.oddsAccounts) render()
  if (changes.oddsClickLog) renderClicks()
})
render()
renderClicks()
