// Run in the Browser pane tab that is on nl.indeed.com (signed in), with javascript_tool. Starts a slow background search over the words in window.__Q
// (set it first: window.__Q = ["stage","werkstudent"]) and fills window.__cards2 = { jobkey: [title, company, place, publishedMs] }. Poll window.__crawlDone.
// It stops itself on a 429 or a captcha: never retry at once, leave it for the next hour.
window.__cards2 = window.__cards2 || {}; window.__crawlLog = []; window.__crawlDone = false;
void (async () => {
  const KEEP = /(intern\b|internship|stage|stagi|afstudeer|werkstudent|working student|trainee|graduate|junior|starter|meewerk|young professional|studentwork|student\b)/i
  const DROP = /(courier|cleaner|schoonmaak|orderpicker|warehouse|expedition|horeca|\bkok\b|zwem|verpleeg|tandarts|hovenier|bezorg|\(m\/w\/d\)|\bphd\b|samsung|pedagogisch|verzorgende|beauty|zzp|winkelassist|front office manager|sofy|accommodation)/i
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms + Math.random() * ms * 0.5))
  for (const q of window.__Q) {
    for (let p = 0; p < 3; p++) {
      try {
        const url = "/jobs?q=" + encodeURIComponent(q) + "&l=Nederland&fromage=14&start=" + p * 10
        const r = await fetch(url)
        const t = await r.text()
        if (r.status !== 200 || /captcha|Additional Verification|verify you are human/i.test(t)) { window.__crawlLog.push("STOP " + q + " " + r.status); window.__crawlDone = true; return }
        const m = t.match(/window\.mosaic\.providerData\["mosaic-provider-jobcards"\]\s*=\s*(\{[\s\S]*?\});\s*window\.mosaic/)
        const res = m ? JSON.parse(m[1]).metaData?.mosaicProviderJobCardsModel?.results || [] : []
        for (const x of res) {
          if (/^[0-9a-f]{16}$/.test(x.jobkey) && x.jobkey !== "fedcba9876543210" && KEEP.test(x.title) && !DROP.test(x.title) && !window.__cards2[x.jobkey]) window.__cards2[x.jobkey] = [x.title, x.company, x.formattedLocation, x.pubDate || 0]
        }
        window.__crawlLog.push(q + " p" + p + ": " + res.length)
        if (res.length < 10) break
      } catch (e) { window.__crawlLog.push("ERR " + q + " " + e.message); break }
      await sleep(1500)
    }
  }
  window.__crawlDone = true
})()
