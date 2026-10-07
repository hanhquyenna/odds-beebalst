// Run in the same tab. Reads the full posting of each job key in window.__Keys (set it first) from Indeed's own page data, one every ~1.5 s, into
// window.__det2 = [ { jk, title, company, place, posted, valid, description } ]. Poll window.__detDone. Stops itself on a 429 / 403.
window.__det2 = []; window.__detDone = false;
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms + Math.random() * ms * 0.4))
  for (const jk of window.__Keys) {
    try {
      const r = await fetch("/viewjob?jk=" + jk)
      if (r.status === 429 || r.status === 403) { window.__det2.push({ jk, skip: "HTTP " + r.status }); break }
      const html = await r.text()
      const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]) } catch (e) { return null } }).find((j) => j && j["@type"] === "JobPosting")
      if (!ld) { window.__det2.push({ jk, skip: "no data" }); await sleep(1500); continue }
      const d = new DOMParser().parseFromString("<div>" + (ld.description || "") + "</div>", "text/html")
      d.querySelectorAll("br,p,li,div,h1,h2,h3,h4,ul").forEach((e) => e.append("\n"))
      const description = d.body.textContent.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
      const a = ld.jobLocation && ld.jobLocation.address
      window.__det2.push({ jk, title: ld.title, company: ld.hiringOrganization && ld.hiringOrganization.name, place: [a && a.addressLocality, a && a.addressRegion].filter(Boolean).join(", "), posted: ld.datePosted || null, valid: ld.validThrough || null, description })
    } catch (e) { window.__det2.push({ jk, skip: e.message }) }
    await sleep(1500)
  }
  window.__detDone = true
})()
