// What odds knows about each site's pages: which job is open, its own Save button (odds sits beside it), the jobs in a list, and the job as the
// page shows it. One entry per site that lists jobs; every other page (employers' job boards, career sites) is read by `generic`, which knows a
// job page by what it tells search engines (schema.org JobPosting). The addresses themselves are read by job-sites.js, the rules the server uses.
(() => {
  const S = globalThis.oddsSites

  /** "Save" on a button in the languages job sites are shown in: Save job, Vacature opslaan, Bewaren, Speichern, Merken, Enregistrer, Guardar, and the
   *  likes some sites keep jobs with (Magnet.me's Liken). */
  const SAVE_LABEL = /\b(save|saved|bewaar\w*|opslaan|opgeslagen|speicher\w*|merken|gemerkt|enregistr\w*|sauvegard\w*|guardar|guardado|salvar|salva|salvato|zapisz|like|liken|favou?rite|favoriet\w*)\b/i
  /** Apply, for a page with no Save: odds sits beside Apply instead (Apply now, Solliciteren, Solliciteer, Bewerben, Postuler...). */
  const APPLY_LABEL = /\b(apply|sollicit\w*|bewerb\w*|postuler|candidat\w*|aplicar|inschrijven)\b/i

  const labelOf = (el) => (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim().slice(0, 80)
  const ours = (el) => el.id === "odds-add" || el.classList.contains("odds-job-chance")
  const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"

  /** The first shown button in `root` whose label says `rx`, leaving out ours and any inside `skip`. */
  function buttonIn(root, rx, skip) {
    if (!root) return null
    for (const b of root.querySelectorAll("button, a[role='button'], [role='button']")) {
      if (ours(b) || (skip && b.closest(skip))) continue
      if ((rx.test(labelOf(b)) || (rx === SAVE_LABEL && /save/i.test(b.dataset.test || ""))) && shown(b)) return b
    }
    return null
  }

  /** The job a page describes for search engines (its ld+json), or null. */
  function postingOf(doc) {
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const found = S.postingFrom(JSON.parse(script.textContent))
        if (S.postingUsable(found)) return found
      } catch {
        // a broken block: try the next one
      }
    }
    return null
  }

  /** Whether the page says it is a job, read again only when its ld+json changed (pages that are not jobs pay one query per look). */
  let ldSeen = { count: -1, text: 0, posting: null }
  function pagePosting() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]')
    const text = [...scripts].reduce((n, s) => n + s.textContent.length, 0)
    if (scripts.length !== ldSeen.count || text !== ldSeen.text) ldSeen = { count: scripts.length, text, posting: scripts.length ? postingOf(document) : null }
    return ldSeen.posting
  }

  /** A job as { id, url }, from an address, or null. */
  function linkOf(href, anyPage = false) {
    try {
      const found = S.jobLink(new URL(href, location.href).href, anyPage)
      return found ? { id: found.id, url: found.url } : null
    } catch {
      return null
    }
  }

  const textIn = (root, selector) => (root.querySelector(selector)?.innerText || "").trim()

  /** The job a list of jobs and its open job show as text, for sites whose job pages turn this browser's requests away too (Glassdoor). */
  function postingShown(title, company, location, description) {
    const posting = { title, company, location, description, posted: null, valid: null, logo: null, employment: null }
    return S.postingUsable(posting) ? posting : null
  }

  // Glassdoor jobs asked for within a moment of each other go to Glassdoor together.
  const GLASSDOOR_QUERY = "query OddsJob($jl: Long!) { jobview: jobView(listingId: $jl) { job { description jobTitleText listingId } header { employerNameFromSearch locationName ageInDays expired employer { name } } } }"
  let glassdoorWaiting = new Map()
  let glassdoorTimer = 0
  function glassdoorJob(id) {
    return new Promise((resolve) => {
      if (!glassdoorWaiting.has(id)) glassdoorWaiting.set(id, [])
      glassdoorWaiting.get(id).push(resolve)
      if (glassdoorWaiting.size >= 10) askGlassdoor()
      else if (!glassdoorTimer) glassdoorTimer = setTimeout(askGlassdoor, 40)
    })
  }
  async function askGlassdoor() {
    clearTimeout(glassdoorTimer)
    glassdoorTimer = 0
    const batch = glassdoorWaiting
    glassdoorWaiting = new Map()
    let views = []
    try {
      const res = await fetch("/graph", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "gd-csrf-token": "1" }, body: JSON.stringify([...batch.keys()].map((id) => ({ operationName: "OddsJob", variables: { jl: Number(id) }, query: GLASSDOOR_QUERY }))), signal: AbortSignal.timeout(15000) })
      views = res.ok ? await res.json() : []
    } catch {
      views = []
    }
    const byId = new Map()
    for (const answer of Array.isArray(views) ? views : []) {
      const view = answer?.data?.jobview
      if (view?.job?.listingId) byId.set(String(view.job.listingId), view)
    }
    const today = Date.now()
    for (const [id, waiting] of batch) {
      const view = byId.get(id)
      let posting = null
      if (view) {
        const place = (view.header?.locationName || "").trim()
        const age = Number(view.header?.ageInDays)
        posting = {
          title: S.textOf(view.job.jobTitleText || ""),
          company: S.textOf(view.header?.employer?.name || view.header?.employerNameFromSearch || ""),
          // Glassdoor names the town alone ("Amsterdam"); on its Dutch site that town is in the Netherlands.
          location: place && /\.nl$/.test(location.hostname) && !/netherlands|nederland/i.test(place) ? `${place}, Netherlands` : place,
          description: S.textOf(view.job.description || ""),
          posted: Number.isFinite(age) && age >= 0 ? new Date(today - age * 86_400_000).toISOString().slice(0, 10) : null,
          valid: null,
          logo: null,
          employment: null,
          closed: view.header?.expired === true,
        }
        if (!posting.closed && !S.postingUsable(posting)) posting = null
      }
      for (const resolve of waiting) resolve(posting)
    }
  }

  const LINKEDIN_ID = /(?:\/jobs\/view\/(?:[^/?#]*-)?|[?&]currentJobId=)(\d{8,12})/
  const linkedinJob = (id) => ({ id, url: `https://www.linkedin.com/jobs/view/${id}/` })

  const SITES = {
    linkedin: {
      // A LinkedIn job is read from LinkedIn's own public page of it (the one its guest job pages load), here in the person's browser: about a
      // third of a second, free. Where LinkedIn refuses that, odds reads the job itself (slower, paid).
      readable: true,
      fetchable: true,
      async remote(job) {
        const res = await fetch(S.linkedinPublicJob(job.id), { credentials: "include", signal: AbortSignal.timeout(10000) })
        if (!res.ok) return null
        const found = S.postingFromLinkedIn(await res.text())
        return found && (found.closed || S.postingUsable(found)) ? found : null
      },
      watch: 'a[href*="/jobs/view/"], a[href*="currentJobId="], [data-job-id], [data-occludable-job-id]',
      open() {
        // LinkedIn renders classic search inside /preload/. That frame owns its badges.
        const preload = document.querySelector('iframe[src*="linkedin.com/preload/"]')
        if (preload) {
          const style = getComputedStyle(preload)
          if (!preload.hidden && preload.getAttribute("aria-hidden") !== "true" && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0) return null
        }
        const heading = document.querySelector(".jobs-search__job-details h1 a[href*='/jobs/view/'], .jobs-details__main-content h1 a[href*='/jobs/view/'], h1 a[href*='/jobs/view/']")
        const found = LINKEDIN_ID.exec(heading?.getAttribute("href") || location.pathname + location.search)
        return found ? linkedinJob(found[1]) : null
      },
      /** LinkedIn's own Save button of the open job. Null when the page has none (then odds floats at the edge). */
      save() {
        const details = document.querySelector(".jobs-search__job-details, .jobs-details__main-content, .job-view-layout")
        // LinkedIn's Save reads "Saved" once the job is saved; its class stays the same either way.
        for (const b of (details || document.querySelector("main") || document).querySelectorAll("button")) {
          const label = (b.getAttribute("aria-label") || b.textContent || "").trim()
          if (!b.closest("[data-job-id], [data-occludable-job-id], .job-card-container") && (b.classList.contains("jobs-save-button") || /^(save|saved|unsave)\b/i.test(label)) && b.offsetParent !== null && !ours(b)) return b
        }
        return null
      },
      // LinkedIn search cards are reused during scrolling. A badge belongs to a job ID, not a DOM position.
      cards() {
        const out = []
        const seen = new Set()
        // The open job's own page links to itself (its "On-site", "Full-time" chips): that job has its button beside Save, not a badge.
        const open = SITES.linkedin.open()?.id
        for (const link of document.querySelectorAll('a[href*="/jobs/view/"], a[href*="currentJobId="]')) {
          const id = LINKEDIN_ID.exec(link.getAttribute("href"))?.[1]
          const card = link.closest("[data-job-id], [data-occludable-job-id], .job-card-container, .jobs-search-results__list-item, .scaffold-layout__list-item") || link
          if (!id || seen.has(id) || (card === link && (id === open || link.closest("h1, .jobs-search__job-details, .jobs-details__main-content")))) continue
          seen.add(id)
          const save = [...card.querySelectorAll("button")].find((b) => /^(save|saved)\b/i.test((b.getAttribute("aria-label") || b.textContent || "").trim()))
          // Search cards: a row of 32px round buttons at the card's corner (Dismiss ✕); odds is the first of them. Inside the title it would be cut off.
          const actions = card.querySelector(".job-card-list__actions-container")
          const dismiss = actions?.querySelector("button")
          out.push({
            ...linkedinJob(id),
            card,
            save: save || dismiss || null,
            row: save ? save.parentElement : actions,
            put(badge) {
              if (save) save.before(badge)
              else if (actions) actions.prepend(badge)
              else if (card !== link && link.classList.contains("job-card-container__link")) link.parentElement.append(badge)
              else card.append(badge)
            },
          })
        }
        return out
      },
    },

    indeed: {
      readable: true,
      // Indeed's own job pages answer this browser (it is signed in there): a job in the list is read from its page without opening it.
      fetchable: true,
      watch: "[data-jk], #jobsearch-ViewjobPaneWrapper, h1, h2",
      open() {
        return linkOf(location.href)
      },
      save() {
        const root = document.querySelector("#jobsearch-ViewjobPaneWrapper, #viewJobSSRRoot, .jobsearch-ViewJobLayout, main")
        return buttonIn(root, SAVE_LABEL, ".job_seen_beacon, [data-jk], .cardOutline")
      },
      cards() {
        const out = []
        const seen = new Set()
        for (const el of document.querySelectorAll("[data-jk]")) {
          const jk = el.dataset.jk
          const card = el.closest(".job_seen_beacon, .cardOutline, li")
          if (!card || !/^[0-9a-f]{16}$/.test(jk || "") || seen.has(jk)) continue
          seen.add(jk)
          const job = linkOf(`https://${location.host}/viewjob?jk=${jk}`)
          if (!job) continue
          // The card's row of chips (pay, Stage, Fulltime): odds is the first chip there, their size and shape. The bookmark sits in a narrow
          // box in the card's corner, against the end of long titles: nothing fits beside it there.
          const chips = card.querySelector("ul.metadataContainer, [class*='metadataContainer']")
          const chip = chips?.querySelector("li")
          out.push({ ...job, card, save: chip || null, put: (badge) => (chips ? chips.prepend(badge) : (card.querySelector(".company_location") || el).after(badge)) })
        }
        return out
      },
    },

    glassdoor: {
      // Glassdoor's job pages stop scripts at a "humans only" check, but its own page asks Glassdoor's /graph for a job when one is opened: odds
      // asks the same, for the jobs in view, ten to a request (about a third of a second), without opening anything.
      readable: true,
      fetchable: true,
      remote: (job) => glassdoorJob(job.id),
      readsAtOnce: 10,
      watch: '[data-test="jobListing"], [data-test="job-details-header"], h1',
      open() {
        const title = document.querySelector('h1[id^="jd-job-title-"]')
        const id = title && /(\d{6,20})$/.exec(title.id)?.[1]
        if (id) return linkOf(`https://${location.host}/job-listing/j.htm?jl=${id}`)
        return linkOf(location.href)
      },
      save() {
        const header = document.querySelector('[data-test="job-details-header"]')
        return header?.querySelector('[data-test="save-job"]') || buttonIn(header, SAVE_LABEL)
      },
      cards() {
        const out = []
        for (const card of document.querySelectorAll('[data-test="jobListing"][data-jobid]')) {
          const id = card.dataset.jobid
          const href = card.querySelector('a[href*="jl="]')?.getAttribute("href")
          const job = (href && linkOf(href)) || linkOf(`https://${location.host}/job-listing/j.htm?jl=${id}`)
          if (!job) continue
          const save = card.querySelector('[data-test="save-job"]')
          out.push({ ...job, card, save, put: (badge) => (save ? save.before(badge) : card.append(badge)) })
        }
        return out
      },
      read() {
        const header = document.querySelector('[data-test="job-details-header"]')
        if (!header) return null
        const title = textIn(header, "h1")
        // The employer's name is followed by its rating ("ABN AMRO3,9"): the name alone.
        const company = (textIn(header, '[class*="employerName"], [class*="EmployerProfile_profileContainer"] a, a') || "").replace(/\s*\d[.,]\d\s*★?$/, "").trim()
        const place = textIn(header, '[data-test="location"]')
        // The open job's whole description, never a card's snippet in the list (those come first in the page and are named alike).
        const body = ['[class*="JobDetails_jobDescription"]', '[data-test="jobDescriptionContent"]', '[class*="jobDescription"]'].map((rule) => [...document.querySelectorAll(rule)].find((el) => !el.closest('[data-test="jobListing"]'))).find(Boolean)
        return postingShown(title, company, place, (body?.innerText || "").trim())
      },
    },
  }

  /** Any other page: a job when it says so for search engines, a list when its links are jobs of a site odds knows. */
  const generic = {
    readable: true,
    fetchable: true,
    // Pages of sites odds does not know change all the time: there only a new title or ld+json can make it a job page.
    watch: S.siteOfHost(location.hostname) ? 'script[type="application/ld+json"], h1, a[href]' : 'script[type="application/ld+json"], h1',
    open() {
      const known = linkOf(location.href)
      if (known) return known
      return pagePosting() ? linkOf(location.href, true) : null
    },
    save() {
      // Next to the job's own Save, else its Apply, looking outwards from its title.
      // Job pages keep these in a column beside the text (Magnet.me): far up from the title, so the search goes up to the page's main part.
      let around = document.querySelector("h1")
      for (let i = 0; around && around !== document.body && i < 12; i++, around = around.parentElement) {
        const found = buttonIn(around, SAVE_LABEL, "nav, footer") || buttonIn(around, APPLY_LABEL, "nav, footer")
        if (found) return found
      }
      return null
    },
    cards() {
      // Only this site's own jobs (a board's list, related jobs on a job page), never links out to other sites.
      if (!S.siteOfHost(location.hostname)) return []
      const open = this.open()
      const byId = new Map()
      for (const a of document.querySelectorAll("a[href]")) {
        if (a.closest("nav, footer, h1, header") || ours(a)) continue
        const job = linkOf(a.getAttribute("href"))
        if (!job || job.id === open?.id || new URL(job.url).hostname.replace(/^www\./, "") !== location.hostname.replace(/^www\./, "")) continue
        if (!byId.has(job.id)) byId.set(job.id, { job, links: [] })
        byId.get(job.id).links.push(a)
      }
      const out = []
      for (const { job, links } of byId.values()) {
        const link = links[0]
        // The card: the largest box around the link that holds no other job.
        let card = link
        for (let i = 0; i < 5; i++) {
          const up = card.parentElement
          if (!up || up === document.body || /^(MAIN|UL|OL|SECTION|BODY)$/.test(up.tagName)) break
          const others = [...up.querySelectorAll("a[href]")].some((x) => x !== link && !links.includes(x) && linkOf(x.getAttribute("href"))?.id && linkOf(x.getAttribute("href")).id !== job.id)
          if (others) break
          card = up
        }
        const save = buttonIn(card, SAVE_LABEL)
        out.push({ ...job, card, save, put: (badge) => (save ? save.before(badge) : card === link ? link.append(badge) : link.after(badge)) })
      }
      return out
    },
  }

  /** What odds knows about this page's site. */
  globalThis.oddsPage = {
    site: SITES[S.siteOfHost(location.hostname)] || generic,
    postingOf,
    pagePosting,
  }
})()
