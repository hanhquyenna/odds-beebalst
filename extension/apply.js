// Applying with odds on LinkedIn: when the person opens Easy Apply, odds fills the form in from what it knows (their odds profile, the standard
// answers they keep on odds, their own earlier answers, the CV that goes with the job), moves on through the steps that are complete, and stops
// at the review: the person checks it and presses Submit themselves. odds never presses Submit. A question odds cannot answer is marked; what the
// person answers is kept, so the next form that asks it is filled in too. When LinkedIn says the application was sent, the job is marked applied.
;(() => {
  const A = globalThis.oddsApply
  const PAGE = globalThis.oddsPage
  if (!A || !PAGE || !/(^|\.)linkedin\.com$/.test(location.hostname)) return

  const MODAL = '[data-test-modal-id="easy-apply-modal"]'
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
    const labelEl = group.querySelector("legend, label, [data-test-form-builder-radio-button-form-component__title]")
    const label = A.questionText(labelEl?.innerText || group.getAttribute("aria-label") || "")
    if (!label) return null
    const select = group.querySelector("select")
    if (select) return { group, label, kind: "select", el: select, options: [...select.options].map((o) => o.text.trim()) }
    const radios = [...group.querySelectorAll('input[type="radio"]')]
    if (radios.length) return { group, label, kind: "radio", el: radios, options: radios.map((r) => (group.querySelector(`label[for="${CSS.escape(r.id)}"]`)?.innerText || r.value || "").trim()) }
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
    if (!kit.cv?.for_this_job) return
    const want = [kit.cv.file_name, kit.cv.name].filter(Boolean).map((n) => n.toLowerCase().replace(/\.[a-z]+$/, ""))
    const cards = [...modal.querySelectorAll('input[type="radio"][id^="jobsDocumentCardToggle"]')]
    if (!cards.length && !modal.querySelector('input[type="file"]')) return
    const mine = cards.find((r) => want.some((w) => (r.getAttribute("aria-label") || "").toLowerCase().includes(w)))
    if (mine) {
      if (!mine.checked) mine.click()
      return
    }
    const upload = modal.querySelector('input[type="file"][id*="upload-resume"], input[type="file"][name="file"]')
    if (!upload || session.uploaded) return
    const file = await ask({ type: "cv-file", doc: kit.cv.id })
    if (file?.status !== "ok") return
    const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], file.name, { type: file.type }))
    upload.files = transfer.files
    upload.dispatchEvent(new Event("change", { bubbles: true }))
    session.uploaded = true
  }

  /** The bar at the top of the form that says what odds did and what is left for the person. */
  function say(modal, text, state = "busy") {
    let bar = modal.querySelector(".odds-apply-bar")
    if (!bar) {
      bar = document.createElement("div")
      bar.className = "odds-apply-bar"
      const where = modal.querySelector(".artdeco-modal__content, [data-test-modal] .jobs-easy-apply-content") || modal.querySelector('[role="dialog"]') || modal
      where.prepend(bar)
    }
    bar.dataset.state = state
    bar.textContent = text
  }

  const questionsOf = (modal) => [...modal.querySelectorAll("[data-test-form-element]")].filter(shown).map(questionOf).filter(Boolean)
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
      if (answered(q)) continue
      if (await fill(q, session.kit.facts, besideCountry)) {
        q.group.dataset.odds = "filled"
        continue
      }
      if (q.kind === "checkbox") continue
      q.group.classList.add("odds-ask")
      left++
    }
    await chooseCv(modal, session.kit)
    return left
  }

  async function run(modal) {
    const job = PAGE.site.open?.()
    session = { modal, job, kit: null, uploaded: false, submitted: false }
    say(modal, "odds is filling this in…")
    const kit = await ask({ type: "apply-kit", url: job?.url || location.href })
    if (!kit || kit.status === "connect") return say(modal, "Connect odds (its icon in the toolbar) to have this filled in.", "problem")
    if (kit.status !== "ok") return say(modal, "odds could not fill this in right now. Fill it in as usual.", "problem")
    session.kit = kit
    for (let step = 0; step < 15 && modal.isConnected && session?.modal === modal; step++) {
      await sleep(250)
      const left = await fillStep(modal)
      const next = nextButton(modal)
      const before = signature(modal)
      if (left > 0) {
        say(modal, `odds filled in what it knows. Answer the ${left === 1 ? "marked question" : `${left} marked questions`}, then press ${next ? "Next" : "Review"}: odds keeps your answers for the next form.`, "ask")
        // The person answers and goes on; their answers are kept when they do (see keep()).
        while (modal.isConnected && signature(modal) === before) await sleep(300)
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
      ask({ type: "save-answers", questions })
      // Used at once if the same question comes again on a later step.
      for (const q of questions) session.kit.facts.remembered = { ...(session.kit.facts.remembered || {}), [A.questionKey(q.question)]: q.answer }
    }
  }

  /** After Submit: when LinkedIn says it was sent, the job is applied on odds (kept for the person first if odds did not hold it). */
  async function watchSent(job) {
    for (let waited = 0; waited < 20000; waited += 500) {
      await sleep(500)
      const said = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], .artdeco-modal')].some((d) => /application (was )?sent|your application was sent|sent your application|application submitted/i.test(d.innerText || ""))
      if (!said) continue
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
      const button = [...document.querySelectorAll("#jobs-apply-button-id, .jobs-apply-button")].find(shown)
      if (!button) continue
      await ask({ type: "apply-started" })
      if (!/easy apply/i.test(labelOfButton(button))) await ask({ type: "apply-follow" })
      button.click()
      return
    }
  })()

  // LinkedIn changes its page all the time: looked at once a frame at most.
  let looking = false
  new MutationObserver(() => {
    if (looking) return
    looking = true
    requestAnimationFrame(() => {
      looking = false
      const modal = document.querySelector(MODAL)
      if (modal && (!session || session.modal !== modal)) run(modal)
      if (!modal && session && !session.submitted) session = null
    })
  }).observe(document.body, { childList: true, subtree: true })
})()
