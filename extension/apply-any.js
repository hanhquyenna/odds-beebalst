// Applying with odds anywhere but LinkedIn: in a tab opened from "odds apply" in the panel (or by such a tab: the employer's own form), odds fills
// in the application form's fields it knows (name, email, phone, LinkedIn, website, city, the standard answers on the person's odds profile, their
// own earlier answers) and puts their CV in the CV upload. A question odds cannot answer is outlined; what the person answers is kept for the next
// form. odds never sends the form: the person checks it and submits it. On a job board's page that is not the form yet, odds presses its Apply.
;(() => {
  const A = globalThis.oddsApply
  const portalHost = host => /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|smartrecruiters\.com|successfactors\.eu|successfactors\.com|icims\.com)$/.test(host)
  if (!A || /(^|\.)linkedin\.com$/.test(location.hostname) || location.hostname === "odds.beeblast.co" || (window.top !== window && !portalHost(location.hostname)) || globalThis.oddsGenericApplyLoaded) return
  globalThis.oddsGenericApplyLoaded = true

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
    const genericUpload = (t) => /^(upload file|choose file|browse|tap to choose files)/i.test(t)
    if (around && textOf(around) && !genericUpload(textOf(around))) return textOf(around)
    // Many React forms render a sibling label without for/id, including nested
    // upload controls. Use the nearest field label, never a label from another field.
    let parent = el.parentElement
    for (let depth = 0; parent && depth < 4; depth++, parent = parent.parentElement) {
      if (parent.matches("form, body, main")) break
      const label = [...parent.children].find(c => c.matches("label, legend") && !c.contains(el) && textOf(c) && !genericUpload(textOf(c)))
      if (label) return textOf(label)
    }
    // A label in the field's own box (Workday, Ashby: a div with a label element above the input).
    const box = el.closest("[data-automation-id], .field, .form-group, .application-question, [class*='field'], [class*='question']")
    const near = box?.querySelector("label, legend, [class*='label']")
    if (near && textOf(near)) return textOf(near)
    return (el.getAttribute("placeholder") || el.name || "").replace(/[_\-[\]]+/g, " ").trim()
  }

  const required = (el, label) => el.required || el.getAttribute("aria-required") === "true" || el.closest('[role="radiogroup"][aria-required="true"]') !== null || /\*\s*$/.test(label)

  /** Puts a value in a field the way typing would, so the page's own code sees it. */
  function type(el, value) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set
    if (setter) setter.call(el, value)
    else el.value = value
    for (const name of ["input", "change", "blur"]) el.dispatchEvent(new Event(name, { bubbles: true }))
  }

  let applicationJob = null
  let facts = null
  let cv = null
  let uploaded = false
  const attempts = new WeakMap()
  const verifications = new WeakMap()
  for (const name of ["input", "change"]) document.addEventListener(name, event => { if (event.isTrusted && event.target instanceof Element) verifications.delete(event.target) }, true)
  const asked = new Set()

  /** The fields of the form on screen: text-like inputs, text areas, selects and radio groups (one entry per group). */
  function fields() {
    const out = []
    const groups = new Set()
    for (const el of document.querySelectorAll("input, textarea, select")) {
      if ((!shown(el) || el.getAttribute("aria-hidden") === "true") && el.type !== "file") continue
      if (el.closest("#odds-add, .odds-job-chance, .odds-apply-bar, nav, header, footer, [role='search'], [id*='newsletter'], [class*='newsletter']")) continue
      // Job-board search widgets are not application questions (Indeed renders
      // What/Where as ordinary text inputs outside a search landmark).
      const identity = `${el.name} ${el.id} ${el.getAttribute("autocomplete") || ""}`
      const searchForm = el.closest("form")
      if (/(?:^|[\s_-])search(?:[\s_-]|$)|searchbox|text-input-what|text-input-where/i.test(identity) || (searchForm && /(?:^|[\s_/-])search(?:[\s_/?-]|$)|\/jobs(?:\?|$)/i.test(`${searchForm.id} ${searchForm.getAttribute("action") || ""}`))) continue
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
      if (el.getAttribute("role") === "combobox" && el.tagName === "INPUT") { out.push({ kind: "combobox", el, label }); continue }
      if (t === "file") out.push({ kind: "file", el, label })
      else if (el.tagName === "SELECT") out.push({ kind: "select", el, label, options: [...el.options].map((o) => o.text.trim()) })
      else if (el.tagName === "TEXTAREA") out.push({ kind: "textarea", el, label })
      else out.push({ kind: t === "number" ? "number" : "text", el, label })
    }
    // Yes/No and other short choices drawn as buttons (Ashby): one entry per group, never the form's own Next/Submit.
    for (const box of document.querySelectorAll("div, fieldset")) {
      const buttons = [...box.children].filter((c) => c.tagName === "BUTTON" && c.type !== "submit")
      if (buttons.length < 2 || buttons.length > 6 || buttons.length !== box.children.length || !buttons.every((b) => shown(b) && textOf(b).length > 0 && textOf(b).length <= 40)) continue
      if (box.closest("#odds-add, .odds-job-chance, .odds-apply-bar, nav, header, footer, [role='search']") || buttons.some((b) => /^(next|continue|submit|review|apply|back|save|cancel|volgende|verder)/i.test(textOf(b)))) continue
      const label = choiceLabel(box)
      if (label) out.push({ kind: "choice", el: buttons, label, options: buttons.map(textOf), box })
    }
    return out
  }

  /** The question above a group of buttons: the nearest label, legend or heading in the boxes around it. */
  function choiceLabel(box) {
    let parent = box.parentElement
    for (let depth = 0; parent && depth < 3; depth++, parent = parent.parentElement) {
      if (parent.matches("form, body, main")) break
      const label = [...parent.children].find((c) => !c.contains(box) && c.matches("label, legend, p, [class*='label'], [class*='heading'], [class*='title']") && textOf(c).length > 1 && textOf(c).length < 400)
      if (label) return textOf(label)
    }
    return ""
  }
  const pressed = (b) => b.getAttribute("aria-pressed") === "true" || b.getAttribute("aria-checked") === "true" || b.getAttribute("aria-selected") === "true" || [...b.classList].some((c) => /(^|[^a-z])(active|selected|checked|pressed)([^a-z]|$)/i.test(c))
  /** What a searchable dropdown shows as its choice (react-select and the like), empty while nothing is chosen. */
  const comboValue = (input) => textOf(input.closest("[class*='control'], [class*='container'], [class*='select']")?.querySelector("[class*='single-value'], [class*='SingleValue'], [class*='selected-value']"))
  /** Opens a dropdown and clicks the option that means `answer`; answers whether one was clicked. */
  async function pickOption(input, answer, label) {
    input.focus()
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
    await sleep(150)
    const listbox = document.getElementById(input.getAttribute("aria-controls") || "") || input.closest("[class*='container'], div")?.querySelector("[role='listbox']") || document.querySelector("[role='listbox']")
    const options = [...(listbox?.querySelectorAll("[role='option']") || [])]
    const i = A.chooseOption(options.map(textOf), answer, label)
    if (i < 0) { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); input.blur(); return null }
    const text = textOf(options[i])
    options[i].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    options[i].click()
    await sleep(100)
    return text
  }

  const answered = (f) => (f.kind === "radio" ? f.el.some((r) => r.checked) : f.kind === "choice" ? f.el.some(pressed) : f.kind === "combobox" ? comboValue(f.el) !== "" : f.kind === "select" ? f.el.selectedIndex >= 0 && f.el.value.trim() !== "" && !/^(please\s+)?(select|choose|selecteer|kies)/i.test(f.options[f.el.selectedIndex] || "") : f.kind === "file" ? f.el.files?.length > 0 : f.el.value.trim() !== "")
  const elOf = (f) => (Array.isArray(f.el) ? f.el[0] : f.el)
  const boxOf = (f) => (f.kind === "choice" && f.box.parentElement) || (f.kind === "radio" && elOf(f).closest('[role="radiogroup"], fieldset')) || elOf(f).closest("[role='radiogroup'], fieldset, [data-automation-id], .field, .form-group, .application-question, label, div") || elOf(f)

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
    await sleep(50)
    uploaded = Boolean(f.el.files?.length) && f.el.getAttribute("aria-invalid") !== "true"
    return uploaded
  }

  /** Fills in what odds knows; answers how many fields it filled and how many it left marked for the person. */
  async function fillAll() {
    let done = 0
    let left = 0
    const all = fields()
    const besideCountry = all.some((f) => /country code|landcode|country/i.test(f.label) && f.kind === "select")
    for (const f of all) {
      const box = boxOf(f)
      const control = elOf(f)
      const invalid = control.getAttribute("aria-invalid") === "true" || (control.willValidate && !control.validity.valid)
      const wrongValue = verifications.has(control) && !verifications.get(control)()
      if (answered(f) && !invalid && !wrongValue) {
        box.classList.remove("odds-ask")
        continue
      }
      if (answered(f) && (invalid || wrongValue)) { box.classList.add("odds-ask"); left++; continue }
      // A site can discard a synthetic change on its next render. Read it back,
      // retry once, then ask for attention instead of falsely reporting success.
      if ((attempts.get(control) || 0) >= 2) { box.classList.add("odds-ask"); left++; continue }
      if (f.kind === "file") {
        if (!/\b(resume|cv|curriculum|levensloop)\b/i.test(f.label) && !required(control, f.label)) continue
        attempts.set(control, (attempts.get(control) || 0) + 1)
        if (await uploadCv(f)) {
          done++
        } else if (required(f.el, f.label)) {
          box.classList.add("odds-ask")
          left++
        }
        continue
      }
      const answer = A.answerText(f.label, facts)
      let ok = false
      let expected = null
      let expectedOption = -1
      let expectedText = null
      if (answer !== null) {
        attempts.set(control, (attempts.get(control) || 0) + 1)
        if (f.kind === "combobox") {
          expectedText = await pickOption(f.el, answer, f.label)
          ok = expectedText !== null
        } else if (f.kind === "select" || f.kind === "radio" || f.kind === "choice") {
          const i = A.chooseOption(f.options, answer, f.label)
          if (i >= 0) {
            expectedOption = i
            if (f.kind === "select") {
              f.el.selectedIndex = i
              for (const name of ["input", "change"]) f.el.dispatchEvent(new Event(name, { bubbles: true }))
            } else f.el[i].click()
            ok = true
          }
        } else {
          expected = A.valueFor(f.kind, f.label, answer, besideCountry)
          type(f.el, expected)
          ok = true
        }
      }
      if (ok) {
        const verify = () => expected !== null ? (f.el.value.trim() === expected.trim() || (/phone|mobile|telefoon/i.test(f.label) && f.el.value.replace(/\D/g, "") === expected.replace(/\D/g, ""))) : f.kind === "select" ? f.el.selectedIndex === expectedOption : f.kind === "radio" ? Boolean(f.el[expectedOption]?.checked) : f.kind === "choice" ? pressed(f.el[expectedOption]) : f.kind === "combobox" ? comboValue(f.el) === expectedText : answered(f)
        verifications.set(control, verify)
        await sleep(50)
        ok = verify() && answered(f) && control.getAttribute("aria-invalid") !== "true" && (!control.willValidate || control.validity.valid)
      }
      if (ok) {
        done++
      } else if (answer !== null || required(elOf(f), f.label)) {
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
    const status = state === "done" ? "ready" : state === "ask" ? "needs_input" : state === "problem" ? "failed" : "filling"
    if (bar.textContent !== text || bar.dataset.state !== state) ask({ type: "application-progress", status, message: text })
    bar.dataset.state = state
    bar.textContent = text
  }

  /** What the person answered themselves, kept when they go on or send the form. */
  function keep() {
    const questions = fields()
      .filter((f) => asked.has(f.label) && answered(f) && !["file"].includes(f.kind))
      .map((f) => ({ question: A.questionText(f.label), answer: f.kind === "choice" ? f.options[f.el.findIndex(pressed)] : f.kind === "combobox" ? comboValue(f.el) : f.kind === "radio" ? f.options[f.el.findIndex((r) => r.checked)] : f.kind === "select" ? f.options[f.el.selectedIndex] : f.el.value.trim() }))
      .filter((q) => q.answer && !sent.has(`${q.question}\n${q.answer}`))
    if (!questions.length) return
    for (const q of questions) sent.add(`${q.question}\n${q.answer}`)
    ask({ type: "save-answers", questions, url: applicationJob })
  }
  /** Answers already kept (a press on Submit and the form's own submit both say "kept"). */
  const sent = new Set()

  /** A job board's page that is not the form yet: its Apply button (the employer's site, or the board's own form). */
  function applyButton() {
    return [...document.querySelectorAll("a, button")].find((b) => shown(b) && /^(apply|apply now|apply for this job|solliciteer|solliciteren|nu solliciteren|solliciteer nu|bewerben|jetzt bewerben|postuler|i'm interested)\b/i.test(textOf(b) || b.getAttribute("aria-label") || "") && (!b.closest("form") || b.type === "button"))
  }

  /** The form's own way to the next step (never Submit). */
  const nextButton = () => [...document.querySelectorAll("form button, form input[type=button], button[data-automation-id='pageFooterNextButton']")].find(b => shown(b) && !b.disabled && /^(next|continue|review|save and continue|volgende|verder|weiter|suivant)$/i.test((b.getAttribute("aria-label") || textOf(b) || b.value || "").trim()))
  /** The employer's own words saying the application went through (a thank-you page or message, with no form left). */
  const SENT = /thank you for (applying|your (application|interest in))|your application (has been|was|is) (successfully )?(submitted|received|sent)|(we have|we've) received your application|application (submitted|received|complete)|bedankt voor je sollicitatie|je sollicitatie is (verzonden|ontvangen)|vielen dank für ihre bewerbung/i
  let reported = false
  function confirmed() {
    if (reported || !applicationJob) return false
    const text = textOf(document.querySelector("main, [role=main]") || document.body).slice(0, 3000)
    if (!SENT.test(text) || fields().some((f) => f.kind !== "file" && !answered(f))) return false
    reported = true
    keep()
    ask({ type: "applied", url: applicationJob })
    say("Sent. odds marked this job as applied.", "done")
    ask({ type: "application-progress", status: "submitted", message: "Sent. odds marked this job as applied." })
    return true
  }

  let listening = false
  async function start() {
    const { intent } = (await ask({ type: "apply-intent" })) || {}
    if (!intent) return
    const kit = await ask({ type: "apply-kit", url: intent.job })
    if (!kit || kit.status === "connect") return say("Connect odds (its icon in the toolbar) to have this form filled in.", "problem")
    if (kit.status !== "ok") return say("Could not load your application details. Open Odds and try again.", "problem")
    applicationJob = intent.job
    facts = kit.facts
    const handoff = globalThis.oddsApplicationHandoff?.(intent.job, ask, kit.job_id)
    cv = kit.cv
    if (!listening) {
    listening = true
    document.addEventListener("click", (event) => {
      const b = event.target instanceof Element ? event.target.closest("button, input[type=submit], a") : null
      if (b && /submit|send|next|continue|verzend|versturen|volgende|apply|solliciteer|review/i.test(textOf(b) || b.value || "")) keep()
    }, true)
    document.addEventListener("submit", keep, true)
    }
    const advanced = new WeakMap()
    let pressed = false
    let verifiedRounds = 0
    let sawForm = false
    // Pages that draw their form late, or one step at a time (Workday): filled in again as fields come.
    for (let round = 0; round < 120; round++) {
      globalThis.oddsDismissCookies?.()
      if (confirmed()) return
      const heading = document.title + " " + textOf(document.querySelector("h1, h2"))
      const challenge = [...document.querySelectorAll('iframe[title*="challenge"], iframe[src*="hcaptcha"], #captcha-internal')].some(shown)
      const login = /sign in|log in|create account|inloggen|account aanmaken|security verification|verify you are human/i.test(heading)
      if (challenge || login) {
        verifiedRounds = 0
        say("Complete the login or verification on your desktop. Odds will not do this for you.", "ask")
        await sleep(2000)
        continue
      }
      // A visible job-board Apply link with no applicant fields means this is
      // still the listing. Do not call a search widget a completed application.
      const skip = [...document.querySelectorAll("button, a")].find(b => shown(b) && /^(verder gaan zonder in te vullen|continue without (?:signing up|subscribing|entering)|skip newsletter)$/i.test(textOf(b)))
      if (skip) {
        say("Continuing to the application without newsletter signup…", "filling")
        await ask({ type: "apply-follow" })
        skip.click()
        await sleep(500)
        continue
      }
      // Let the trusted portal frame report progress; the wrapper page is not a second form.
      const portalFrame = [...document.querySelectorAll("iframe[src]")].find(frame => {
        try { return shown(frame) && portalHost(new URL(frame.src).hostname) } catch { return false }
      })
      if (portalFrame && !fields().length) { await sleep(1000); continue }
      const candidates = fields()
      const applicant = candidates.some(f => f.kind === "file" || /first.?name|last.?name|full.?name|voornaam|achternaam|email|e-mail|phone|telefoon|resume|curriculum|cover letter/i.test(f.label))
      const go = !applicant && !pressed ? applyButton() : null
      if (go) {
        pressed = true
        say("Opening the employer’s application form…", "filling")
        await ask({ type: "apply-follow" })
        go.click()
        await sleep(500)
        continue
      }
      if (await handoff?.refresh(facts)) {
        for (const f of fields()) { attempts.delete(elOf(f)); verifications.delete(elOf(f)) }
      }
      const { done, any } = await fillAll()
      await handoff?.publish(fields().filter(f => f.kind !== "file" && boxOf(f).classList.contains("odds-ask")))
      const unsupported = [...document.querySelectorAll('[aria-required="true"][role="combobox"], [aria-required="true"][role="checkbox"]')].filter(e => shown(e) && (e.getAttribute("aria-checked") !== "true") && !e.matches("input, select, textarea"))
      const errors = [...document.querySelectorAll('[role="alert"]')].filter(e => shown(e) && /error|invalid|required|failed|too large|not supported/i.test(textOf(e)))
      const total = document.querySelectorAll(".odds-ask").length + unsupported.length + errors.length
      if (any) sawForm = true
      verifiedRounds = (any || sawForm) && total === 0 ? verifiedRounds + 1 : 0
      if (any && (done || total || round > 2)) {
        if (/sign in|log in|create account|inloggen|account aanmaken/i.test(document.title + " " + textOf(document.querySelector("h1, h2")))) say("Sign in or make the account yourself; odds fills in the form after.", "ask")
        else if (total) say(`odds filled in what it knows. Answer the ${total === 1 ? "outlined question" : `${total} outlined questions`}: odds keeps your answers. Then check the form and send it yourself.`, "ask")
        else if ([...document.querySelectorAll('[role="checkbox"][aria-checked="false"]')].some(shown)) say("Odds filled the details it knows. Review the form and confirm the consent yourself before sending.", "ask")
        else if (verifiedRounds < 2) say("Checking that the website kept your details and CV…", "busy")
        else say("Filled in by odds. Check everything, then send it yourself.", "done")
      } else if (!any && sawForm && total === 0) {
        // The steps are through (a review page has no fields): what is left is the person's to check and send.
        if (!nextButton()) say("Filled in by odds. Check everything, then send it yourself.", "done")
      } else if (!any && round >= 8) {
        say("Odds could not verify an application form here. Open the form or complete this step on your desktop.", "ask")
      } else if (!any && !pressed && round === 4) {
        // No form here: the board's own Apply opens it (the intent going along to a new tab).
        const go = applyButton()
        if (go) {
          pressed = true
          await ask({ type: "apply-follow" })
          go.click()
        }
      }
      if (verifiedRounds >= 2) {
        const next = nextButton()
        const signature = `${textOf(document.querySelector("h1, h2"))}|${fields().map(f => f.label).join("|")}`
        if (next && advanced.get(next) !== signature) {
          advanced.set(next, signature)
          keep()
          say("Continuing to the next application step…", "busy")
          next.click()
          verifiedRounds = 0
        }
      }
      await sleep(round < 10 ? 500 : 2000)
    }
  }
  let running = false
  const launch = () => { if (!running) { running = true; start().finally(() => { running = false }) } }
  chrome.runtime.onMessage.addListener(message => { if (message?.type === "application-continue") launch() })
  launch()
})()
