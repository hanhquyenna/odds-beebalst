// Applying with odds on LinkedIn: when the person opens Easy Apply, odds fills the form in from what it knows (their odds profile, the standard
// answers they keep on odds, their own earlier answers, the CV that goes with the job), moves on through the steps that are complete, and stops
// at the review: the person checks it and presses Submit themselves. odds never presses Submit. A question odds cannot answer is marked; what the
// person answers is kept, so the next form that asks it is filled in too. When LinkedIn says the application was sent, the job is marked applied.
;(() => {
  const A = globalThis.oddsApply
  const PAGE = globalThis.oddsPage
  if (!A || !PAGE || !/(^|\.)linkedin\.com$/.test(location.hostname)) return

  // The same scripts run in LinkedIn's warm-up frame. It must never take the
  // visible page's application intent or fill a stale form behind that page.
  const frame = window.frameElement
  if (frame && (frame.hidden || frame.getAttribute("aria-hidden") === "true" || getComputedStyle(frame).display === "none" || getComputedStyle(frame).visibility === "hidden" || Number(getComputedStyle(frame).opacity) === 0)) return

  // The Easy Apply form: LinkedIn's classic modal, or the <dialog> of its newer job pages ("Apply to <company>").
  const MODAL = '[data-test-modal-id="easy-apply-modal"], dialog[data-testid="dialog"]'
  const modalOnPage = () => [...document.querySelectorAll(MODAL)].find((m) => m.matches("[data-test-modal-id]") || (m.open && /^apply to\b/i.test(m.querySelector("h2, h1")?.innerText.trim() || ""))) || null
  const NEXT = /continue to next step|review your application|^next$|^review$/i
  const SUBMIT = /submit/i
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const ask = (message) => new Promise((resolve) => chrome.runtime.sendMessage(message, (answer) => resolve(chrome.runtime.lastError ? null : answer)))
  const shown = (el) => el.getClientRects().length > 0

  /** The modal's buttons: the one that goes on (never Submit), and Submit itself (only ever watched). */
  const buttonsOf = (modal) => [...modal.querySelectorAll("button")].filter(shown)
  const labelOfButton = (b) => (b.getAttribute("aria-label") || b.innerText || "").trim()
  const isSubmit = (b) => b.hasAttribute("data-live-test-easy-apply-submit-button") || SUBMIT.test(labelOfButton(b))
  const nextButton = (modal) => buttonsOf(modal).find((b) => !isSubmit(b) && (NEXT.test(labelOfButton(b)) || b.hasAttribute("data-easy-apply-next-button")))
  const submitButton = (modal) => buttonsOf(modal).find(isSubmit)

  /** One question of the step: its words, how it is asked, and the element(s) to answer it with. */
  function questionOf(group) {
    // The classic form labels a question; the newer one often names it only on the field (aria-label) or the radio choices, and writes it in a <p>.
    const labelEl = group.querySelector("legend, [data-test-form-builder-radio-button-form-component__title]") || [...group.querySelectorAll("label")].find(l => !l.querySelector('input[type="radio"]') && !group.querySelector(`input[type="radio"][id="${CSS.escape(l.htmlFor || "__none__")}"]`) && l.innerText.trim())
    const field = group.querySelector("input, select, textarea")
    const label = A.questionText(labelEl?.innerText || group.getAttribute("aria-label") || field?.getAttribute("aria-label") || group.querySelector(":scope > p")?.innerText || group.querySelector('[role="radio"]')?.getAttribute("aria-label") || group.querySelector("p")?.innerText || "")
    if (!label) return null
    const select = group.querySelector("select")
    if (select) return { group, label, kind: "select", el: select, options: [...select.options].map((o) => o.text.trim()) }
    const radios = [...group.querySelectorAll('input[type="radio"]')]
    if (radios.length) return { group, label, kind: "radio", el: radios, options: radios.map((r) => (group.querySelector(`label[for="${CSS.escape(r.id)}"]`)?.innerText || r.closest('[role="radio"]')?.innerText || r.value || "").trim()) }
    if (group.querySelector('input[type="checkbox"]')) return { group, label, kind: "checkbox", el: [...group.querySelectorAll('input[type="checkbox"]')] }
    const area = group.querySelector("textarea")
    if (area) return { group, label, kind: "textarea", el: area }
    const input = group.querySelector('input:not([type="hidden"]):not([type="file"])')
    if (!input) return null
    const kind = input.type === "number" || /numeric/i.test(input.id) ? "number" : "text"
    return { group, label, kind, el: input, typeahead: input.getAttribute("role") === "combobox" || input.getAttribute("aria-autocomplete") === "list" }
  }

  /** Whether a question already has an answer (LinkedIn fills some in itself: email, phone, an answer given before). */
  function answered(q) {
    if (q.kind === "select") return q.el.selectedIndex > 0 || (q.el.selectedIndex === 0 && !/^(select|selecteer|choose|kies)/i.test(q.options[0] || ""))
    if (q.kind === "radio") return q.el.some((r) => r.checked)
    if (q.kind === "checkbox") return true
    return q.el.value.trim() !== ""
  }

  /** The answer the person gave, as words, for keeping. */
  function answerGiven(q) {
    if (q.kind === "select") return q.options[q.el.selectedIndex] || ""
    if (q.kind === "radio") return q.options[q.el.findIndex((r) => r.checked)] || ""
    if (q.kind === "checkbox") return ""
    return q.el.value.trim()
  }

  /** Puts a value in a field the way typing would, so LinkedIn's own code sees it. */
  function type(el, value) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set
    if (setter) setter.call(el, value)
    else el.value = value
    for (const name of ["input", "change", "blur"]) el.dispatchEvent(new Event(name, { bubbles: true }))
  }

  /** Answers one question from what odds knows; false when it does not know or none of the options fits. */
  async function fill(q, facts, besideCountry) {
    if (q.kind === "select" && /country code|landcode/i.test(q.label)) {
      const phone = facts.answers?.phone || facts.phone || ""
      const digits = phone.replace(/[^0-9]/g, "")
      const option = phone.startsWith("+") ? q.options.findIndex(o => {
        const prefix = /\+(\d{1,3})/.exec(o)?.[1]
        return prefix && digits.startsWith(prefix)
      }) : -1
      if (option < 0) return false
      q.el.selectedIndex = option
      for (const name of ["input", "change"]) q.el.dispatchEvent(new Event(name, { bubbles: true }))
      return true
    }
    const answer = A.answerText(q.label, facts)
    if (answer === null) return false
    if (q.kind === "select") {
      const i = A.chooseOption(q.options, answer, q.label)
      if (i < 0) return false
      q.el.selectedIndex = i
      for (const name of ["input", "change"]) q.el.dispatchEvent(new Event(name, { bubbles: true }))
      return true
    }
    if (q.kind === "radio") {
      const i = A.chooseOption(q.options, answer, q.label)
      if (i < 0) return false
      q.el[i].click()
      // The newer form listens on the choice around the radio.
      if (!q.el[i].checked) q.el[i].closest('[role="radio"]')?.click()
      return true
    }
    if (q.kind === "checkbox") return false
    type(q.el, A.valueFor(q.kind, q.label, answer, besideCountry))
    if (q.typeahead) {
      // A place picked from LinkedIn's suggestions: the first one that starts like the answer.
      for (let waited = 0; waited < 2500; waited += 250) {
        await sleep(250)
        const option = [...document.querySelectorAll('[role="listbox"] [role="option"]')].find((o) => o.innerText.trim().toLowerCase().startsWith(answer.toLowerCase().split(",")[0]))
        if (option) {
          option.click()
          return true
        }
      }
      return false
    }
    return true
  }

  /** The CV that goes with this job, chosen among the ones LinkedIn keeps, or uploaded from odds when LinkedIn does not have it. */
  async function chooseCv(modal, kit) {
    if (!kit.cv) return true
    const want = [kit.cv.file_name, kit.cv.name].filter(Boolean).map((n) => n.toLowerCase().replace(/\.[a-z]+$/, ""))
    const cards = documentRadios(modal)
    if (!cards.length && !modal.querySelector('input[type="file"]') && ![...modal.querySelectorAll("button")].some(b => /^upload (resume|cv)$/i.test(labelOfButton(b)))) return true
    const nameOf = (r) => (r.getAttribute("aria-label") || r.closest('[role="radio"]')?.getAttribute("aria-label") || "").toLowerCase()
    const mine = cards.find((r) => want.some((w) => nameOf(r).includes(w)))
    if (mine) {
      if (!mine.checked) mine.click()
      if (!mine.checked) mine.closest('[role="radio"]')?.click()
      await sleep(50)
      return mine.checked
    }
    let upload = modal.querySelector('input[type="file"][id*="upload-resume"], input[type="file"][name="file"]') || [...modal.querySelectorAll('input[type="file"]')].find((f) => /resume|cv|pdf/i.test(`${f.accept} ${f.id} ${f.name} ${f.getAttribute("aria-label") || ""}`))
    if (!upload) {
      const trigger = [...modal.querySelectorAll("button")].find(b => /^upload (resume|cv)$/i.test(labelOfButton(b)))
      if (trigger) {
        // LinkedIn creates its input only on demand, outside the dialog. Capture
        // that exact input and suppress the native picker: the CV comes from Odds.
        const intercept = event => {
          if (event.target instanceof HTMLInputElement && event.target.type === "file") {
            event.preventDefault()
            upload = event.target
          }
        }
        document.addEventListener("click", intercept, true)
        try { trigger.click(); await sleep(50) } finally { document.removeEventListener("click", intercept, true) }
      }
    }
    if (!upload) return false
    if (session.uploaded) return Boolean(upload.files?.length) && upload.getAttribute("aria-invalid") !== "true"
    const file = await ask({ type: "cv-file", doc: kit.cv.id })
    if (file?.status !== "ok") return false
    const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], file.name, { type: file.type }))
    upload.files = transfer.files
    upload.dispatchEvent(new Event("change", { bubbles: true }))
    await sleep(50)
    session.uploaded = Boolean(upload.files?.length) && upload.getAttribute("aria-invalid") !== "true"
    return session.uploaded
  }

  /** The bar at the top of the form that says what odds did and what is left for the person. */
  function say(modal, text, state = "busy") {
    let bar = modal.querySelector(".odds-apply-bar")
    if (!bar) {
      bar = document.createElement("div")
      bar.className = "odds-apply-bar"
      const header = modal.matches("dialog") ? modal.querySelector("header") : null
      if (header) header.after(bar)
      else (modal.querySelector(".artdeco-modal__content, [data-test-modal] .jobs-easy-apply-content") || modal.querySelector('[role="dialog"]') || modal).prepend(bar)
    }
    const status = state === "done" ? "ready" : state === "ask" ? "needs_input" : state === "problem" ? "failed" : "filling"
    if (bar.textContent !== text || bar.dataset.state !== state) ask({ type: "application-progress", status, message: text })
    bar.dataset.state = state
    bar.textContent = text
  }

  /** The form's questions, one box each: LinkedIn marks them in its classic form; in the newer one a question is its fieldset, or the smallest
   *  box holding a field and its label. */
  function groupsOf(modal) {
    const marked = [...modal.querySelectorAll("[data-test-form-element]")]
    if (marked.length) return marked
    const groups = new Set()
    for (const el of modal.querySelectorAll('fieldset, select, textarea, input:not([type="hidden"]):not([type="file"])')) {
      if (el.tagName !== "FIELDSET" && el.closest("fieldset")) continue
      if (el.tagName === "FIELDSET") {
        groups.add(el)
        continue
      }
      const label = el.id ? modal.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null
      let box = el.parentElement
      while (label && box && box !== modal && !box.contains(label)) box = box.parentElement
      // No label: the box whose own <p> asks the question.
      for (let up = 0; !label && up < 4 && box && box !== modal && !box.querySelector(":scope > p"); up++) box = box.parentElement
      if (box && box !== modal) groups.add(box)
    }
    return [...groups]
  }
  /** The CVs LinkedIn keeps, as radios (not a question: chosen by chooseCv). */
  const documentRadios = (modal) => [...modal.querySelectorAll('input[type="radio"]')].filter((r) => /^jobsDocumentCardToggle/.test(r.id) || /\.(pdf|docx?)$/i.test(r.closest('[role="radio"]')?.getAttribute("aria-label") || ""))
  const questionsOf = (modal) => {
    const documents = new Set(documentRadios(modal))
    return groupsOf(modal).filter((g) => shown(g) && ![...g.querySelectorAll('input[type="radio"]')].some((r) => documents.has(r))).map(questionOf).filter(Boolean)
  }
  const signature = (modal) => [modal.querySelector("h3")?.innerText || "", ...questionsOf(modal).map((q) => q.label), nextButton(modal) ? labelOfButton(nextButton(modal)) : "submit"].join("|")

  /** Waits until the form shows another step (or closes); false when it did not within the time. */
  async function changed(modal, before, ms) {
    for (let waited = 0; waited < ms; waited += 200) {
      await sleep(200)
      if (!modal.isConnected || signature(modal) !== before) return true
    }
    return false
  }

  let session = null

  /** Fills in the step on screen. Answers the questions it can, marks the rest; answers the number of questions left for the person. */
  async function fillStep(modal) {
    const qs = questionsOf(modal)
    const besideCountry = qs.some((q) => /country code|landcode/i.test(q.label))
    let left = 0
    for (const q of qs) {
      q.group.classList.remove("odds-ask")
      const valid = () => (Array.isArray(q.el) ? q.el : [q.el]).every(e => e.getAttribute("aria-invalid") !== "true" && (!e.willValidate || e.validity.valid))
      if (answered(q) && valid()) continue
      if (await fill(q, session.kit.facts, besideCountry)) {
        await sleep(50)
        if (answered(q) && valid()) {
          q.group.dataset.odds = "filled"
          continue
        }
      }
      if (q.kind === "checkbox") continue
      q.group.classList.add("odds-ask")
      left++
    }
    await session.handoff?.publish(qs.filter(q => q.group.classList.contains("odds-ask")))
    if (await chooseCv(modal, session.kit) === false) left++
    return left
  }

  async function run(modal) {
    const job = PAGE.site.open?.()
    session = { modal, job, kit: null, uploaded: false, submitted: false, handoff: globalThis.oddsApplicationHandoff?.(job?.url || location.href, ask) }
    say(modal, "odds is filling this in…")
    const kit = await ask({ type: "apply-kit", url: job?.url || location.href })
    if (!kit || kit.status === "connect") return say(modal, "Connect odds (its icon in the toolbar) to have this filled in.", "problem")
    if (kit.status !== "ok") return say(modal, "odds could not fill this in right now. Fill it in as usual.", "problem")
    session.kit = kit
    session.handoff = globalThis.oddsApplicationHandoff?.(job?.url || location.href, ask, kit.job_id)
    globalThis.oddsDismissCookies?.()
    for (let step = 0; step < 15 && modal.isConnected && session?.modal === modal; step++) {
      await sleep(250)
      const left = await fillStep(modal)
      const next = nextButton(modal)
      const before = signature(modal)
      if (left > 0) {
        say(modal, `odds filled in what it knows. Answer the ${left === 1 ? "marked question" : `${left} marked questions`}, then press ${next ? "Next" : "Review"}: odds keeps your answers for the next form.`, "ask")
        // Answers from the side panel or Claude arrive without taking over the browser.
        while (modal.isConnected && session?.modal === modal && signature(modal) === before) {
          await sleep(300)
          if (await session.handoff?.refresh(session.kit.facts)) {
            if (await fillStep(modal) === 0) break
          }
        }
        step--
        continue
      }
      if (next) {
        say(modal, "odds is filling this in…")
        await sleep(300)
        next.click()
        if (!(await changed(modal, before, 4000))) {
          // LinkedIn did not go on: it marks what it wants changed. That is the person's to fix.
          say(modal, "LinkedIn wants something changed here. Fix it, then press Next.", "ask")
          while (modal.isConnected && signature(modal) === before) await sleep(300)
        }
        continue
      }
      if (submitButton(modal)) say(modal, "Filled in by odds. Check everything, then press Submit yourself.", "done")
      return
    }
  }

  /** Keeps what the person answered themselves on this step, when they go on (Next, Review or Submit). */
  function keep(modal) {
    const questions = questionsOf(modal)
      .filter((q) => q.group.dataset.odds !== "filled" && q.kind !== "checkbox" && answered(q) && !/^(e-?mail\w*|phone country code|landcode|mobile phone number|mobiel telefoonnummer|phone|telefoon\w*)\b/i.test(q.label))
      .map((q) => ({ question: q.label, answer: answerGiven(q) }))
      .filter((q) => q.answer)
    if (questions.length) {
      ask({ type: "save-answers", questions, url: session.job?.url || location.href })
      // Used at once if the same question comes again on a later step.
      for (const q of questions) session.kit.facts.remembered = { ...(session.kit.facts.remembered || {}), [A.applicationQuestionKey(q.question, session.kit.job_id)]: q.answer }
    }
  }

  /** After Submit: when LinkedIn says it was sent, the job is applied on odds (kept for the person first if odds did not hold it). */
  async function watchSent(job) {
    for (let waited = 0; waited < 20000; waited += 500) {
      await sleep(500)
      const said = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], .artdeco-modal, dialog[open]')].some((d) => /application (was )?sent|your application was sent|sent your application|application submitted/i.test(d.innerText || ""))
      if (!said) continue
      await ask({ type: "application-progress", status: "submitted", message: "LinkedIn confirmed your application was sent." })
      let done = await ask({ type: "applied", url: job.url })
      if (done?.status !== "ok") {
        const added = await ask({ type: "add", url: job.url })
        if (added && ["added", "exists"].includes(added.status)) done = await ask({ type: "applied", url: job.url })
      }
      return
    }
  }

  document.addEventListener(
    "click",
    (event) => {
      const button = event.target instanceof Element ? event.target.closest("button") : null
      const modal = button?.closest(MODAL)
      if (!modal || !session || session.modal !== modal || !session.kit) return
      if (isSubmit(button) || NEXT.test(labelOfButton(button))) keep(modal)
      if (isSubmit(button) && session.job && !session.submitted) {
        session.submitted = true
        watchSent(session.job)
      }
    },
    true,
  )

  /** The open job's Apply (Easy Apply, or Apply on the employer's site), not one in a list of other jobs. */
  function applyButton() {
    const classic = [...document.querySelectorAll("#jobs-apply-button-id, .jobs-apply-button")].find(shown)
    if (classic) return classic
    return [...document.querySelectorAll("main button, main a[role='button'], button")].find((b) => shown(b) && /^(easy apply\b|apply$|apply on\b|apply to this job)/i.test(labelOfButton(b)) && !b.closest("[data-job-id], [data-occludable-job-id], .job-card-container, a[href*='similar-jobs'], dialog")) || null
  }

  /** Where the employer takes applications for a LinkedIn job, as LinkedIn's own page knows it (the person's session), or null. */
  async function offsiteUrl(id) {
    try {
      const csrf = /JSESSIONID="?([^";]+)/.exec(document.cookie)?.[1]
      if (!csrf) return null
      const res = await fetch(`/voyager/api/jobs/jobPostings/${id}`, { credentials: "include", headers: { "csrf-token": csrf, accept: "application/json" }, signal: AbortSignal.timeout(8000) })
      if (!res.ok) return null
      const body = await res.json()
      const url = (body?.data || body)?.applyMethod?.["com.linkedin.voyager.jobs.OffsiteApply"]?.companyApplyUrl
      return typeof url === "string" && /^https:\/\//.test(url) ? url : null
    } catch {
      return null
    }
  }

  // The form opens in a modal LinkedIn adds to the page when Easy Apply is pressed.
  // Opened from "odds apply" in the panel: the application is started here, Easy Apply pressed (and filled in above), or the employer's own
  // Apply pressed, which opens their form (filled in by apply-any.js, the intent going along to that tab).
  ;(async () => {
    const { intent } = (await ask({ type: "apply-intent" })) || {}
    if (!intent || intent.started) return
    const wanted = globalThis.oddsSites.jobLink(intent.job)?.id
    for (let waited = 0; waited < 15000; waited += 300) {
      await sleep(300)
      if (PAGE.site.open?.()?.id !== wanted) continue
      const details = document.querySelector(".jobs-search__job-details, .jobs-details__main-content, main") || document.body
      if ([...details.querySelectorAll("span, p, div")].some(el => shown(el) && el.children.length === 0 && /^(no longer accepting applications|this job is no longer available|applications are closed|vacature gesloten)$/i.test(el.textContent.trim()))) {
        say(document.body, "This job is no longer accepting applications on LinkedIn. No application was submitted.", "problem")
        document.body.querySelector(".odds-apply-bar")?.classList.add("odds-apply-float")
        await ask({ type: "apply-started" })
        return
      }
      const button = applyButton()
      if (!button) continue
      await ask({ type: "apply-started" })
      if (/easy apply/i.test(labelOfButton(button))) return button.click()
      // Applied for on the employer's site: their form is opened in this tab straight away (a scripted press on LinkedIn's Apply would open a
      // window Chrome blocks), and filled in there by apply-any.js.
      const there = await offsiteUrl(wanted)
      if (there) return ask({ type: "apply-go", url: there })
      await ask({ type: "apply-follow" })
      button.click()
      return
    }
    say(document.body, "Could not open an application here. Check whether this job is closed, or complete login/verification in Chrome.", "ask")
    document.body.querySelector(".odds-apply-bar")?.classList.add("odds-apply-float")
  })()

  // LinkedIn changes its page all the time: looked at once a frame at most.
  function scanModal() {
    const modal = modalOnPage()
    if (modal && (!session || session.modal !== modal)) run(modal)
    if (!modal && session && !session.submitted) session = null
  }
  scanModal()
  let looking = false
  new MutationObserver(() => {
    if (looking) return
    looking = true
    requestAnimationFrame(() => {
      looking = false
      scanModal()
    })
  }).observe(document.body, { childList: true, subtree: true })
})()
