// Applying with odds anywhere but LinkedIn: in a tab opened from "odds apply" in the panel (or by such a tab: the employer's own form), odds fills
// in the application form's fields it knows (name, email, phone, LinkedIn, website, city, the standard answers on the person's odds profile, their
// own earlier answers) and puts their CV in the CV upload. A question odds cannot answer is outlined; what the person answers is kept for the next
// form. odds never sends the form: the person checks it and submits it. On a job board's page that is not the form yet, odds presses its Apply.
;(() => {
  const A = globalThis.oddsApply
  if (!A || window.top !== window || /(^|\.)linkedin\.com$/.test(location.hostname) || location.hostname === "odds.beeblast.co") return

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const ask = (message) => new Promise((resolve) => chrome.runtime.sendMessage(message, (answer) => resolve(chrome.runtime.lastError ? null : answer)))
  const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"
  const textOf = (el) => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim()

  /** The words a field is asked with: its <label>, aria-label(ledby), the label around it, its placeholder, or its name. */
  function labelOf(el) {
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
      if (label && textOf(label)) return textOf(label)
    }
    const by = el.getAttribute("aria-labelledby")
    if (by) {
      const t = by.split(/\s+/).map((id) => textOf(document.getElementById(id))).join(" ").trim()
      if (t) return t
    }
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label").trim()
    const around = el.closest("label")
    if (around && textOf(around)) return textOf(around)
    // A label in the field's own box (Workday, Ashby: a div with a label element above the input).
    const box = el.closest("[data-automation-id], .field, .form-group, .application-question, [class*='field'], [class*='question']")
    const near = box?.querySelector("label, legend, [class*='label']")
    if (near && textOf(near)) return textOf(near)
    return (el.getAttribute("placeholder") || el.name || "").replace(/[_\-[\]]+/g, " ").trim()
  }

  const required = (el, label) => el.required || el.getAttribute("aria-required") === "true" || /\*\s*$/.test(label)

  /** Puts a value in a field the way typing would, so the page's own code sees it. */
  function type(el, value) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set
    if (setter) setter.call(el, value)
    else el.value = value
    for (const name of ["input", "change", "blur"]) el.dispatchEvent(new Event(name, { bubbles: true }))
  }

  let facts = null
  let cv = null
  let uploaded = false
  const filled = new WeakSet()
  const asked = new Set()

  /** The fields of the form on screen: text-like inputs, text areas, selects and radio groups (one entry per group). */
  function fields() {
    const out = []
    const groups = new Set()
    for (const el of document.querySelectorAll("input, textarea, select")) {
      if (!shown(el) && el.type !== "file") continue
      if (el.closest("#odds-add, .odds-job-chance, .odds-apply-bar, nav, header, footer, [role='search']")) continue
      const t = (el.type || "").toLowerCase()
      if (["hidden", "submit", "button", "image", "reset", "password", "search", "checkbox"].includes(t)) continue
      if (t === "radio") {
        if (!el.name || groups.has(el.name)) continue
        groups.add(el.name)
        const radios = [...document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)].filter(shown)
        const legend = el.closest("fieldset")?.querySelector("legend")
        const label = textOf(legend) || labelOf(el.closest("[role='radiogroup']") || el)
        out.push({ kind: "radio", el: radios, label, options: radios.map((r) => labelOf(r)) })
        continue
      }
      const label = labelOf(el)
      if (!label) continue
      if (t === "file") out.push({ kind: "file", el, label })
      else if (el.tagName === "SELECT") out.push({ kind: "select", el, label, options: [...el.options].map((o) => o.text.trim()) })
      else if (el.tagName === "TEXTAREA") out.push({ kind: "textarea", el, label })
      else out.push({ kind: t === "number" ? "number" : "text", el, label })
    }
    return out
  }

  const answered = (f) => (f.kind === "radio" ? f.el.some((r) => r.checked) : f.kind === "select" ? f.el.selectedIndex > 0 : f.kind === "file" ? f.el.files?.length > 0 : f.el.value.trim() !== "")
  const elOf = (f) => (Array.isArray(f.el) ? f.el[0] : f.el)
  const boxOf = (f) => elOf(f).closest("fieldset, [data-automation-id], .field, .form-group, .application-question, label, div") || elOf(f)

  /** The person's CV in an upload asking for one, from odds. */
  async function uploadCv(f) {
    if (uploaded || !cv || !/\b(resume|cv|curriculum|levensloop)\b/i.test(`${f.label} ${f.el.name} ${f.el.id}`)) return false
    const file = await ask({ type: "cv-file", doc: cv.id })
    if (file?.status !== "ok") return false
    const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], file.name, { type: file.type }))
    f.el.files = transfer.files
    f.el.dispatchEvent(new Event("input", { bubbles: true }))
    f.el.dispatchEvent(new Event("change", { bubbles: true }))
    uploaded = true
    return true
  }

  /** Fills in what odds knows; answers how many fields it filled and how many it left marked for the person. */
  async function fillAll() {
    let done = 0
    let left = 0
    const all = fields()
    const besideCountry = all.some((f) => /country code|landcode|country/i.test(f.label) && f.kind === "select")
    for (const f of all) {
      const box = boxOf(f)
      if (answered(f)) {
        box.classList.remove("odds-ask")
        continue
      }
      if (filled.has(elOf(f))) continue
      if (f.kind === "file") {
        if (await uploadCv(f)) {
          filled.add(elOf(f))
          done++
        }
        continue
      }
      const answer = A.answerText(f.label, facts)
      let ok = false
      if (answer !== null) {
        if (f.kind === "select" || f.kind === "radio") {
          const i = A.chooseOption(f.options, answer, f.label)
          if (i >= 0) {
            if (f.kind === "select") {
              f.el.selectedIndex = i
              for (const name of ["input", "change"]) f.el.dispatchEvent(new Event(name, { bubbles: true }))
            } else f.el[i].click()
            ok = true
          }
        } else {
          type(f.el, A.valueFor(f.kind, f.label, answer, besideCountry))
          ok = true
        }
      }
      if (ok) {
        filled.add(elOf(f))
        done++
      } else if (required(elOf(f), f.label) && f.kind !== "textarea") {
        box.classList.add("odds-ask")
        asked.add(f.label)
        left++
      }
    }
    return { done, left, any: all.length > 0 }
  }

  let bar = null
  function say(text, state) {
    if (!bar) {
      bar = document.createElement("div")
      bar.className = "odds-apply-bar odds-apply-float"
      document.documentElement.append(bar)
    }
    bar.dataset.state = state
    bar.textContent = text
  }

  /** What the person answered themselves, kept when they go on or send the form. */
  function keep() {
    const questions = fields()
      .filter((f) => asked.has(f.label) && answered(f) && !["file"].includes(f.kind))
      .map((f) => ({ question: A.questionText(f.label), answer: f.kind === "radio" ? f.options[f.el.findIndex((r) => r.checked)] : f.kind === "select" ? f.options[f.el.selectedIndex] : f.el.value.trim() }))
      .filter((q) => q.answer && !sent.has(`${q.question}\n${q.answer}`))
    if (!questions.length) return
    for (const q of questions) sent.add(`${q.question}\n${q.answer}`)
    ask({ type: "save-answers", questions })
  }
  /** Answers already kept (a press on Submit and the form's own submit both say "kept"). */
  const sent = new Set()

  /** A job board's page that is not the form yet: its Apply button (the employer's site, or the board's own form). */
  function applyButton() {
    return [...document.querySelectorAll("a, button")].find((b) => shown(b) && /^(apply|apply now|apply for this job|solliciteer|solliciteren|nu solliciteren|solliciteer nu|bewerben|jetzt bewerben|postuler|i'm interested)\b/i.test(textOf(b) || b.getAttribute("aria-label") || "") && !b.closest("form"))
  }

  async function start() {
    const { intent } = (await ask({ type: "apply-intent" })) || {}
    if (!intent) return
    const kit = await ask({ type: "apply-kit", url: intent.job })
    if (!kit || kit.status === "connect") return say("Connect odds (its icon in the toolbar) to have this form filled in.", "problem")
    if (kit.status !== "ok") return
    facts = kit.facts
    cv = kit.cv
    document.addEventListener("click", (event) => {
      const b = event.target instanceof Element ? event.target.closest("button, input[type=submit], a") : null
      if (b && /submit|send|next|continue|verzend|versturen|volgende|apply|solliciteer|review/i.test(textOf(b) || b.value || "")) keep()
    }, true)
    document.addEventListener("submit", keep, true)
    let pressed = false
    // Pages that draw their form late, or one step at a time (Workday): filled in again as fields come.
    for (let round = 0; round < 120; round++) {
      const { done, any } = await fillAll()
      const total = document.querySelectorAll(".odds-ask").length
      if (any && (done || total || round > 2)) {
        if (/sign in|log in|create account|inloggen|account aanmaken/i.test(document.title + " " + textOf(document.querySelector("h1, h2")))) say("Sign in or make the account yourself; odds fills in the form after.", "ask")
        else if (total) say(`odds filled in what it knows. Answer the ${total === 1 ? "outlined question" : `${total} outlined questions`}: odds keeps your answers. Then check the form and send it yourself.`, "ask")
        else say("Filled in by odds. Check everything, then send it yourself.", "done")
      } else if (!any && !pressed && round === 4) {
        // No form here: the board's own Apply opens it (the intent going along to a new tab).
        const go = applyButton()
        if (go) {
          pressed = true
          await ask({ type: "apply-follow" })
          go.click()
        }
      }
      await sleep(round < 10 ? 500 : 2000)
    }
  }
  start()
})()
