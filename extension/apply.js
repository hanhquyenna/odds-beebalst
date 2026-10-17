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
  // Embedded LinkedIn profile widgets are not LinkedIn job applications.
  if (window.top !== window) return
  const frame = window.frameElement
  if (frame && (frame.hidden || frame.getAttribute("aria-hidden") === "true" || getComputedStyle(frame).display === "none" || getComputedStyle(frame).visibility === "hidden" || Number(getComputedStyle(frame).opacity) === 0)) return

  // The Easy Apply form: LinkedIn's classic modal, or the <dialog> of its newer job pages ("Apply to <company>").
  const MODAL = '[data-test-modal-id="easy-apply-modal"], dialog[data-testid="dialog"]'
  const modalOnPage = () => [...document.querySelectorAll(MODAL)].find((m) => m.matches("[data-test-modal-id]") || (m.open && /^apply to\b/i.test(m.querySelector("h2, h1")?.innerText.trim() || ""))) || null
  const NEXT = /continue to next step|review your application|^next$|^review$/i
  const SUBMIT = /submit/i
  // A hidden tab's own timers are slowed by Chrome (to about once a minute after a while): there the wait comes from the extension's
  // background, whose timers run on time, and its reply wakes the page.
  const sleep = (ms) => new Promise((resolve) => {
    let done = false
    const finish = () => { if (!done) { done = true; resolve() } }
    setTimeout(finish, ms)
    if (document.hidden && ms >= 50) chrome.runtime.sendMessage({ type: "odds-sleep", ms }).then(finish, () => undefined)
  })
  /** Never hang forever if the service worker never calls back (that froze Easy Apply in silence). */
  const ask = (message, ms = 20000) => new Promise((resolve) => {
    let done = false
    const finish = (v) => { if (done) return; done = true; clearTimeout(timer); resolve(v) }
    const timer = setTimeout(() => finish(null), ms)
    try {
      chrome.runtime.sendMessage(message, (answer) => finish(chrome.runtime.lastError ? null : answer))
    } catch {
      finish(null)
    }
  })
  /** The background worker may be waking up and answer nothing the first time: ask again a few times before deciding there is no answer. */
  const askAgain = async (message) => {
    for (let i = 0; i < 4; i++) {
      const answer = await ask(message, 8000)
      if (answer !== null) return answer
      await sleep(300)
    }
    return null
  }
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
    if (group.querySelector('input[type="checkbox"]')) {
      // Redcare-style Easy Apply: short "I consent" on the input; full privacy sentence in a sibling <p>.
      const context = A.questionText([label, group.querySelector(":scope > p, p")?.innerText, group.innerText].filter(Boolean).join(" ").slice(0, 500))
      return { group, label: context || label, kind: "checkbox", el: [...group.querySelectorAll('input[type="checkbox"]')] }
    }
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
    // Consent boxes must be ticked or Next stays blocked; other checkboxes are left alone.
    if (q.kind === "checkbox") return !A.isConsentCheckbox?.(q.label) || q.el.every((c) => c.checked)
    return q.el.value.trim() !== ""
  }

  /** Censor: Ready only when required + contact fields actually have values in the DOM. */
  function formActuallyFilled(modal) {
    const states = questionsOf(modal).map((q) => ({
      label: q.label,
      kind: q.kind,
      required: q.kind !== "checkbox",
      answered: answered(q),
      fillFailed: !answered(q) && typeof A.answerText === "function" && Boolean(A.answerText(q.label, session?.kit?.facts || {})),
    }))
    if (typeof A.formActuallyFilled === "function") return A.formActuallyFilled(states)
    return states.every((s) => s.kind === "checkbox" || s.answered || !s.required)
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
    if (q.kind === "checkbox") {
      // Terms and consent require the person's own choice.
      return q.el.every((c) => c.checked)
    }
    // Broods-only: exactly what Broods answered (or the saved gender). Otherwise rules + Autofill + safe defaults, same as apply-any.
    const broodsOnly = globalThis.oddsBroodsOnly === true
    // Same key Broods' answers were kept under (job-specific questions carry the job id, which sits on the kit, not on facts).
    const kept = facts?.remembered?.[A.applicationQuestionKey(q.label, session?.kit?.job_id ?? facts?.job_id)]
    let answer = broodsOnly ? ((typeof kept === "string" && kept.trim() ? kept : null) ?? globalThis.oddsSavedGender?.(q.label, facts) ?? null) : A.answerText(q.label, facts)
    if (answer === null && !broodsOnly && typeof A.resolveAgentAnswer === "function") {
      answer = A.resolveAgentAnswer(q.label, facts, q.options || [])
    }
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
      // Some steps hide the input behind its label: the label is what takes the click.
      if (!q.el[i].checked) (q.group.querySelector(`label[for="${CSS.escape(q.el[i].id || "__none__")}"]`) || q.el[i].closest("label"))?.click()
      if (!q.el[i].checked) { q.el[i].checked = true; for (const name of ["input", "change", "click"]) q.el[i].dispatchEvent(new Event(name, { bubbles: true })) }
      return q.el[i].checked
    }
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
  let lastReport = 0
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
    const changed = bar.textContent !== text || bar.dataset.state !== state
    if (changed || Date.now() - lastReport > 4000) {
      lastReport = Date.now()
      ask({ type: "application-progress", status, message: text })
    }
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
  let broodsStepSig = ""
  let broodsStepCalls = 0
  /** Broods reads this Easy Apply step once (all empty questions with their choices); the fill types exactly its answers. */
  async function broodsStep(qs) {
    if (globalThis.oddsBroodsOnly !== true || broodsStepCalls >= 15 || !session?.kit) return
    const facts = session.kit.facts
    const open = qs.filter((q) => q.kind !== "checkbox" && !answered(q) && !(facts.remembered || {})[A.applicationQuestionKey(q.label, session.kit.job_id)] && !globalThis.oddsSavedGender?.(q.label, facts))
    if (!open.length) return
    const sig = open.map((q) => q.label).join("|")
    if (sig === broodsStepSig) return
    broodsStepSig = sig
    broodsStepCalls += 1
    say(session.modal, "Broods is reading this step…", "filling")
    const res = await ask({
      type: "suggest-answers",
      url: session.job?.url || location.href,
      broods_only: true,
      questions: open.slice(0, 30).map((q) => ({
        key: A.applicationQuestionKey(q.label, session.kit.job_id),
        label: A.questionText(q.label),
        kind: q.kind === "radio" ? "radio" : q.kind === "select" ? "select" : q.kind === "textarea" ? "textarea" : q.kind === "number" ? "number" : "text",
        ...(q.options ? { options: q.options.slice(0, 80) } : {}),
      })),
    }, 35000)
    for (const a of (Array.isArray(res?.accepted) ? res.accepted : [])) {
      if (typeof a?.key !== "string" || typeof a?.answer !== "string" || !a.answer.trim()) continue
      facts.remembered = { ...(facts.remembered || {}), [a.key]: a.answer.slice(0, 1000) }
    }
  }
  async function fillStep(modal) {
    const qs = questionsOf(modal)
    await broodsStep(qs)
    const besideCountry = qs.some((q) => /country code|landcode/i.test(q.label))
    let left = 0
    for (const q of qs) {
      q.group.classList.remove("odds-ask")
      const valid = () => (Array.isArray(q.el) ? q.el : [q.el]).every(e => e.getAttribute("aria-invalid") !== "true" && (!e.willValidate || e.validity.valid))
      // Already answered (incl. Yes selected) — never keep an orange outline; LinkedIn often leaves aria-invalid until Next.
      if (answered(q)) {
        if (!valid() && await fill(q, session.kit.facts, besideCountry)) await sleep(50)
        if (answered(q)) {
          q.group.dataset.odds = "filled"
          continue
        }
      }
      if (await fill(q, session.kit.facts, besideCountry)) {
        await sleep(50)
        if (answered(q)) {
          q.group.dataset.odds = "filled"
          continue
        }
      }
      // Non-consent checkboxes are never the person's homework; consent that failed to tick still counts.
      if (q.kind === "checkbox" && !A.isConsentCheckbox?.(q.label)) continue
      // Empty and unknown — outline for the person (after Broods gets a turn in run()).
      q.group.classList.add("odds-ask")
      left++
    }
    await session.handoff?.publish(qs.filter(q => q.group.classList.contains("odds-ask") && !answered(q)), session.kit.facts)
    if (await chooseCv(modal, session.kit) === false) left++
    return left
  }

  /** Compact Easy Apply snapshot for one stuck scan (no field values / passwords). */
  function pageSnapshot(modal) {
    const qs = questionsOf(modal)
    const errors = [...modal.querySelectorAll("[data-test-form-element], fieldset, [role=alert]")]
      .map((el) => (el.innerText || "").replace(/\s+/g, " ").trim())
      .filter((t) => /this field is required|is verplicht|est obligatoire|aria-invalid/i.test(t) || t.length < 80 && /required/i.test(t))
      .slice(0, 10)
    const fieldStates = qs.map((q) => ({
      label: q.label,
      kind: q.kind,
      required: q.kind !== "checkbox",
      answered: answered(q),
      fillFailed: !answered(q) && typeof A.answerText === "function" && Boolean(A.answerText(q.label, session?.kit?.facts || {})),
    }))
    const censor_flags = typeof A.classifyCensorFlags === "function"
      ? A.classifyCensorFlags({
        fields: fieldStates,
        hasForm: qs.length > 0,
        hasApplyCta: false,
        hasNext: Boolean(nextButton(modal)),
        captcha: false,
        account: Boolean(modal.querySelector('input[type="password"]')),
        stuckLoop: false,
        listingGone: false,
        onReview: Boolean(submitButton(modal)),
      })
      : []
    return {
      title: (modal.querySelector("h2, h1, h3")?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 120),
      headings: [...modal.querySelectorAll("h1, h2, h3")].map((h) => (h.innerText || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 5),
      errors,
      fields: qs.slice(0, 25).map((q) => ({
        label: q.label.slice(0, 120),
        kind: q.kind,
        required: true,
        empty: !answered(q),
        key: A.applicationQuestionKey(q.label, session?.kit?.job_id),
        // Broods picks an exact option for a dropdown or Yes/No instead of leaving it to the person.
        ...(q.options ? { options: q.options.slice(0, 20).map((o) => String(o).slice(0, 80)) } : {}),
      })),
      buttons: buttonsOf(modal).map(labelOfButton).filter((t) => t.length >= 2 && t.length <= 80).slice(0, 40),
      censor_flags,
    }
  }

  /**
   * Stuck on Easy Apply: force required consents, one page-scan LLM, then stop if still stuck.
   * Never loops the LLM.
   */
  let scannedSig = ""
  async function assistStuckStep(modal) {
    // Required / aria-invalid checkboxes LinkedIn blocked on (Redcare "I consent" etc.).
    for (const c of modal.querySelectorAll('input[type="checkbox"]')) {
      if (!shown(c) || c.checked) continue
      const need = c.required || c.getAttribute("aria-required") === "true" || c.getAttribute("aria-invalid") === "true"
        || /this field is required|is verplicht|est obligatoire/i.test(c.closest("[data-test-form-element], fieldset, div")?.innerText || "")
      if (!need) continue
      const around = (c.closest("[data-test-form-element], fieldset, label")?.innerText || c.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim()
      if (/\b(gender|race|ethnic|disabilit|veteran|criminal|conviction)\b/i.test(around) && !/\bprivacy notice\b/i.test(around)) continue
      c.click()
      if (!c.checked) c.closest("label")?.click()
      if (!c.checked) {
        c.checked = true
        for (const name of ["input", "change", "click"]) c.dispatchEvent(new Event(name, { bubbles: true }))
      }
    }
    const qs = questionsOf(modal)
    const open = qs.filter((q) => q.kind !== "checkbox" && !answered(q))
    if (open.length) {
      // Broods first, from Autofill and the CV: only what it cannot answer goes to the person (a dropdown stays a dropdown).
      const payload = open.slice(0, 20).map((q) => ({
        key: A.applicationQuestionKey(q.label, session.kit.job_id),
        label: A.questionText(q.label),
        kind: q.kind === "radio" ? "radio" : q.kind === "select" ? "select" : q.kind === "textarea" ? "textarea" : q.kind === "number" ? "number" : "text",
        ...(q.options ? { options: q.options.slice(0, 80) } : {}),
      }))
      say(modal, "Asking Odds for answers from your profile…", "filling")
      const suggested = await ask({ type: "suggest-answers", url: session.job?.url || location.href, questions: payload }, 25000)
      if (suggested?.status === "ok" && Array.isArray(suggested.accepted)) {
        for (const a of suggested.accepted) {
          if (typeof a?.key !== "string" || typeof a?.answer !== "string" || !a.answer.trim()) continue
          session.kit.facts.remembered = { ...(session.kit.facts.remembered || {}), [a.key]: a.answer.slice(0, 1000) }
        }
        if (suggested.accepted.length) await fillStep(modal)
      }
      const still = questionsOf(modal).filter((q) => q.kind !== "checkbox" && !answered(q))
      if (still.length && session.handoff) await session.handoff.publish(still, session.kit.facts)
      await session.handoff?.refresh(session.kit.facts)
    }
    const sig = signature(modal)
    if (scannedSig !== sig) {
      scannedSig = sig
      say(modal, "No progress — Broods is reading this step…", "filling")
      const scan = await ask({ type: "suggest-scan", url: session.job?.url || location.href, status: "stuck_easy_apply", snapshot: pageSnapshot(modal) }, 45000)
      if (scan?.stage === "captcha") {
        say(modal, "Captcha on the page — open the tab when you can, then Odds continues.", "ask")
        return "stop"
      }
      if (scan?.stage === "account" || (scan?.action === "wait_human" && scan?.stage !== "form" && scan?.stage !== "review")) {
        say(modal, "Sign in or make the account yourself; odds fills in the form after.", "ask")
        return "stop"
      }
      if (Array.isArray(scan?.answers)) {
        for (const a of scan.answers) {
          if (typeof a?.key !== "string" || typeof a?.answer !== "string" || !a.answer.trim()) continue
          session.kit.facts.remembered = { ...(session.kit.facts.remembered || {}), [a.key]: a.answer.slice(0, 1000) }
        }
      }
      if (scan?.action === "click" && typeof scan.text === "string") {
        const btn = buttonsOf(modal).find((b) => labelOfButton(b) === scan.text)
        // Never on to the next step while a question here is still empty: it waits for its answer (from the person or the phone).
        const pastEmpty = btn && NEXT.test(labelOfButton(btn)) && questionsOf(modal).some((q) => q.kind !== "checkbox" && !answered(q))
        if (btn && !isSubmit(btn) && !pastEmpty) btn.click()
      }
    }
    await fillStep(modal)
    return "retry"
  }

  // ---- Broods drives the Easy Apply window (MCP): same commands as on employer sites, done inside LinkedIn's dialog. ----
  // Hard rules here too, whatever Broods asks: never Submit/Send, never a password, nothing outside the dialog.
  const DRIVE_DENY = /\b(submit|send application|send|password|captcha|sign[\s-]?up|register|create (an )?account|delete|remove|discard)\b/i
  const drivePrefilled = new WeakMap()
  async function drivePrefillModal(modal) {
    const qs = questionsOf(modal)
    const country = qs.some(q => /country code|landcode/i.test(q.label))
    for (const q of qs) {
      if (answered(q) || q.kind === "checkbox" || !/^(first name|given name|last name|family name|surname|full name|name|email|email address|phone|phone number|mobile|mobile number|linkedin|linkedin url|city|current location|location)\s*[*:]?$/i.test(q.label.trim())) continue
      if (!A.answerText(q.label, session.kit.facts)) continue
      if (await fill(q, session.kit.facts, country)) drivePrefilled.set(Array.isArray(q.el) ? q.el[0] : q.el, qValue(q))
    }
    await chooseCv(modal, session.kit)
  }
  let driveQs = new Map()
  let driveBtns = new Map()
  const qValue = (q) => {
    if (q.kind === "select") return q.el.selectedIndex > 0 ? q.options[q.el.selectedIndex] : ""
    if (q.kind === "radio") return q.options[q.el.findIndex((r) => r.checked)] ?? ""
    if (q.kind === "checkbox") return q.el.every((c) => c.checked) ? "checked" : ""
    return String(q.el.value ?? "").slice(0, 300)
  }
  function driveModalPage(modal) {
    driveQs = new Map()
    driveBtns = new Map()
    const fields = questionsOf(modal).slice(0, 60).map((q, i) => {
      const id = `f${i}`
      driveQs.set(id, q)
      const consent = q.kind === "checkbox" && Boolean(A.isConsentCheckbox?.(q.label))
      return { id, label: q.label.slice(0, 300), kind: q.kind === "text" && q.typeahead ? "typeahead" : q.kind, filled: answered(q), ...(drivePrefilled.get(Array.isArray(q.el) ? q.el[0] : q.el) === qValue(q) && answered(q) ? { by: "odds" } : {}), value: qValue(q), ...(q.options?.length ? { options: q.options.slice(0, 60) } : {}), ...(consent ? { consent: true } : {}) }
    })
    const cvCards = documentRadios(modal)
    const cvUpload = modal.querySelector('input[type="file"]') || [...modal.querySelectorAll("button")].some((b) => /^upload (resume|cv)$/i.test(labelOfButton(b)))
    // The CV counts as done only when it is the one Odds keeps for this job (LinkedIn often pre-selects an older one).
    const want = [session.kit?.cv?.file_name, session.kit?.cv?.name].filter(Boolean).map((n) => String(n).toLowerCase().replace(/\.[a-z]+$/, ""))
    const chosen = cvCards.find((r) => r.checked)
    const chosenName = (chosen?.getAttribute("aria-label") || chosen?.closest('[role="radio"]')?.getAttribute("aria-label") || "").toLowerCase()
    const rightCv = Boolean(chosen) && (!want.length || want.some((w) => chosenName.includes(w)))
    if (cvCards.length || cvUpload) fields.push({ id: "cv", label: "Resume / CV", kind: "file", filled: rightCv, value: chosen?.getAttribute("aria-label") || "", ...(want.length ? { want: session.kit.cv.file_name || session.kit.cv.name } : {}) })
    const buttons = buttonsOf(modal).slice(0, 30).map((b, i) => {
      const id = `b${i}`
      driveBtns.set(id, b)
      const text = labelOfButton(b).slice(0, 100)
      return { id, text, ...(isSubmit(b) || DRIVE_DENY.test(text) ? { blocked: true } : {}) }
    })
    return {
      url: location.href.slice(0, 300),
      title: (modal.querySelector("h2, h1")?.innerText || "Easy Apply").trim().slice(0, 160),
      headings: [...modal.querySelectorAll("h2, h3")].map((h) => h.innerText.trim()).filter(Boolean).slice(0, 6),
      errors: [...modal.querySelectorAll("[role=alert], .artdeco-inline-feedback--error")].map((e) => e.innerText.trim()).filter(Boolean).slice(0, 8),
      captcha: false,
      password_field: Boolean(modal.querySelector('input[type="password"]')),
      fields,
      buttons,
    }
  }

  // ---- Sight: when the page tools cannot see or move something, Broods looks at a screenshot and acts at a point. ----
  let driveImageSize = null
  async function driveVision(cmd, sendResult, denyText) {
    const args = cmd.args || {}
    if (cmd.tool === "screenshot") {
      const shot = await ask({ type: "drive-shot" }, 15000).catch(() => null)
      if (!shot?.image) return { error: shot?.error || "Could not take a screenshot of this tab." }
      driveImageSize = { width: shot.width, height: shot.height, viewportWidth: shot.viewportWidth || innerWidth, viewportHeight: shot.viewportHeight || innerHeight }
      return { image: shot.image, mime: "image/jpeg", width: shot.width, height: shot.height, note: "Coordinates for click_at are pixels in this image." }
    }
    const scaleX = driveImageSize ? driveImageSize.width / driveImageSize.viewportWidth : (window.devicePixelRatio || 1)
    const scaleY = driveImageSize ? driveImageSize.height / driveImageSize.viewportHeight : (window.devicePixelRatio || 1)
    if (cmd.tool === "click_at") {
      const x = Number(args.x) / scaleX
      const y = Number(args.y) / scaleY
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, error: "x and y are needed" }
      const el = document.elementFromPoint(x, y)
      if (!el) return { ok: false, error: "nothing at that point" }
      const target = el.closest("a, button, input, select, textarea, label, [role='button'], [role='checkbox'], [role='option'], [role='radio'], [tabindex]") || el
      const words = `${target.innerText || ""} ${target.getAttribute("aria-label") || ""} ${target.value || ""}`.replace(/\s+/g, " ").trim().slice(0, 120)
      if (denyText.test(words)) return { ok: false, error: "Odds never presses this; it is the person's" }
      if (target.matches("input[type=password]")) return { ok: false, error: "passwords are the person's" }
      await sendResult({ ok: true, clicked: words || target.tagName.toLowerCase(), note: "screenshot or read_page next" })
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }))
      target.click()
      if (target.matches("input, textarea, select, [contenteditable='true']")) target.focus()
      return null
    }
    if (cmd.tool === "type_text") {
      const el = document.activeElement
      if (!el || el === document.body) return { ok: false, error: "click_at a field first" }
      if (el.matches("input[type=password]")) return { ok: false, error: "passwords are the person's" }
      const text = String(args.text ?? "").slice(0, 2000)
      if (el.matches("input, textarea")) {
        const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, (args.append ? el.value : "") + text)
        el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }))
        el.dispatchEvent(new Event("change", { bubbles: true }))
      } else if (el.isContentEditable) document.execCommand("insertText", false, text)
      return { ok: true, value: String(el.value ?? el.textContent ?? "").slice(0, 200) }
    }
    if (cmd.tool === "press_key") {
      const key = String(args.key || "Enter")
      if (!/^(Enter|Tab|Escape|ArrowDown|ArrowUp|ArrowLeft|ArrowRight|Space|Backspace)$/.test(key)) return { ok: false, error: "allowed keys: Enter, Tab, Escape, arrows, Space, Backspace" }
      const el = document.activeElement || document.body
      if (key === "Enter" && el.closest("form") && denyText.test((el.closest("form").querySelector("[type=submit]")?.innerText || "") + " ")) return { ok: false, error: "Enter here would submit; the person sends it" }
      for (const type of ["keydown", "keypress", "keyup"]) el.dispatchEvent(new KeyboardEvent(type, { key: key === "Space" ? " " : key, bubbles: true, cancelable: true }))
      return { ok: true }
    }
    if (cmd.tool === "scroll") {
      window.scrollBy({ top: Math.max(-3000, Math.min(3000, Number(args.dy) || 600)), behavior: "instant" })
      await sleep(250)
      return { ok: true, scrollY: Math.round(window.scrollY) }
    }
    return null
  }

  async function driveModalCommandRaw(modal, cmd, sendResult) {
    const args = cmd.args || {}
    if (cmd.tool === "read_page") return driveModalPage(modal)
    if (["screenshot", "click_at", "type_text", "press_key", "scroll"].includes(cmd.tool)) return driveVision(cmd, sendResult, DRIVE_DENY)
    if (cmd.tool === "options") { const q = driveQs.get(args.id); return { id: args.id, options: q?.options || [] } }
    if (cmd.tool === "upload_cv") return { ok: await chooseCv(modal, session.kit) !== false, value: documentRadios(modal).find((r) => r.checked)?.getAttribute("aria-label") || "uploaded" }
    if (cmd.tool === "upload_letter") {
      // LinkedIn's own "Upload cover letter" input on this step.
      const letter = session.kit.letter
      if (!letter) return { ok: false, error: "no cover letter for this job in Odds: finish needs_you with reason 'letter'" }
      const input = [...modal.querySelectorAll("input[type=file]")].find((i) => /cover|letter|motivat/i.test(`${i.id} ${i.name} ${i.getAttribute("aria-label") || ""} ${i.closest("div")?.innerText || ""}`))
      if (!input) return { ok: false, error: "no cover letter upload on this step" }
      const file = await ask({ type: "cv-file", doc: letter.id }, 15000)
      if (file?.status !== "ok") return { ok: false, error: "the letter could not be loaded from Odds" }
      const transfer = new DataTransfer()
      transfer.items.add(new File([Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))], file.name, { type: file.type }))
      try { input.files = transfer.files } catch { /* wrapped input */ }
      input.dispatchEvent(new Event("change", { bubbles: true }))
      await sleep(600)
      return { ok: Boolean(input.files?.length), value: file.name }
    }
    if (cmd.tool === "fill") {
      const facts = session.kit.facts
      const besideCountry = [...driveQs.values()].some((q) => /country code|landcode/i.test(q.label))
      const results = []
      for (const it of (Array.isArray(args.fields) ? args.fields.slice(0, 40) : [])) {
        const q = driveQs.get(it?.id)
        const value = typeof it?.value === "string" ? it.value.slice(0, 2000) : ""
        if (!q || !(Array.isArray(q.el) ? q.el[0] : q.el)?.isConnected) { results.push({ id: it?.id, ok: false, error: "field gone, read_page again" }); continue }
        if (q.kind === "checkbox") {
          // Consent yes (the person's choice in Odds): Broods may tick it.
          const want = /^(yes|true|check|checked|on|1)$/i.test(value.trim())
          for (const c of q.el) if (c.checked !== want) c.click()
          results.push({ id: it.id, ok: q.el.every((c) => c.checked === want) })
          continue
        }
        // fill() answers from what Broods said for this question (kept under its key), exactly like the Broods-only fill.
        facts.remembered = { ...(facts.remembered || {}), [A.applicationQuestionKey(q.label, session.kit.job_id)]: value }
        const ok = await Promise.race([fill(q, facts, besideCountry).catch(() => false), sleep(8000).then(() => false)])
        await sleep(60)
        results.push({ id: it.id, ok: Boolean(ok) && answered(q), value: qValue(q), ...(ok ? {} : { error: "no matching option or LinkedIn did not take it" }) })
      }
      return { results }
    }
    if (cmd.tool === "click") {
      const b = driveBtns.get(args.id)
      if (!b || !b.isConnected) return { ok: false, error: "button gone, read_page again" }
      const text = labelOfButton(b)
      if (isSubmit(b) || DRIVE_DENY.test(text)) return { ok: false, error: "Odds never presses this; it is the person's" }
      if (/^(next|continue|review|review your application)$/i.test(text.trim())) {
        const snap = driveModalPage(modal)
        const empty = (snap.fields || []).filter((f) => f.required && !f.filled && !f.consent)
        if (empty.length) return { ok: false, error: `required fields still empty: ${empty.map((f) => f.label).join("; ").slice(0, 300)}`, unfilled: empty.map((f) => f.label).slice(0, 12), page: snap }
      }
      const before = signature(modal)
      b.click()
      await changed(modal, before, 4000)
      return { ok: true, clicked: text.slice(0, 100) }
    }
    return { error: `Unknown tool ${cmd.tool}` }
  }
  async function driveModalCommand(modal, cmd, sendResult) {
    const result = await driveModalCommandRaw(modal, cmd, sendResult)
    const current = session?.modal?.isConnected ? session.modal : modal
    if (result && cmd.tool !== "read_page" && cmd.tool !== "screenshot") {
      await sleep(180)
      return { ...result, page: current.isConnected ? driveModalPage(current) : { url: location.href, fields: [], buttons: [], changed: true } }
    }
    return result
  }
  /** Broods drives this Easy Apply window until only Submit is left (or it needs the person); the bar says each step and the end. */
  async function driveModal(modal) {
    await drivePrefillModal(modal)
    say(modal, "Broods is applying in this window…", "filling")
    const url = session.job?.url || location.href
    const start = await ask({ type: "drive", op: "start", url, page: url, run_id: null }, 30000)
    const runId = start?.run_id
    if (!runId) return say(modal, start?.error ? `Broods could not start: ${start.error}` : "Broods could not start. Press Apply with Odds again.", "ask")
    let lostSince = 0
    let fresh = true
    let endedAt = 0
    let resumedFor = 0
    // The person answering the Easy Apply form themselves: typing in a field or picking a choice (Broods' events are synthetic; the Odds
    // bar is not the form). Clicking Next, scrolling or bringing the window forward is not filling in and must not pause Broods.
    const person = { at: 0 }
    const FORM_CONTROL = "input:not([type=button]):not([type=submit]), textarea, select, [contenteditable='true'], [role='textbox'], [role='combobox'], [role='option'], [role='radio'], [role='checkbox'], [role='listbox']"
    const mark = (e) => {
      const t = e.target
      if (!e.isTrusted || !t?.closest || t.closest(".odds-apply-bar")) return
      if (e.type === "keydown" && /^(Tab|Escape|Shift|Control|Alt|Meta|PageUp|PageDown|Home|End|ArrowUp|ArrowDown|F\d+)$/.test(e.key)) return
      if (t.closest(FORM_CONTROL) || t.closest("label")) person.at = Date.now()
    }
    for (const type of ["keydown", "mousedown", "input", "paste"]) modal.addEventListener(type, mark, true)
    for (let i = 0; i < 4000 && modal.isConnected && session?.modal === modal; i++) {
      // The person is filling in: Broods waits, then carries on around what they entered.
      if (!endedAt && Date.now() - person.at < 20000) {
        say(modal, "You're filling in — Broods waits, then carries on around what you entered.", "filling")
        await ask({ type: "drive", op: "next", run_id: runId, hold: true }, 15000).catch(() => null)
        await sleep(3000)
        continue
      }
      // Waiting for the person: once they acted here and went quiet, the same run carries on by itself.
      if (endedAt && resumedFor !== endedAt && person.at > endedAt && Date.now() - person.at >= 20000) {
        resumedFor = endedAt
        const ok = await ask({ type: "drive", op: "continue", run_id: runId }, 15000).catch(() => null)
        if (ok?.ok) { endedAt = 0; say(modal, "Broods is carrying on…", "filling") }
      }
      const next = await ask({ type: "drive", op: "next", run_id: runId, fresh }, 35000).catch(() => null)
      // No answer at all is the connection, not Broods: say so and keep trying for 5 minutes.
      if (!next || next.status === "error") {
        lostSince ||= Date.now()
        if (Date.now() - lostSince > 300000) return say(modal, "Odds lost its connection while Broods was applying. Press Apply with Odds again to carry on.", "ask")
        say(modal, "Connection lost — Odds keeps going as soon as it is back…", "filling")
        await sleep(Math.min(10000, 1500 + (Date.now() - lostSince) / 10))
        continue
      }
      fresh = false
      if (lostSince) { lostSince = 0; say(modal, "Broods is applying in this window…", "filling") }
      if (next.done) {
        // Ended for the person: keep an ear on the run for 30 minutes so Continue in the tracker carries on here.
        if (!endedAt) {
          endedAt = Date.now()
          const why = { captcha: "Captcha on the page — tick it and Broods carries on.", account: "Sign in to LinkedIn — Broods carries on after.", letter: "This step asks for a cover letter — add one for this job in Odds (Documents) and Broods carries on.", questions: "Fill in what is outlined here or answer in Odds, and Broods carries on." }[next.reason] || ""
          const text = [why, next.message || ""].filter(Boolean).join(" ")
          if (next.status === "review") say(modal, next.message || "Filled in by Broods. Check everything, then press Submit yourself.", "done")
          else if (next.status === "needs_you") say(modal, text || "Broods needs you for a step.", "ask")
          else say(modal, `Odds assist could not finish this Easy Apply step after assist: ${text || "Broods stopped."}`, "ask")
        }
        // The tab stays watched while it is open (the tracker shows the run only then): 30 minutes waiting for the person, 3 hours at review.
        if (["submitted", "stopped", "failed"].includes(next.status) || next.reason === "closed" || Date.now() - endedAt > (next.status === "review" ? 10800000 : 1800000)) return
        await sleep(3000)
        continue
      }
      if (endedAt) { endedAt = 0; say(modal, "Broods is carrying on…", "filling") }
      if (next.command) {
        const cmd = next.command
        const note = typeof cmd.note === "string" ? cmd.note.trim() : ""
        say(modal, note ? `Broods: ${note}` : cmd.tool === "read_page" ? "Broods is reading this step…" : cmd.tool === "fill" ? "Broods is filling in your answers…" : cmd.tool === "click" ? "Broods is moving to the next step…" : "Broods is working…", "filling")
        let sent = false
        let stale = false
        const sendResult = async (result) => {
          if (stale) return
          if (result && !result.page && cmd.tool === "click_at") result = { ...result, page_pending: true }
          sent = true
          for (let t = 0; t < 4; t++) {
            const ok = await ask({ type: "drive", op: "result", run_id: runId, id: cmd.id, result, doc_gen: next.doc_gen }, 15000).catch(() => null)
            // (The run's own end — and why it ended — comes from the next drive-next, never from here.)
            if (ok?.stale === true || (ok && ok.ok === false && ok.stale)) { stale = true; return }
            if (ok && ok.status !== "error" && ok.ok !== false) return
            await sleep(2000 * (t + 1))
          }
        }
        const result = await driveModalCommand(modal, cmd, sendResult).catch((e) => ({ error: String(e?.message || e).slice(0, 200) }))
        if (stale) continue
        if (!sent) await sendResult(result)
      }
    }
  }
  async function run(modal) {
    const job = PAGE.site.open?.()
    session = { modal, job, kit: null, uploaded: false, submitted: false, handoff: globalThis.oddsApplicationHandoff?.(job?.url || location.href, ask) }
    say(modal, "odds is filling this in…")
    const kit = await askAgain({ type: "apply-kit", url: job?.url || location.href })
    if (!kit || kit.status === "connect") return say(modal, "Connect odds (its icon in the toolbar) to have this filled in.", "problem")
    if (kit.status !== "ok") return say(modal, "odds could not fill this in right now. Fill it in as usual.", "problem")
    session.kit = kit
    session.handoff = globalThis.oddsApplicationHandoff?.(job?.url || location.href, ask, kit.job_id)
    globalThis.oddsDismissCookies?.()
    // Broods drives (switch on in Odds, the default): it applies in this window from the person's profile and Autofill.
    if (kit.broods_drive === true) {
      await driveModal(modal)
      return
    }
    for (let step = 0; step < 15 && modal.isConnected && session?.modal === modal; step++) {
      await sleep(250)
      let left = await fillStep(modal)
      const next = nextButton(modal)
      const before = signature(modal)
      if (left > 0) {
        // Broods before human — never freeze on “Answer the N marked” without suggest-answers + one scan.
        say(modal, "Filling what we know — asking Odds for the rest…", "filling")
        const outcome = await assistStuckStep(modal)
        if (outcome === "stop") return
        left = await fillStep(modal)
        if (left === 0) { step--; continue }
        const nextAfter = nextButton(modal)
        say(modal, `odds filled in what it knows. Answer the ${left === 1 ? "marked question" : `${left} marked questions`}, then press ${nextAfter ? "Next" : "Review"}: odds keeps your answers for the next form.`, "ask")
        // Answers from the side panel arrive without taking over the browser.
        let waited = 0
        while (modal.isConnected && session?.modal === modal && signature(modal) === before && waited < 120) {
          await sleep(500)
          waited++
          if (await session.handoff?.refresh(session.kit.facts)) {
            if (await fillStep(modal) === 0) break
          }
          // Re-count outlines so a filled radio doesn’t keep saying “3 marked”.
          left = questionsOf(modal).filter((q) => q.kind !== "checkbox" && q.group.classList.contains("odds-ask") && !answered(q)).length
          if (left === 0) break
        }
        step--
        continue
      }
      if (next) {
        say(modal, "odds is filling this in…")
        await sleep(300)
        next.click()
        if (!(await changed(modal, before, 4000))) {
          // Force consents + one page-scan, one Next retry, then stop.
          say(modal, "No progress — asking Odds to unblock this step…", "busy")
          const outcome = await assistStuckStep(modal)
          if (outcome === "stop") return
          const again = nextButton(modal)
          if (again) {
            const sig = signature(modal)
            again.click()
            if (await changed(modal, sig, 4000)) continue
          }
          say(modal, "Odds assist could not finish this Easy Apply step. Fix what’s marked, then press Next — Odds will continue.", "ask")
          return
        }
        continue
      }
      if (submitButton(modal)) {
        const empty = questionsOf(modal).filter((q) => q.kind !== "checkbox" && !answered(q))
        if (empty.length || !formActuallyFilled(modal)) {
          for (const q of empty.length ? empty : questionsOf(modal).filter((q) => q.kind !== "checkbox" && !answered(q))) q.group.classList.add("odds-ask")
          say(modal, `odds filled in what it knows. Answer the marked questions, then press Review: odds keeps your answers.`, "ask")
          await assistStuckStep(modal)
          return
        }
        // Censor law: never Ready while required/contact fields are empty in the DOM.
        if (!formActuallyFilled(modal)) {
          say(modal, "odds filled in what it knows. Answer the marked questions, then press Review: odds keeps your answers.", "ask")
          await assistStuckStep(modal)
          return
        }
        say(modal, "Filled in by odds. Check everything, then press Submit yourself.", "done")
      }
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
    // Classic class/id first. Offsite jobs (Hunkemöller etc.) often use aria-label "Apply to <title> at <company>"
    // with visible text "Apply" — the old /^apply$/ missed that and timed out → false Stuck.
    const classic = [...document.querySelectorAll("#jobs-apply-button-id, .jobs-apply-button, button.jobs-apply-button--top-card, a.jobs-apply-button")].find(shown)
    if (classic) return classic
    const APPLY_CTA = /^(easy\s+)?apply(\s+to\b|\s+on\b|\s*$)/i
    return [...document.querySelectorAll("main button, main a[role='button'], main a.artdeco-button, button, a[role='button']")].find((b) => {
      if (!shown(b) || b.closest("[data-job-id], [data-occludable-job-id], .job-card-container, a[href*='similar-jobs'], dialog, [data-test-modal-id]")) return false
      const label = labelOfButton(b)
      if (!APPLY_CTA.test(label) && !APPLY_CTA.test((b.innerText || "").replace(/\s+/g, " ").trim())) return false
      return !/\b(save|saved|follow|share|message|inmail)\b/i.test(label)
    }) || null
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

  /** This Chrome is signed into LinkedIn (session cookie or Me nav) — guest Apply hangs forever without this. */
  function linkedInSignedIn() {
    if (/JSESSIONID=/i.test(document.cookie)) return true
    return Boolean(document.querySelector(
      ".global-nav__me, button.global-nav__primary-link-me-menu-trigger, img.global-nav__me-photo, [data-control-name='identity_welcome_message'], .scaffold-layout__content .global-nav__me",
    ))
  }
  function linkedInSignInWall() {
    // LinkedIn's own sign-up / login / auth-wall pages are the wall, whatever else the page shows (a guest "Apply" lands on /signup).
    if (/\/authwall|\/uas\/login|\/login\b|\/checkpoint\/|\/signup\//i.test(location.pathname)) return true
    // Once this Chrome has a LinkedIn session, leftover guest copy must not keep us on Sign-in.
    if (linkedInSignedIn()) return false
    if (document.querySelector(".authwall-join-form, form.login__form, #username, input#session_key, input[name=session_key]")) return true
    const snip = ((document.body && (document.body.innerText || document.body.textContent)) || "").replace(/\s+/g, " ").slice(0, 2800)
    return /\b(sign in to view more|join to apply|sign in to apply|sign in to see (more|who)|join linkedin)\b/i.test(snip)
  }
  // Same wording shape as Indeed/Glassdoor in apply-any.js — Account chip + “Open tab: account or login”.
  const LINKEDIN_SIGNIN_MSG = "Sign in to LinkedIn in this Chrome tab first — then Odds continues. Odds never types your password."
  /** Non-secret flag for Connect UI only — auth stays in Chrome cookies. */
  async function noteBoardSession(board) {
    try {
      const { oddsBoardSession = {} } = await chrome.storage.local.get("oddsBoardSession")
      oddsBoardSession[board] = Date.now()
      await chrome.storage.local.set({ oddsBoardSession })
    } catch {
      // storage blocked: session cookies still keep the person signed in
    }
  }
  /** Stop hanging on “Looking for Apply…” when the person is logged out; wait until they sign in, then resume. */
  async function ensureLinkedInSignedIn(intent) {
    for (let i = 0; i < 8 && !linkedInSignedIn() && !linkedInSignInWall() && !applyButton() && !modalOnPage(); i++) await sleep(200)
    if (linkedInSignedIn() || applyButton() || modalOnPage()) {
      if (linkedInSignedIn()) void noteBoardSession("linkedin")
      return true
    }
    say(document.body, LINKEDIN_SIGNIN_MSG, "ask")
    document.body.querySelector(".odds-apply-bar")?.classList.add("odds-apply-float")
    for (let i = 0; i < 600; i++) {
      await sleep(500)
      if (linkedInClosed()) {
        await reportLinkedInClosed(intent)
        return false
      }
      if (linkedInSignedIn() || applyButton() || modalOnPage()) {
        void noteBoardSession("linkedin")
        say(document.body, "Signed in to LinkedIn — continuing…", "filling")
        return true
      }
      if (i % 20 === 0) say(document.body, LINKEDIN_SIGNIN_MSG, "ask")
    }
    say(document.body, "Still not signed in to LinkedIn. Sign in on this tab, then press Open application tab.", "ask")
    return false
  }

  /** LinkedIn / Chrome security challenge — Apply cannot move until the person confirms. */
  function linkedInVerifyWall() {
    if (/\/checkpoint\//i.test(location.pathname)) return true
    const t = ((document.body && (document.body.innerText || document.body.textContent)) || "").replace(/\s+/g, " ").slice(0, 3000)
    return /\bverify it'?s you\b|\bconfirm it'?s you\b|\bsecurity (verification|challenge)\b|\blet'?s do a quick security check\b/i.test(t)
  }

  // LinkedIn: "Not currently accepting applications" / "No longer…" — report Closed even if SPA paints late or after apply-started.
  const CLOSED_RX = /not currently accepting applications|no longer accepting applications|this job is no longer available|applications are closed|vacature gesloten|niet meer mogelijk om te solliciteren/i
  function linkedInClosed() {
    const roots = [
      ...document.querySelectorAll(
        ".jobs-search__job-details, .jobs-details__main-content, .jobs-unified-top-card, .job-view-layout, .artdeco-inline-feedback, [class*='jobs-details-top-card'], main",
      ),
      document.body,
    ]
    for (const root of roots) {
      if (!root) continue
      if (CLOSED_RX.test((root.innerText || root.textContent || "").replace(/\s+/g, " "))) return true
    }
    return false
  }
  let closedReported = false
  async function reportLinkedInClosed(intent) {
    if (closedReported || !intent) return
    closedReported = true
    say(document.body, "This job is no longer accepting applications on LinkedIn. No application was submitted.", "problem")
    document.body.querySelector(".odds-apply-bar")?.classList.add("odds-apply-float")
    await ask({ type: "apply-started" }).catch(() => null)
    await ask({ type: "job-closed", url: intent.job || location.href }).catch(() => null)
  }

  /** True once Easy Apply modal is up or we left this LinkedIn job (employer tab/nav). Never treat a dead Apply click as success. */
  async function waitLeftLinkedInJob(wanted, ms = 10000) {
    const stillJob = globalThis.oddsSites.jobLink(location.href)?.id
    const steps = Math.max(1, Math.ceil(ms / 500))
    for (let t = 0; t < steps; t++) {
      await sleep(500)
      if (modalOnPage()) return true
      const nowId = globalThis.oddsSites.jobLink(location.href)?.id
      if (!nowId || (wanted && nowId !== wanted)) return true
      if (stillJob && nowId !== stillJob) return true
    }
    return false
  }

  /**
   * Broods/Edge: pick Apply when script rules missed the CTA (aria-label "Apply to…", late paint, etc.).
   * LinkedIn opener used to Stuck after 15s without ever calling the agent — Broods never got a turn.
   * Offsite: only return true if the click actually left the job (Bouwinvest no-op used to leave Filling forever).
   */
  async function assistOpenApply(wanted) {
    const visible = [...document.querySelectorAll("a, button, a[role='button'], button[role='button']")].filter(shown)
    const buttons = visible.map((b) => {
      const text = labelOfButton(b) || (b.innerText || "").replace(/\s+/g, " ").trim()
      if (text.length < 2 || text.length > 80) return null
      const a = b.closest("a") || (b.tagName === "A" ? b : null)
      const href = a && "href" in a ? String(a.href || "") : ""
      return { text, href: href.slice(0, 200), hint: `${b.id || ""} ${b.className || ""}`.slice(0, 120) }
    }).filter(Boolean).slice(0, 40)
    if (!buttons.length) return false
    // LinkedIn's guest Apply lands on its sign-up page (same document): that is the person's sign-in, never a question for Broods.
    if (linkedInSignInWall()) { say(document.body, LINKEDIN_SIGNIN_MSG, "ask"); document.body.querySelector(".odds-apply-bar")?.classList.add("odds-apply-float"); return true }
    say(document.body, "Asking Odds how to open the application…", "filling")
    const clickWant = async (want) => {
      if (!want || /\b(submit|password|sign[\s-]?up|register|save|follow|share)\b/i.test(want)) return false
      const el = visible.find((b) => labelOfButton(b) === want || (b.innerText || "").replace(/\s+/g, " ").trim() === want)
      if (!el) return false
      await ask({ type: "apply-started" })
      if (/easy apply/i.test(want)) { el.click(); return true }
      const there = await offsiteUrl(wanted)
      if (there) { await ask({ type: "apply-go", url: there }); return true }
      await ask({ type: "apply-follow" })
      // Inactive Apply tabs block window.open — arm briefly so the employer tab can open.
      const arm = await ask({ type: "apply-arm-offsite" }).catch(() => null)
      el.click()
      await ask({ type: "apply-disarm-offsite", wasActive: arm?.wasActive === true }).catch(() => null)
      // Dead click (popup blocked / Verify wall): stay false so caller surfaces ask — never silent Filling.
      return await waitLeftLinkedInJob(wanted, 4000)
    }
    // Either question gives way the moment LinkedIn shows its sign-in / sign-up page: that is the person's to do, said at once.
    const wall = () => new Promise((resolve) => { const t = setInterval(() => { if (linkedInSignInWall()) { clearInterval(t); resolve("wall") } }, 800); setTimeout(() => clearInterval(t), 46000) })
    const signIn = () => { say(document.body, LINKEDIN_SIGNIN_MSG, "ask"); document.body.querySelector(".odds-apply-bar")?.classList.add("odds-apply-float"); return true }
    const action = await Promise.race([ask({
      type: "suggest-action",
      url: location.href,
      buttons,
      status: "linkedin_open_apply",
      force_llm: true,
    }, 45000).catch(() => null), wall()])
    if (action === "wall") return signIn()
    if (action?.action === "click" && typeof action.text === "string" && await clickWant(action.text.replace(/\s+/g, " ").trim())) return true
    say(document.body, "No progress — Broods is reading this page…", "filling")
    const scan = await Promise.race([wall(), ask({
      type: "suggest-scan",
      url: location.href,
      status: "linkedin_open_apply",
      snapshot: {
        title: document.title.slice(0, 120),
        headings: [...document.querySelectorAll("h1, h2")].map((h) => (h.innerText || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 5),
        errors: [],
        fields: [],
        buttons: buttons.map((b) => b.text),
        facts: {},
      },
    }, 45000).catch(() => null)])
    if (scan === "wall" || linkedInSignInWall()) return signIn()
    if (scan?.action === "click" && typeof scan.text === "string" && await clickWant(scan.text.replace(/\s+/g, " ").trim())) return true
    return false
  }

  // Open Easy Apply / offsite Apply. Also re-run on Open tab (application-continue) — started=true used to no-op and leave Filling dead.
  let openingApply = false
  let closedWatchOn = false
  async function openLinkedInApply(opts = {}) {
    const resume = opts.resume === true
    if (openingApply) return
    openingApply = true
    try {
      let intent = null
      // Only a tab Odds is applying in shows the bar: a LinkedIn page the person just browses stays untouched. A silent wait first,
      // since the application can be handed to this tab a moment after it loads.
      for (let i = 0; i < (resume ? 8 : 25) && !intent; i++) {
        intent = (await askAgain({ type: "apply-intent" }))?.intent || null
        if (!intent) await sleep(200)
      }
      if (!intent) {
        if (resume) {
          if (linkedInSignInWall() || (!linkedInSignedIn() && !applyButton())) say(document.body, LINKEDIN_SIGNIN_MSG, "ask")
          else say(document.body, "Odds did not start this tab. Press Apply with Odds again, or Open application tab.", "ask")
          document.body.querySelector(".odds-apply-bar")?.classList.add("odds-apply-float")
        }
        return
      }
      // Already taken to the review (or sent): back on the job later (a reload, a new visit) it is not started again.
      if (!resume && intent.started && ["ready", "submitted"].includes(intent.status)) return
      if (!resume) say(document.body, "Opening the application…", "filling")
      if (linkedInSignInWall()) {
        say(document.body, LINKEDIN_SIGNIN_MSG, "ask")
        document.body.querySelector(".odds-apply-bar")?.classList.add("odds-apply-float")
      }
      // Back on the LinkedIn job after the employer's page (the person pressed Back) or paused earlier: never re-open it by itself.
      const backHere = performance.getEntriesByType("navigation")[0]?.type === "back_forward"
      if (!resume && (intent.paused || (intent.started && backHere))) {
        const paused = "You went back a step, so Odds paused here. Press Next or Apply yourself and Odds carries on, or press Apply with Odds again."
        say(document.body, paused, "ask")
        document.body.querySelector(".odds-apply-bar")?.classList.add("odds-apply-float")
        await ask({ type: "apply-pause", message: paused }).catch(() => null)
        return
      }
      if (!closedWatchOn) {
        closedWatchOn = true
        const watchClosed = () => { if (linkedInClosed()) void reportLinkedInClosed(intent) }
        watchClosed()
        const closedMo = new MutationObserver(() => watchClosed())
        closedMo.observe(document.body, { childList: true, subtree: true, characterData: true })
        const closedPoll = window.setInterval(watchClosed, 1000)
        window.setTimeout(() => { closedMo.disconnect(); window.clearInterval(closedPoll); closedWatchOn = false }, 180_000)
      }
      // Easy Apply modal already open: fill loop (scanModal) owns it.
      if (modalOnPage()) return
      if (!(await ensureLinkedInSignedIn(intent))) return
      if (linkedInVerifyWall()) {
        say(document.body, "LinkedIn needs you to verify this Chrome session first — then Odds continues. Odds never completes security checks.", "ask")
        document.body.querySelector(".odds-apply-bar")?.classList.add("odds-apply-float")
        return
      }
      const wanted = globalThis.oddsSites.jobLink(intent.job)?.id
      let broodsTried = false
      if (intent.started || resume) say(document.body, "Still on LinkedIn — opening the employer application…", "filling")
      for (let waited = 0; waited < 15000; waited += 300) {
        await sleep(300)
        if (linkedInClosed()) {
          await reportLinkedInClosed(intent)
          return
        }
        if (linkedInVerifyWall()) {
          say(document.body, "LinkedIn needs you to verify this Chrome session first — then Odds continues. Odds never completes security checks.", "ask")
          document.body.querySelector(".odds-apply-bar")?.classList.add("odds-apply-float")
          return
        }
        if (linkedInSignInWall() || (!linkedInSignedIn() && !applyButton() && !modalOnPage())) {
          if (!(await ensureLinkedInSignedIn(intent))) return
        }
        if (waited === 0 || waited % 2400 === 0) say(document.body, "Looking for Apply on this LinkedIn job…", "filling")
        const openId = PAGE.site.open?.()?.id
        if (wanted && openId && openId !== wanted) continue
        const button = applyButton()
        if (!button) {
          if (!broodsTried && waited >= 4500) {
            broodsTried = true
            if (await assistOpenApply(wanted)) return
          }
          continue
        }
        await ask({ type: "apply-started" })
        if (/easy apply/i.test(labelOfButton(button))) return button.click()
        const there = await offsiteUrl(wanted)
        if (there) {
          say(document.body, "Opening the employer’s application…", "filling")
          return ask({ type: "apply-go", url: there })
        }
        say(document.body, "Opening the employer’s application…", "filling")
        await ask({ type: "apply-follow" })
        const arm = await ask({ type: "apply-arm-offsite" }).catch(() => null)
        button.click()
        await ask({ type: "apply-disarm-offsite", wasActive: arm?.wasActive === true }).catch(() => null)
        if (await waitLeftLinkedInJob(wanted, 10000)) return
        if (await assistOpenApply(wanted)) return
        say(document.body, "Odds could not open the employer form from LinkedIn. Click Apply on this tab yourself; Odds fills it after the form opens.", "ask")
        document.body.querySelector(".odds-apply-bar")?.classList.add("odds-apply-float")
        return
      }
      if (linkedInClosed()) {
        await reportLinkedInClosed(intent)
      } else if (linkedInVerifyWall()) {
        say(document.body, "LinkedIn needs you to verify this Chrome session first — then Odds continues. Odds never completes security checks.", "ask")
      } else {
        if (await assistOpenApply(wanted)) return
        say(
          document.body,
          "Odds assist could not open Apply on LinkedIn. Click Apply on this tab yourself; Odds fills the employer form after it opens.",
          "ask",
        )
      }
      document.body.querySelector(".odds-apply-bar")?.classList.add("odds-apply-float")
    } finally {
      openingApply = false
    }
  }
  void openLinkedInApply()

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
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message?.type === "application-ping") { reply({ ok: true }); return }
    if (message?.type === "application-continue") {
      // Same Easy Apply modal: refresh answers and keep filling; reopen scan if LinkedIn remounted the dialog.
      if (linkedInClosed()) {
        void askAgain({ type: "apply-intent" }).then((r) => reportLinkedInClosed(r?.intent)).catch(() => undefined)
      }
      scanModal()
      // Offsite stuck on the listing: Open tab must retry Apply (not only Easy Apply fill).
      if (!modalOnPage() && applyButton()) void openLinkedInApply({ resume: true })
      // Open tab / Continue: re-verify Ready — demote if contact/required fields are empty (no false Review).
      if (session?.modal && !formActuallyFilled(session.modal)) {
        const left = questionsOf(session.modal).filter((q) => q.kind !== "checkbox" && !answered(q)).length
        for (const q of questionsOf(session.modal)) if (q.kind !== "checkbox" && !answered(q)) q.group.classList.add("odds-ask")
        say(session.modal, left
          ? `odds filled in what it knows. Answer the ${left === 1 ? "marked question" : `${left} marked questions`}, then press Review: odds keeps your answers.`
          : "odds filled in what it knows. Answer the marked questions, then press Review: odds keeps your answers.", "ask")
      }
      if (session?.handoff) session.handoff.refresh?.(session.kit?.facts).then((changed) => { if (changed && session?.modal) fillStep(session.modal) }).catch(() => undefined)
    }
  })
})()
