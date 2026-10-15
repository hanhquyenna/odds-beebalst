// Applying with odds anywhere but LinkedIn: in a tab opened from "odds apply" in the panel (or by such a tab: the employer's own form), odds fills
// in the application form's fields it knows (name, email, phone, LinkedIn, website, city, the standard answers on the person's odds profile, their
// own earlier answers) and puts their CV in the CV upload. A question odds cannot answer is outlined; what the person answers is kept for the next
// form. odds never sends the form: the person checks it and submits it. On a job board's page that is not the form yet, odds presses its Apply.
;(() => {
  const A = globalThis.oddsApply
  const APPLY_BUILD = "2026-10-15-location-v4"
  const portalHost = host => /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|smartrecruiters\.com|successfactors\.eu|successfactors\.com|icims\.com)$/.test(host)
  if (!A || /(^|\.)linkedin\.com$/.test(location.hostname) || location.hostname === "odds.beeblast.co" || (window.top !== window && !portalHost(location.hostname)) || globalThis.oddsGenericApplyLoaded === APPLY_BUILD) return
  globalThis.oddsGenericApplyLoaded = APPLY_BUILD

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  /** Timed: a hung service worker must not freeze Apply in silence. */
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
  const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"
  /**
   * Real blocking captcha only. BambooHR / Greenhouse / etc. inject tiny or badge
   * reCAPTCHA iframes that are "shown" — those must not stop filling.
   */
  function blockingCaptcha() {
    const head = textOf(document.querySelector("h1, h2")).trim()
    if (/^(verify you are human|security (check|verification)|are you a (human|robot)|captcha)\b/i.test(head)) return true
    for (const el of document.querySelectorAll(
      'iframe[src*="hcaptcha"], iframe[src*="recaptcha"], iframe[src*="turnstile"], iframe[title*="challenge"], #captcha-internal, .cf-turnstile',
    )) {
      if (!shown(el) || el.getAttribute("aria-hidden") === "true") continue
      const st = getComputedStyle(el)
      if (st.display === "none" || Number(st.opacity) < 0.2) continue
      const r = el.getBoundingClientRect()
      // Badge / anchor / 1×1 — ignore.
      if (r.width < 140 || r.height < 70) continue
      const src = `${el.getAttribute("src") || ""} ${el.title || ""}`.toLowerCase()
      if (/\/badge|anchor\.html|recaptcha\/api2\/anchor/.test(src) && r.height < 180) continue
      // Visible challenge (bframe / large turnstile / hcaptcha box).
      if (r.width * r.height >= 140 * 70) return true
    }
    return false
  }
  /** A field that is there to catch bots ("Leave this field empty if you're human"): never an application question, always left empty. */
  const TRAP_TEXT = /leave (this|the|it)\b[^.?]{0,24}\b(empty|blank)|if you.?re (a )?human|(do not|don.?t) (fill|complete|enter)\b[^.?]{0,20}\b(this|here)|honey ?pot|bot ?trap|ignore this (field|input)|for (spam|bots) (only|detection)|(^|[\s_-])(hp|gotcha)[\s_-]?(field|input|email|url)?($|[\s_-])/i
  const isTrap = (el, label) => {
    if (TRAP_TEXT.test(`${label} ${el.name} ${el.id} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("placeholder") || ""}`)) return true
    const box = el.getBoundingClientRect()
    return box.right < 0 || box.bottom < 0 || box.left > window.innerWidth + 2000 || (box.width <= 1 && box.height <= 1) || el.tabIndex === -1 && el.getAttribute("autocomplete") === "off" && Number(getComputedStyle(el).opacity) === 0
  }
  const textOf = (el) => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim()

  /** Placeholder chrome ("Type your response") is never the question — that caused empty Odds prompts and missed autofill. */
  const PLACEHOLDER_ASK = /^(type your (response|answer)|enter (your )?(answer|response)|your answer|please (enter|type|write)|write (your )?(answer|response)|antwoord|uw antwoord)\b/i
  // EN + FR Workday/Eightfold file chrome ("Sélectionner un fichier") — never Broods text questions.
  const genericUpload = (t) => /^(upload(\s+a)?\s+file|choose(\s+a)?\s+file|browse|tap to choose|drop (it|file)|drag\s*(and|&)\s*drop|choose a file or drop|s[eé]lectionner(\s+un)?\s+fichier|choisir(\s+un)?\s+fichier|parcourir|t[eé]l[eé]charger(\s+un)?\s+fichier)$/i.test((t || "").replace(/\s+/g, " ").trim())
  /** Resume/CV step labels (EN/NL/FR — Kraft "Reprendre" / "Téléchargez votre CV"). */
  const isResumeAsk = (t) => /\b(resume|cv|curriculum(\s+vitae)?|levensloop|reprendre|curriculum)\b|t[eé]l[eé]chargez?\s+(votre\s+)?cv|upload\s+(your\s+)?(resume|cv)/i.test(t || "")
  /** Real <label>/aria may be short ("Email", "Phone"). Sibling <p>/headings need more text so we don't grab chrome. */
  const realAsk = (t, loose = false) => {
    const s = (t || "").replace(/\s+/g, " ").trim()
    if (!s || s.length >= 400 || genericUpload(s) || PLACEHOLDER_ASK.test(s)) return false
    return loose ? s.length >= 2 : s.length >= 8
  }
  /** The words a field is asked with: its <label>, aria-label(ledby), a sibling/parent question line — never a generic placeholder. */
  function labelOf(el) {
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
      if (label && realAsk(textOf(label), true)) return textOf(label)
    }
    const by = el.getAttribute("aria-labelledby")
    if (by) {
      const t = by.split(/\s+/).map((id) => textOf(document.getElementById(id))).join(" ").trim()
      if (realAsk(t, true)) return t
    }
    const aria = (el.getAttribute("aria-label") || "").trim()
    if (realAsk(aria, true)) return aria
    const around = el.closest("label")
    if (around && realAsk(textOf(around), true)) return textOf(around)
    // React / Greenhouse / Teamtailor: question in a <p> or heading above the input (sibling or uncle).
    let parent = el.parentElement
    for (let depth = 0; parent && depth < 5; depth++, parent = parent.parentElement) {
      if (parent.matches("form, body, main")) break
      const label = [...parent.children].find((c) => !c.contains(el) && c.matches("label, legend") && realAsk(textOf(c), true))
        || [...parent.children].find((c) => !c.contains(el) && c.matches("p, h1, h2, h3, h4, [class*='label'], [class*='question'], [class*='title'], [class*='heading']") && realAsk(textOf(c), false))
      if (label) return textOf(label)
    }
    let sib = el.previousElementSibling
    for (let i = 0; sib && i < 4; i++, sib = sib.previousElementSibling) {
      if (sib.matches("label, legend") ? realAsk(textOf(sib), true) : realAsk(textOf(sib), false)) return textOf(sib)
    }
    const box = el.closest("[data-automation-id], .field, .form-group, .application-question, [class*='field'], [class*='question']")
    const near = box && (
      [...box.querySelectorAll("label, legend")].find((n) => !n.contains(el) && realAsk(textOf(n), true))
      || [...box.querySelectorAll("p, [class*='label'], [class*='question']")].find((n) => !n.contains(el) && realAsk(textOf(n), false))
    )
    if (near) return textOf(near)
    if ((el.type || "").toLowerCase() === "file") {
      let p = el.parentElement
      for (let depth = 0; p && depth < 6; depth++, p = p.parentElement) {
        const heading = [...p.querySelectorAll("h1, h2, h3, h4, legend, label, p, [class*='heading'], [class*='title']")].find((n) => isResumeAsk(textOf(n)))
        if (heading) return textOf(heading)
      }
      // Workday FR: step title "Reprendre" + dropzone "Sélectionner un fichier" with no CV in the button label.
      const step = textOf(document.querySelector("h1, h2, h3, [data-automation-id='pageHeader'], [data-automation-id='stepHeader']"))
      if (isResumeAsk(step)) return step
      return "Resume / CV"
    }
    // Last resort: name only — never "Type your response" (that became empty Odds questions).
    const ph = (el.getAttribute("placeholder") || "").trim()
    if (realAsk(ph, false)) return ph.replace(/[_\-[\]]+/g, " ").trim()
    return (el.name || "").replace(/[_\-[\]]+/g, " ").trim()
  }

  const required = (el, label) => el.required || el.getAttribute("aria-required") === "true" || el.closest('[role="radiogroup"][aria-required="true"]') !== null || /\*\s*$/.test(label)

  /** Puts a value in a field the way typing would, so the page's own code sees it (React/Lever). */
  function type(el, value) {
    try { el.focus?.() } catch { /* ignore */ }
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set
      || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
    if (setter) setter.call(el, value)
    else el.value = value
    try {
      el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, data: value, inputType: "insertFromPaste" }))
    } catch {
      el.dispatchEvent(new Event("input", { bubbles: true }))
    }
    for (const name of ["change", "blur"]) el.dispatchEvent(new Event(name, { bubbles: true }))
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
        out.push({ kind: "radio", el: radios, label, options: radios.map((r) => labelOf(r)), widget: "plain" })
        continue
      }
      let label = labelOf(el)
      if (t !== "file" && isTrap(el, label)) continue
      // A choice about being considered for other roles has no label of its own on some forms: its options say what it is.
      if (!label && el.tagName === "SELECT" && A.privacyChoice([...el.options].map((o) => o.text.trim())) >= 0) label = "Data privacy option"
      if (!label) continue
      // Widget catalog (not per-job): typeahead / Lever card / plain — shared detectWidgetKind when built in.
      const inCustom = Boolean(el.closest(".application-question.custom-question, li.custom-question"))
      const widgetOf = (kindHint) => (typeof A.detectWidgetKind === "function"
        ? A.detectWidgetKind({
          id: el.id,
          name: el.name,
          tagName: el.tagName,
          role: el.getAttribute("role"),
          ariaAutocomplete: el.getAttribute("aria-autocomplete"),
          className: typeof el.className === "string" ? el.className : "",
          inCustomQuestion: inCustom,
          kind: kindHint,
        })
        : (kindHint === "file" ? "file"
          : (el.id === "location-input" || el.classList.contains("location-input") || el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete") === "list")
            ? "typeahead"
            : (inCustom ? "card" : "plain")))
      if (el.getAttribute("role") === "combobox" && el.tagName === "INPUT") { out.push({ kind: "combobox", el, label, widget: "typeahead", ...(dropdownChoices.get(el)?.length ? { options: dropdownChoices.get(el) } : {}) }); continue }
      if (t === "file") out.push({ kind: "file", el, label, widget: "file" })
      else if (el.tagName === "SELECT") out.push({ kind: "select", el, label, options: [...el.options].map((o) => o.text.trim()), widget: "plain" })
      else if (el.tagName === "TEXTAREA") out.push({ kind: "textarea", el, label, widget: widgetOf() })
      else out.push({ kind: t === "number" ? "number" : "text", el, label, widget: widgetOf() })
    }
    // Dropdowns drawn as a button that opens a list (Workday): the button shows the choice, the list is made when it opens.
    for (const b of document.querySelectorAll('button[aria-haspopup="listbox"], [role="combobox"]:not(input):not(select), [aria-haspopup="listbox"]:not(input):not(select)')) {
      if (!shown(b) || b.closest("#odds-add, .odds-job-chance, .odds-apply-bar, nav, header, footer, [role='search']")) continue
      const by = (b.getAttribute("aria-labelledby") || "").split(/\s+/).filter((id) => id && id !== b.id).map((id) => textOf(document.getElementById(id))).filter(Boolean).join(" ")
      const label = by || (b.id && textOf(document.querySelector(`label[for="${CSS.escape(b.id)}"]`))) || b.getAttribute("aria-label") || ""
      if (label) out.push({ kind: "listbox", el: b, label, widget: "listbox", ...(dropdownChoices.get(b)?.length ? { options: dropdownChoices.get(b) } : {}) })
    }
    // Yes/No and other short choices drawn as buttons (Ashby): one entry per group, never the form's own Next/Submit.
    for (const box of document.querySelectorAll("div, fieldset")) {
      const buttons = [...box.children].filter((c) => c.tagName === "BUTTON" && c.type !== "submit")
      if (buttons.length < 2 || buttons.length > 6 || buttons.length !== box.children.length || !buttons.every((b) => shown(b) && textOf(b).length > 0 && textOf(b).length <= 40)) continue
      if (box.closest("#odds-add, .odds-job-chance, .odds-apply-bar, nav, header, footer, [role='search']") || buttons.some((b) => /^(next|continue|submit|review|apply|back|save|cancel|volgende|verder)/i.test(textOf(b)))) continue
      const label = choiceLabel(box)
      if (label) out.push({ kind: "choice", el: buttons, label, options: buttons.map(textOf), box, widget: "choice" })
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
  /** What a dropdown shows while nothing is chosen. */
  const PLACEHOLDER = /^[\s—–-]*(select( one)?|choose|selecteer|selectionner|sélectionner|sélectionnez|wählen|make a selection|pick)|^$/i
  const pressed = (b) => b.getAttribute("aria-pressed") === "true" || b.getAttribute("aria-checked") === "true" || b.getAttribute("aria-selected") === "true" || [...b.classList].some((c) => /(^|[^a-z])(active|selected|checked|pressed)([^a-z]|$)/i.test(c))
  /** What a searchable dropdown shows as its choice (react-select and the like), empty while nothing is chosen. */
  const comboValue = (input) => textOf(input.closest("[class*='control'], [class*='container'], [class*='select']")?.querySelector("[class*='single-value'], [class*='SingleValue'], [class*='selected-value']"))
  /** The options a dropdown shows now: the list that belongs to it, else the visible one on the page. */
  function listed(input) {
    const listbox = document.getElementById(input.getAttribute("aria-controls") || "") || [...document.querySelectorAll("[role='listbox']")].filter((l) => shown(l) && l.querySelector("[role='option']")).pop() || input.closest("[class*='container'], div")?.querySelector("[role='listbox']")
    let options = [...(listbox?.querySelectorAll("[role='option'], [data-automation-id='promptOption']") || [])].filter(shown)
    // Lever Current location: .dropdown-results children (no role=option).
    if (!options.length) {
      const box = input.closest(".application-field, .application-question, li") || input.parentElement
      const results = box?.querySelector(".dropdown-results")
      options = [...(results?.children || [])].filter((n) => shown(n) && textOf(n) && !/no location found|loading|try entering/i.test(textOf(n)))
    }

    return { options, texts: options.map(textOf) }
  }
  /** Puts text in a search box the way typing does, so a list that is only drawn for typing (react-select, an address search) draws. */
  function typeInto(input, text) {
    input.focus()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
    if (setter) setter.call(input, text)
    else input.value = text
    // Lever schedules its remote lookup on keydown, then reads the value after debounce.
    input.dispatchEvent(new KeyboardEvent("keydown", { key: text.slice(-1) || "Backspace", bubbles: true }))
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }))
    // Older autocomplete widgets search on keyup rather than input (including Lever).
    input.dispatchEvent(new KeyboardEvent("keyup", { key: text.slice(-1) || "Backspace", keyCode: text ? text.slice(-1).toUpperCase().charCodeAt(0) : 8, which: text ? text.slice(-1).toUpperCase().charCodeAt(0) : 8, bubbles: true }))
  }
  /**
   * Choices a custom dropdown only draws once opened ("Select an option"): opened, read and closed once, so Broods answers with an exact
   * option and the person is asked with a dropdown, never a free-text box whose answer the dropdown cannot take.
   */
  const dropdownChoices = new WeakMap()
  async function readChoices(f) {
    if (f.options?.length || (f.kind !== "combobox" && f.kind !== "listbox")) return f.options
    if (!dropdownChoices.has(f.el)) {
      let seen = []
      await pickOption(f.el, null, f.label, (list) => { seen = list; return -1 })
      dropdownChoices.set(f.el, seen.filter((o) => o && !PLACEHOLDER.test(o)).slice(0, 60))
    }
    const options = dropdownChoices.get(f.el)
    if (options.length) f.options = options
    return f.options
  }
  /** Opens a dropdown and clicks the option that means `answer`; answers whether one was clicked. */
  async function pickOption(input, answer, label, fallback) {
    const button = input.tagName === "BUTTON" || input.getAttribute("aria-haspopup") === "listbox"
    if (button) input.click()
    else {
      // A dropdown opens on a whole press (pointer down, mouse down, up, click) on its control box, as a hand does; the arrow key is the second try.
      const control = input.closest("[class*='control'], [class*='Control']") ?? input
      input.focus()
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        control.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }))
        await sleep(40)
      }
    }
    await sleep(150)
    let { options, texts } = listed(input)
    if (!button && texts.length === 0) {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", keyCode: 40, bubbles: true }))
      await sleep(250)
      ;({ options, texts } = listed(input))
    }
    const choose = (list) => {
      if (answer === null) return fallback ? fallback(list) : -1
      let i = A.chooseOption(list, answer, label)
      // "How did you hear?" with no LinkedIn in the list: the closest honest option.
      if (i < 0 && A.isHearQuestion(label)) i = A.heardChoice(list, answer)

      return i
    }
    let i = choose(texts)
    // Some lists open only for typing, or draw their choices from a search: the answer is typed and the match picked.
    // Typing searches the list; only for questions whose answer is a name to look up (a place, a school, a field, a language). A yes/no or legal
    // question is only ever answered with one of its own options — never with a city typed into it ("Amsterdam" in a non-compete question).
    const searchable = /\b(location|city|ville|lieu|plaats|woonplaats|stad|country|pays|land|school|university|universit\w*|[eé]cole|discipline|field of study|institution|degree|dipl[oô]me|nationalit\w*|language|langue|taal|skills?|comp[eé]tences?)\b/i.test(label || "")
    if (i < 0 && !button && answer !== null && input.tagName === "INPUT" && searchable) {
      typeInto(input, answer)
      // Remote place searches often take longer than 900 ms. Do not erase the
      // query while the employer is still fetching suggestions.
      for (let waited = 0; waited < 4000; waited += 100) {
        await sleep(100)
        ;({ options, texts } = listed(input))
        i = choose(texts)
        if (i >= 0 || texts.length) break
      }
      // A place, a school or a field is searched for: the first suggestion for it is the one.
      if (i < 0 && texts.length && /\b(location|city|school|university|discipline|field of study|institution)\b/i.test(label)) i = 0
      if (i < 0) { typeInto(input, ""); input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); input.blur(); return null }
    }
    if (i < 0) { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); if (!button) input.blur(); return null }
    const text = texts[i]
    options[i].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    options[i].click()
    await sleep(120)
    return text
  }

  const answered = (f) => {
    if (f.kind === "radio") return f.el.some((r) => r.checked)
    if (f.kind === "choice") return f.el.some(pressed)
    if (f.kind === "combobox") return comboValue(f.el) !== ""
    if (f.kind === "listbox") return !PLACEHOLDER.test(textOf(f.el))
    if (f.kind === "select") return f.el.selectedIndex >= 0 && f.el.value.trim() !== "" && !/^[\s—–-]*(please\s+)?(select|choose|selecteer|kies|make a selection|pick)/i.test(f.options[f.el.selectedIndex] || "")
    if (f.kind === "file") {
      if (f.el.files?.length > 0) return true
      // Lever uploads immediately and clears the native input afterwards.
      // Require both the named attachment and the site's visible success state.
      const box = f.el.closest(".application-field")
      return Boolean(box?.querySelector(".has-file .filename")?.textContent.trim()
        && [...box.querySelectorAll(".resume-upload-success")].some(shown)
        && ![...box.querySelectorAll(".resume-upload-failure")].some(shown))
    }
    // Lever Current location: only a dropdown pick counts (#selected-location); typed text alone is cleared.
    if (f.el?.id === "location-input" || f.el?.name === "location") {
      const sel = document.getElementById("selected-location")
      if (sel) return Boolean(sel.value)
    }
    return f.el.value.trim() !== ""
  }
  const elOf = (f) => (Array.isArray(f.el) ? f.el[0] : f.el)
  const boxOf = (f) => (f.kind === "choice" && f.box.parentElement) || (f.kind === "radio" && elOf(f).closest('[role="radiogroup"], fieldset')) || elOf(f).closest("[role='radiogroup'], fieldset, [data-automation-id], .field, .form-group, .application-question, label, div") || elOf(f)

  /** The person's CV in an upload asking for one, from odds. */
  async function uploadCv(f) {
    const around = `${f.label} ${f.el.name || ""} ${f.el.id || ""} ${f.el.getAttribute("aria-label") || ""}`
    // On a resume-only step, accept any file input even when the button says "Sélectionner un fichier".
    const resumeStep = isResumeAsk(around) || isResumeAsk(textOf(document.querySelector("h1, h2, h3")))
      || (f.kind === "file" && fields().filter((x) => x.kind !== "file").every((x) => answered(x) || !required(elOf(x), x.label)))
    if (uploaded || !cv || (!isResumeAsk(around) && !resumeStep)) return false
    const file = await ask({ type: "cv-file", doc: cv.id }, 15000)
    if (file?.status !== "ok") return false
    const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], file.name, { type: file.type }))
    try { f.el.files = transfer.files } catch { /* some ATS wrap the input */ }
    f.el.dispatchEvent(new Event("input", { bubbles: true }))
    f.el.dispatchEvent(new Event("change", { bubbles: true }))
    await sleep(80)
    uploaded = Boolean(f.el.files?.length) && f.el.getAttribute("aria-invalid") !== "true"
    return uploaded
  }

  /** Consent and terms remain the person's decision. */
  function tickConsents() { return 0 }

  /** Widget handlers — one path per ATS kind (typeahead / choice / listbox / card+plain / file). */
  async function fillTypeahead(f, answer, besideCountry) {
    const place = A.valueFor("text", f.label, answer, besideCountry)
    const tries = [...new Set([place, facts?.place, facts?.answers?.city && facts?.answers?.country ? `${facts.answers.city}, ${facts.answers.country}` : "", facts?.answers?.city ? `${facts.answers.city}, Netherlands` : ""].filter(Boolean))]
    for (const q of tries) {
      const expectedText = await pickOption(f.el, q, f.label, (texts) => (texts.length ? 0 : -1))
      if (expectedText !== null && (f.el.value.trim() !== "" || Boolean(document.getElementById("selected-location")?.value))) {
        return { ok: true, expected: null, expectedOption: -1, expectedText }
      }
    }
    return { ok: false, expected: null, expectedOption: -1, expectedText: null }
  }
  async function fillCombobox(f, answer) {
    const fallback = (texts) => { const only = A.privacyChoice(texts); if (only >= 0) return only; const d = A.demographicChoice(f.label, texts, facts); return d >= 0 ? d : A.preferenceChoice(f.label, texts) }
    const expectedText = await pickOption(f.el, answer, f.label, fallback)
    return { ok: expectedText !== null, expected: null, expectedOption: -1, expectedText }
  }
  function fillButtonChoice(f, answer) {
    let i = A.chooseOption(f.options, answer, f.label)
    if (i < 0 && A.isHearQuestion(f.label)) i = A.heardChoice(f.options, answer)
    if (i < 0) return { ok: false, expected: null, expectedOption: -1, expectedText: null }
    if (f.kind === "select") {
      f.el.selectedIndex = i
      for (const name of ["input", "change"]) f.el.dispatchEvent(new Event(name, { bubbles: true }))
    } else f.el[i].click()
    return { ok: true, expected: null, expectedOption: i, expectedText: null }
  }
  function fillPlainOrCard(f, answer, besideCountry) {
    const expected = A.valueFor(f.kind, f.label, answer, besideCountry)
    type(f.el, expected)
    return { ok: true, expected, expectedOption: -1, expectedText: null }
  }

  /** Fills in what odds knows; answers how many fields it filled and how many it left marked for the person. */
  async function fillAll() {
    let done = 0
    let left = 0
    done += tickConsents()
    const all = fields()
    const besideCountry = all.some((f) => /country code|landcode|code du pays|indicatif|country/i.test(f.label) && (f.kind === "select" || f.kind === "combobox" || f.kind === "listbox"))
    for (const f of all) {
      const box = boxOf(f)
      const control = elOf(f)
      const invalid = control.getAttribute("aria-invalid") === "true" || (control.willValidate && !control.validity.valid)
      const wrongValue = verifications.has(control) && !verifications.get(control)()
      if (answered(f) && !invalid && !wrongValue) {
        box.classList.remove("odds-ask")
        continue
      }
      if (f.widget === "file" || f.kind === "file") {
        if (!isResumeAsk(f.label) && !required(control, f.label) && !isResumeAsk(textOf(document.querySelector("h1, h2, h3")))) continue
        if (answered(f) && (invalid || wrongValue)) { box.classList.add("odds-ask"); left++; continue }
        if ((attempts.get(control) || 0) >= 2) { box.classList.add("odds-ask"); left++; continue }
        attempts.set(control, (attempts.get(control) || 0) + 1)
        if (await uploadCv(f)) {
          done++
        } else if (required(f.el, f.label) || isResumeAsk(f.label) || isResumeAsk(textOf(document.querySelector("h1, h2, h3")))) {
          box.classList.add("odds-ask")
          left++
        }
        continue
      }
      let answer = A.answerText(f.label, facts)
      // "Consider me for other roles too?": the choice that shares least (this job only) is taken, never the one that lets an employer keep the details.
      if (answer === null && (f.kind === "select" || f.kind === "radio" || f.kind === "choice" || f.kind === "combobox" || f.kind === "listbox")) {
        const only = A.privacyChoice(f.options || [])
        if (only >= 0) answer = f.options[only]
      }
      // Gender, age and background: Prefer not to say unless the person said they answer them themselves.
      if (answer === null && (f.kind === "select" || f.kind === "radio" || f.kind === "choice" || f.kind === "combobox" || f.kind === "listbox")) {
        const decline = A.demographicChoice(f.label, f.options || [], facts)
        if (decline >= 0) answer = f.options[decline]
      }
      // Voluntary disclosure handed back without options yet: Prefer not to answer.
      if (answer === null && typeof A.resolveAgentAnswer === "function") {
        const resolved = A.resolveAgentAnswer(f.label, facts, f.options || [])
        if (resolved !== null) answer = resolved
      }
      // A choice that changes nothing (which language would you prefer, which office): the first real option.
      if (answer === null && (f.kind === "select" || f.kind === "radio" || f.kind === "choice")) {
        const pick = A.preferenceChoice(f.label, f.options)
        if (pick >= 0) answer = f.options[pick]
      }
      const known = answer !== null || (typeof A.agentCanAnswer === "function" && A.agentCanAnswer(f.label, facts, f.options || []))
      // A site can discard a synthetic change on its next render. Retry known answers forever; only bounce unknowns.
      if (answered(f) && (invalid || wrongValue)) {
        if (known) { attempts.set(control, 0); verifications.delete(control) }
        else { box.classList.add("odds-ask"); left++; continue }
      }
      if ((attempts.get(control) || 0) >= 2) {
        // Known Autofill answers: never give up and dump on the person — Lever often clears a synthetic set; retry.
        if (known && !answered(f)) { attempts.set(control, 0); verifications.delete(control) }
        else if (known) { attempts.set(control, 0); box.classList.remove("odds-ask") }
        else { box.classList.add("odds-ask"); left++; continue }
      }
      let ok = false
      let expected = null
      let expectedOption = -1
      let expectedText = null
      if (answer !== null || f.kind === "listbox") {
        attempts.set(control, (attempts.get(control) || 0) + 1)
        const widget = f.widget || (f.kind === "choice" ? "choice" : f.kind === "listbox" || f.kind === "combobox" ? f.kind : "plain")
        let result
        if (widget === "typeahead") result = await fillTypeahead(f, answer, besideCountry)
        else if (widget === "listbox" || widget === "combobox" || f.kind === "combobox" || f.kind === "listbox") result = await fillCombobox(f, answer)
        else if (widget === "choice" || f.kind === "select" || f.kind === "radio" || f.kind === "choice") result = fillButtonChoice(f, answer)
        else result = fillPlainOrCard(f, answer, besideCountry)
        ok = result.ok
        expected = result.expected
        expectedOption = result.expectedOption
        expectedText = result.expectedText
      }
      if (ok) {
        const verify = () => expected !== null ? (f.el.value.trim() === expected.trim() || (/phone|mobile|telefoon/i.test(f.label) && f.el.value.replace(/\D/g, "") === expected.replace(/\D/g, ""))) : f.kind === "select" ? f.el.selectedIndex === expectedOption : f.kind === "radio" ? Boolean(f.el[expectedOption]?.checked) : f.kind === "choice" ? pressed(f.el[expectedOption]) : f.kind === "combobox" ? comboValue(f.el) === expectedText : f.kind === "listbox" ? textOf(f.el).toLowerCase().includes(String(expectedText).toLowerCase()) : answered(f)
        verifications.set(control, verify)
        await sleep(50)
        ok = verify() && answered(f) && control.getAttribute("aria-invalid") !== "true" && (!control.willValidate || control.validity.valid)
      }
      if (ok) {
        done++
        box.classList.remove("odds-ask")
      } else if (known && (attempts.get(control) || 0) < 2) {
        // Retry known answers next round — still not Ready until answered().
        box.classList.remove("odds-ask")
      } else if (answer !== null || required(elOf(f), f.label) || (known && !answered(f))) {
        box.classList.add("odds-ask")
        asked.add(f.label)
        left++
      }
    }
    return { done, left, any: all.length > 0 }
  }

  let bar = null
  let lastReport = 0
  function say(text, state) {
    if (!bar) {
      document.querySelectorAll(".odds-apply-bar").forEach(old => old.remove())
      bar = document.createElement("div")
      bar.className = "odds-apply-bar odds-apply-float"
      document.documentElement.append(bar)
    }
    // Censor: never claim Ready / Checking… while Autofill gaps or required empties remain.
    try {
      const gaps = stillEmptyGaps()
      const filled = formActuallyFilledDom()
      const blocked = (typeof A.chipAllowed === "function" && !A.chipAllowed({ stillEmptyGaps: gaps, formFilled: filled, message: text, state }))
        || (typeof A.forbiddenGapChip === "function" && A.forbiddenGapChip(text, gaps))
      if (blocked) {
        if (state === "done" || /Filled in by odds/i.test(text)) {
          text = "odds filled in what it knows. Answer the outlined questions: odds keeps your answers. Then check the form and send it yourself."
          state = "ask"
        } else if (/Checking that the website kept/i.test(text)) {
          text = "Still filling Autofill answers Odds already knows…"
          state = "filling"
        }
      }
    } catch { /* never let censor crash the fill loop */ }
    const status = state === "done" ? "ready" : state === "ask" ? "needs_input" : state === "problem" ? "failed" : "filling"
    const changed = bar.textContent !== text || bar.dataset.state !== state
    // Heartbeat so Odds keeps a live line even when the words stay the same.
    if (changed || Date.now() - lastReport > 4000) {
      lastReport = Date.now()
      ask({ type: "application-progress", status, message: text })
    }
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

  /** Profile-known or CV gaps still empty in the DOM — never claim Ready while any of these remain. */
  function stillEmptyGaps() {
    for (const f of fields()) {
      if (answered(f)) continue
      if (f.kind === "file" && cv && isResumeAsk(`${f.label} ${f.el.name || ""} ${f.el.id || ""}`)) return true
      if (f.kind !== "file" && typeof A.answerText === "function" && A.answerText(f.label, facts)) return true
      if (f.kind !== "checkbox" && required(elOf(f), f.label)) return true
      if (f.kind !== "file" && typeof A.isContactLabel === "function" && A.isContactLabel(f.label)) return true
    }
    return false
  }

  /** Censor: every required + contact field answered in the live DOM. */
  function formActuallyFilledDom() {
    const states = fields().map((f) => ({
      label: f.label,
      kind: f.kind,
      required: f.kind === "file" ? Boolean(cv && isResumeAsk(`${f.label} ${f.el.name || ""}`)) : f.kind !== "checkbox" && required(elOf(f), f.label),
      answered: answered(f),
      fillFailed: !answered(f) && f.kind !== "file" && typeof A.answerText === "function" && Boolean(A.answerText(f.label, facts)),
    }))
    if (typeof A.formActuallyFilled === "function") return A.formActuallyFilled(states)
    return !stillEmptyGaps()
  }
  function outlineEmptyGaps() {
    for (const f of fields()) {
      if (answered(f)) continue
      const known = (f.kind === "file" && cv && isResumeAsk(`${f.label} ${f.el.name || ""} ${f.el.id || ""}`))
        || (f.kind !== "file" && typeof A.answerText === "function" && A.answerText(f.label, facts))
        || (f.kind !== "checkbox" && required(elOf(f), f.label))
      if (known) boxOf(f).classList.add("odds-ask")
    }
  }
  function claimReady(agentTried) {
    if (stillEmptyGaps() || !formActuallyFilledDom()) {
      outlineEmptyGaps()
      // Never emit needs_input before Broods/Edge got a turn — that falsely "censors" the run and Broods never starts.
      if (!agentTried) {
        say("Filling what we know — asking Odds for the rest…", "filling")
        return false
      }
      const n = document.querySelectorAll(".odds-ask").length
      say(`odds filled in what it knows. Answer the ${n === 1 ? "outlined question" : `${Math.max(n, 2)} outlined questions`}: odds keeps your answers. Then check the form and send it yourself.`, "ask")
      return false
    }
    say("Filled in by odds. Check everything, then send it yourself.", "done")
    return true
  }

  /** Visible control label (text or aria). */
  const controlLabel = (b) => (textOf(b) || b.getAttribute("aria-label") || b.value || "").replace(/\s+/g, " ").trim()
  const controlHint = (b) => `${b.id || ""} ${b.getAttribute("data-automation-id") || ""} ${b.getAttribute("data-testid") || ""} ${b.className || ""} ${b.getAttribute("href") || b.href || ""}`
  const APPLY_LABEL = /^(apply(\s+now|\s+for this job|\s+on\b|\s+to this job)?|i'?m interested|solliciteer(\s+nu)?|solliciteren|nu solliciteren|bewerben|jetzt bewerben|postuler|ứng tuyển(\s+ngay)?|nộp đơn|aplicar|postular|candidati|aplikuj)\b/i
  const APPLY_SIGNAL = /apply|job-?app|jobapplication|applicationbutton|sollicit|bewerb|postul|candidat|aplicar|aplikuj/i
  const APPLY_DENY = /\b(submit|cart|giỏ hàng|share|chia sẻ|save job|newsletter|sign in|log in|password|captcha|create profile|create account|sign up|register)\b/i
  /** A job board's page that is not the form yet: Apply by label (any common locale) or by href/automation id (locale-proof). */
  function applyButton() {
    // Magnet.me / portal modals put Apply inside a <form> as type=submit — still click it.
    const controls = [...document.querySelectorAll("a, button, input[type=button], input[type=submit]")].filter((b) => {
      if (!shown(b)) return false
      // The site's own menu ("Apply for a job" in a student association's nav) and links to this very page are never the job's Apply.
      if (b.closest("nav, header, footer, [role='navigation'], [role='menu'], [role='menubar'], [class*='menu' i], [class*='navbar' i]")) return false
      const own = b.closest("a")
      if (own?.href && own.href.split("#")[0] === location.href.split("#")[0]) return false
      const label = controlLabel(b)
      if (APPLY_LABEL.test(label) && !APPLY_DENY.test(label)) return true
      return !b.closest("form") || b.type === "button"
    })
    return controls.find((b) => APPLY_LABEL.test(controlLabel(b)) && !APPLY_DENY.test(controlLabel(b)))
      || controls.find((b) => APPLY_SIGNAL.test(controlHint(b)) && !APPLY_DENY.test(`${controlLabel(b)} ${controlHint(b)}`))
      || null
  }

  /** The form's own way to the next step (never Submit). */
  const nextButton = () => [...document.querySelectorAll("form button, form input[type=button], button[data-automation-id='pageFooterNextButton']")].find(b => shown(b) && !b.disabled && /^(next|continue|review|save and continue|volgende|verder|weiter|suivant|continuar|tiếp tục)$/i.test(controlLabel(b)))
  /** Visible controls with href/automation hints — so suggest-action works when the label is in the user's language. */
  const visibleControls = () => [...document.querySelectorAll("a, button, input[type=button], input[type=submit]")].filter(shown).map((b) => {
    const text = controlLabel(b)
    if (text.length < 2 || text.length > 80) return null
    const href = (() => { try { const a = b.closest("a") || (b.tagName === "A" ? b : null); return a && "href" in a ? String(a.href || "") : "" } catch { return "" } })()
    return { text, href, hint: controlHint(b).slice(0, 200) }
  }).filter(Boolean).slice(0, 40)
  /** Never auto-click Submit / login / captcha / board signup. Cookie dismiss + Apply are allowed. */
  const AGENT_CLICK_DENY = /\b(submit|send application|password|captcha|sign[\s-]?in|log[\s-]?in|sign[\s-]?up|register|create (an )?account|create profile|accept all|all cookies)\b/i
  function humanConsentButton(el) {
    const box = el.closest('[class*="consent" i], [id*="consent" i], fieldset')
    return Boolean(box && /consent|agree|privacy|terms/i.test(textOf(box)) && !/cookies?/i.test(textOf(box)))
  }
  let agentActionTries = 0
  let agentActionUrl = ""
  /** Labels already clicked with no page change — next ask forces LLM and skips these. */
  const agentFailedLabels = []
  const AGENT_ACTION_MAX = 3
  /** All "which button?" asks in one application, across pages (kept on the run): a hard stop, never minutes of the same question. */
  const AGENT_RUN_MAX = 12
  /** When stuck: rules first, then force LLM with exclude so it can take over and finish. Fresh budget per URL. */
  async function tryAgentClick(status, opts = {}) {
    if (location.href !== agentActionUrl) {
      agentActionUrl = location.href
      agentActionTries = 0
      agentFailedLabels.length = 0
    }
    if (agentActionTries >= AGENT_ACTION_MAX) return false
    globalThis.oddsDismissCookies?.()
    const buttons = visibleControls()
    if (!buttons.length) return false
    const mem = await ask({ type: "apply-hunt", op: "get" }).catch(() => null)
    if ((mem?.hunt?.agentCalls ?? 0) >= AGENT_RUN_MAX) return false
    void ask({ type: "apply-hunt", op: "note", agent: true })
    agentActionTries += 1
    const forceLlm = opts.forceLlm === true || agentActionTries > 1 || agentFailedLabels.length > 0
    say(forceLlm ? "Asking Odds (LLM) how to unblock this step…" : "Asking Odds how to reach the application form…", "filling")
    const before = `${location.href}|${textOf(document.querySelector("h1, h2")).slice(0, 80)}|${fields().map((f) => f.label).slice(0, 8).join("|")}`
    const res = await ask({
      type: "suggest-action",
      url: location.href,
      buttons,
      status,
      force_llm: forceLlm,
      exclude: agentFailedLabels.slice(-8),
    })
    const want = typeof res?.text === "string" ? res.text.replace(/\s+/g, " ").trim() : ""
    if (res?.action !== "click" || !want || AGENT_CLICK_DENY.test(want)) return false
    const el = [...document.querySelectorAll("a, button, input[type=button], input[type=submit]")].find((b) => shown(b) && controlLabel(b) === want)
    if (!el || humanConsentButton(el)) {
      if (!agentFailedLabels.includes(want)) agentFailedLabels.push(want)
      return false
    }
    const cookiePick = /functional|necessary|reject|decline|alleen|refuser|ablehnen/i.test(want)
    say(cookiePick ? "Clearing the cookie banner…" : "Opening the employer’s application form…", "filling")
    const a = el.closest("a") || (el.tagName === "A" ? el : null)
    const h = a && "href" in a ? String(a.href || "") : ""
    if (/^https:\/\//i.test(h)) {
      // Never navigate to the same job URL again (Workday locale rewrite = infinite reopen).
      try {
        const a = new URL(h)
        const b = new URL(location.href)
        if (a.origin === b.origin && a.pathname.replace(/\/$/, "") === b.pathname.replace(/\/$/, "")) {
          await ask({ type: "apply-follow" })
          el.click()
        } else await ask({ type: "apply-go", url: h })
      } catch { await ask({ type: "apply-go", url: h }) }
    } else {
      await ask({ type: "apply-follow" })
      el.click()
    }
    await sleep(1000)
    const after = `${location.href}|${textOf(document.querySelector("h1, h2")).slice(0, 80)}|${fields().map((f) => f.label).slice(0, 8).join("|")}`
    // Dead click: remember the label so the next stuck pass forces LLM onto another control.
    if (before === after && !agentFailedLabels.includes(want)) agentFailedLabels.push(want)
    return before !== after || cookiePick
  }
  /** This page load was counted on the run (once per page, however often start() runs on it). */
  let visitNoted = false
  /** The person went back a step: Odds stops pushing forward on this page until they press Next/Apply themselves. */
  let pausedByPerson = false
  const PAUSED = "You went back a step, so Odds paused here. Press Next or Apply yourself and Odds carries on, or press Apply with Odds again."
  const BACK_LABEL = /^(back|previous|prev|go back|vorige|terug|zur(u|ü)ck|pr(e|é)c(e|é)dent|retour|anterior|atr(a|á)s)$/i
  const FORWARD_LABEL = /^(next|continue|review|save and continue|apply|apply now|volgende|verder|weiter|suivant|continuer|solliciteer|solliciteren|postuler)\b/i
  /** This page was reached with the browser's Back/Forward (not by Odds' own step back during a search). */
  async function cameBack() {
    if (performance.getEntriesByType("navigation")[0]?.type !== "back_forward") return false
    const mem = await ask({ type: "apply-hunt", op: "get" }).catch(() => null)
    return !(mem?.hunt?.backAt && Date.now() - mem.hunt.backAt < 15000)
  }
  function pauseForPerson() {
    pausedByPerson = true
    say(PAUSED, "ask")
    void ask({ type: "apply-pause", message: PAUSED })
  }
  /** This job's title (from Odds): the page Odds lands on must be this job, not the employer's list of vacancies. */
  let jobTitle = ""
  /** Whether a title or heading names this job: most of its words ("Apply for: B2C Marketing Intern" for "B2C MARKETING INTERN (CONTENT & RETAIL)"). */
  function namesJob(title, text) {
    const words = (t) => (t || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !/^(the|and|for|with|van|een|der|die|het|mvx|fte)$/.test(w))
    const want = [...new Set(words(title))]
    if (want.length < 2) return false
    const have = new Set(words(text))
    return want.filter((w) => have.has(w)).length / want.length >= 0.6
  }
  /** The employer's page is a list of vacancies (or another job), not this one: no form, the heading does not name it, and it links to several jobs. */
  function onJobList() {
    if (!jobTitle || boardName() || /linkedin\.com$/i.test(location.hostname)) return false
    if (namesJob(jobTitle, `${document.title} ${textOf(document.querySelector("h1"))} ${textOf(document.querySelector("h2"))}`)) return false
    const listPath = /\/(jobs|vacatures|vacancies|careers?|werken-bij|openings|positions|stages|internships)\/?$/i.test(location.pathname)
    const jobs = new Set([...document.querySelectorAll("a[href]")].filter((a) => shown(a) && /\/(jobs?|vacatures?|vacanc\w*|careers?|positions?|openings?|stages?|intern\w*)\b/i.test(a.pathname) && textOf(a).length >= 8 && textOf(a).length <= 160).map((a) => a.href.split("#")[0]))
    return listPath || jobs.size >= 4
  }
  /**
   * Looking for this job when the employer's link lands on their list (what a person does): open the link that names it, else the section most likely
   * to hold it (Odds picks; never one already tried), else one step back. Every try and dead end is kept for the whole run, across pages; after 3 tries
   * it stops and says so, never a loop.
   * @returns {Promise<"moved"|"stop">}
   */
  async function huntForJob() {
    const mem = (await ask({ type: "apply-hunt", op: "get" })) || {}
    const hunt = { tries: 0, dead: [], tried: [], ...(mem.hunt || {}) }
    const here = location.href.split("#")[0]
    const note = (extra) => ask({ type: "apply-hunt", op: "note", try: true, dead: here, ...extra })
    if (hunt.tries >= 3) {
      say(`Odds could not open the application form after assist: ${location.hostname} shows a list of jobs, not “${jobTitle}” (3 tries). Open the job yourself and Odds fills it in.`, "ask")
      return "stop"
    }
    const link = [...document.querySelectorAll("a[href]")].find((a) => shown(a) && /^https:/.test(a.href) && a.href.split("#")[0] !== here && !hunt.dead.includes(a.href.split("#")[0]) && namesJob(jobTitle, textOf(a) || a.getAttribute("aria-label") || ""))
    if (link) {
      await note({ label: textOf(link).slice(0, 120) })
      say(`Found “${jobTitle}” — opening it…`, "filling")
      await ask({ type: "apply-go", url: link.href })
      return "moved"
    }
    say(`This page lists other jobs, not “${jobTitle}” — looking for it (try ${hunt.tries + 1} of 3)…`, "filling")
    const buttons = visibleControls().filter((b) => !hunt.tried.includes(b.text) && !(b.href && hunt.dead.includes(b.href.split("#")[0])) && !AGENT_CLICK_DENY.test(b.text))
    const res = buttons.length ? await ask({
      type: "suggest-action",
      url: here,
      buttons,
      status: `find_this_job: "${jobTitle}". This page lists other vacancies. Pick the link or section most likely to lead to this job (internships / stages for an intern), never a different job.`,
      force_llm: true,
      exclude: hunt.tried.slice(-12),
    }).catch(() => null) : null
    const want = typeof res?.text === "string" ? res.text.replace(/\s+/g, " ").trim() : ""
    const el = res?.action === "click" && want && !AGENT_CLICK_DENY.test(want) ? [...document.querySelectorAll("a, button")].find((b) => shown(b) && controlLabel(b) === want) : null
    if (el) {
      await note({ label: want })
      const a = el.closest("a")
      if (a && /^https:/.test(a.href) && a.href.split("#")[0] !== here) await ask({ type: "apply-go", url: a.href })
      else { await ask({ type: "apply-follow" }); el.click() }
      return "moved"
    }
    const back = (() => { try { return document.referrer && new URL(document.referrer).hostname === location.hostname ? document.referrer.split("#")[0] : "" } catch { return "" } })()
    if (back && history.length > 1 && !hunt.dead.includes(back)) {
      await note({ back: true })
      say("Going back one page to look again…", "filling")
      history.back()
      return "moved"
    }
    await ask({ type: "apply-hunt", op: "note", try: false, dead: here })
    say(`Odds could not open the application form after assist: ${location.hostname} shows a list of jobs, not “${jobTitle}”. Open the job yourself and Odds fills it in.`, "ask")
    return "stop"
  }
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
  /** LinkedIn offsite often opens a NEW tab; intent is written a tick later — never silent-quit. */
  async function waitIntent() {
    for (let i = 0; i < 40; i++) {
      const { intent } = (await ask({ type: "apply-intent" })) || {}
      if (intent) return intent
      // Heartbeat so Odds never looks idle while the handoff catches up.
      if (i === 0 || i % 8 === 0) say("Waiting for Odds to attach this application…", "filling")
      await sleep(150)
    }
    return null
  }
  /** Job boards that need the person's own Chrome login before Apply can open (LinkedIn is apply.js). */
  function boardName() {
    const h = location.hostname
    if (/(^|\.)indeed\./i.test(h) || /secure\.indeed\.com$/i.test(h)) return "Indeed"
    if (/(^|\.)glassdoor\./i.test(h)) return "Glassdoor"
    return null
  }
  function boardLooksSignedOut(name) {
    const href = location.href
    if (name === "Indeed") {
      if (/secure\.indeed\.com|indeed\.[^/]+\/(account|auth|oauth|promo)|accounts\.google\.com/i.test(href)) return true
    }
    if (name === "Glassdoor") {
      if (/glassdoor\.[^/]+\/(profile\/login|auth|member\/home)|accounts\.google\.com/i.test(href)) return true
    }
    const h1 = textOf(document.querySelector("h1, h2")).slice(0, 140)
    const title = document.title.slice(0, 140)
    const password = [...document.querySelectorAll("input[type=password]")].some(shown)
    if (password && (/^(sign[\s-]?in|log[\s-]?in|inloggen|create (an )?account|register|welkom)\b/i.test(h1) || /\b(sign[\s-]?in|log[\s-]?in)\b/i.test(title))) return true
    const body = textOf(document.body).slice(0, 2800)
    if (name === "Indeed" && !fields().length && /\b(sign in to see|create an account or sign in|log in to continue|sign in to continue)\b/i.test(body)) return true
    if (name === "Glassdoor" && /\b(sign in to continue|create an account|log in to see|sign in for free)\b/i.test(body) && (password || !fields().length)) return true
    return false
  }
  /** Non-secret flag for Connect UI only — auth stays in Chrome cookies. */
  async function noteBoardSession(board) {
    try {
      const key = String(board || "").toLowerCase()
      if (!key) return
      const { oddsBoardSession = {} } = await chrome.storage.local.get("oddsBoardSession")
      oddsBoardSession[key] = Date.now()
      await chrome.storage.local.set({ oddsBoardSession })
    } catch {
      // storage blocked: session cookies still keep the person signed in
    }
  }
  async function ensureBoardSignedIn() {
    const name = boardName()
    if (!name) return true
    if (!boardLooksSignedOut(name)) {
      void noteBoardSession(name)
      return true
    }
    // Same wording as LinkedIn (apply.js) — Account chip in Odds, never silent Filling.
    const msg = `Sign in to ${name} in this Chrome tab first — then Odds continues. Odds never types your password.`
    say(msg, "ask")
    // Clear any stale Filling chip while we wait — Account is the truth until the wall clears.
    await ask({ type: "application-progress", status: "needs_input", message: msg }).catch(() => null)
    document.body.querySelector(".odds-apply-bar")?.classList.add("odds-apply-float")
    for (let i = 0; i < 600; i++) {
      await sleep(500)
      // Leave only when the login wall is gone (not when the login form still has an email field).
      if (!boardLooksSignedOut(name)) {
        void noteBoardSession(name)
        const cont = `Signed in to ${name} — continuing…`
        say(cont, "filling")
        await ask({ type: "application-progress", status: "filling", message: cont }).catch(() => null)
        return true
      }
      if (i % 20 === 0) {
        say(msg, "ask")
        await ask({ type: "application-progress", status: "needs_input", message: msg }).catch(() => null)
      }
    }
    const still = `Still not signed in to ${name}. Sign in on this tab, then press Open application tab.`
    say(still, "ask")
    await ask({ type: "application-progress", status: "needs_input", message: still }).catch(() => null)
    return false
  }

  async function start(opts = {}) {
    say("Filling in the background…", "filling")
    const intent = await waitIntent()
    if (!intent) {
      say("Odds did not attach this tab. Press Open application tab or Apply with Odds again.", "ask")
      return
    }
    // Every page this application loads is counted on the run (it survives reloads): the same page again and again, or too many pages, stops for good.
    if (!visitNoted) {
      visitNoted = true
      const visit = await ask({ type: "apply-hunt", op: "visit" }).catch(() => null)
      if (visit?.stop) {
        say(visit.message, "ask")
        return
      }
    }
    // The person went back (browser Back) or paused earlier: stay on their page, push nothing forward, say so in Odds.
    if (!opts.forced && (intent.paused || await cameBack())) {
      pauseForPerson()
      return
    }
    pausedByPerson = false
    const kit = await ask({ type: "apply-kit", url: intent.job })
    if (!kit || kit.status === "connect") return say("Connect odds (its icon in the toolbar) to have this form filled in.", "problem")
    if (kit.status !== "ok") return say("Could not load your application details. Open Odds and try again.", "problem")
    applicationJob = intent.job
    facts = kit.facts || {}
    jobTitle = typeof kit.job_title === "string" ? kit.job_title : (typeof intent.title === "string" ? intent.title : "")
    if (jobTitle) void ask({ type: "apply-hunt", op: "title", title: jobTitle })
    const jobId = kit.job_id || facts.job_id || null
    // Same job id Broods keys use — without this, remembered answers never match answerText().
    if (jobId) facts.job_id = jobId
    const handoff = globalThis.oddsApplicationHandoff?.(intent.job, ask, jobId)
    cv = kit.cv
    if (!listening) {
    listening = true
    document.addEventListener("click", (event) => {
      const b = event.target instanceof Element ? event.target.closest("button, input[type=submit], a") : null
      if (b && /submit|send|next|continue|verzend|versturen|volgende|apply|solliciteer|review/i.test(textOf(b) || b.value || "")) keep()
    }, true)
    document.addEventListener("submit", keep, true)
    // The person's own clicks (never Odds' synthetic ones): Back/Previous pauses Odds; their Next/Apply after that resumes it.
    document.addEventListener("click", (event) => {
      if (!event.isTrusted) return
      const b = event.target instanceof Element ? event.target.closest("button, a, input[type=button], input[type=submit]") : null
      const label = b ? controlLabel(b) : ""
      if (!label) return
      if (BACK_LABEL.test(label)) pauseForPerson()
      else if (pausedByPerson && FORWARD_LABEL.test(label)) {
        pausedByPerson = false
        void ask({ type: "apply-pause", resume: true })
        setTimeout(() => launch(true), 1200)
      }
    }, true)
    // A page brought back from the browser's memory (Back) runs no new script: pause the same way.
    window.addEventListener("pageshow", (event) => { if (event.persisted && applicationJob) pauseForPerson() })
    }
    // Indeed / Glassdoor guest: tell the person to sign in — do not hang on Filling / Looking for Apply.
    if (!(await ensureBoardSignedIn())) return
    const advanced = new WeakMap()
    let pressed = false
    let verifiedRounds = 0
    let sawForm = false
    // Only a real applicant form may become "ready" — not a listing or empty page.
    let sawApplicant = false
    // Watchdog: same page signature with no progress → recover once, then report stuck (so Odds / agents can see it).
    let lastSig = ""
    let stuckRounds = 0
    let recovered = false
    /** Broods/Edge suggest-answers (or scan) already ran once this start() — only then may we needs_input. */
    let agentTried = false
    let agentAskedSig = ""
    /** Hard cap: Workday FR resume step used to re-ask Broods every DOM re-render (stupid "Asking Odds…" loop). */
    let agentFillCalls = 0
    const AGENT_FILL_MAX = 1
    /** Broods scan already ran for known-Autofill stall (Checking… / typeahead won't stick). */
    let gapsBroodsTried = false
    /** When Workday advances Reprendre → Contact, re-open fill (do not keep the resume-step Broods burn). */
    let lastStepSig = ""
    /** Listing removed / expired (Indeed etc.): stop Apply and close the job server-wide — never fake Filling. */
    const LISTING_GONE = /(this )?(job|position|posting|vacature) (has )?(expired|been (filled|removed|closed)|is (no longer|not) (available|accepting)|niet meer beschikbaar)|job (not found|no longer available)|we (couldn.?t|cannot|can.?t) find (this|that|the) job|this posting is no longer|deze vacature (bestaat niet|is verlopen|is gesloten|is niet meer)|no longer accepting applications|not currently accepting applications|applications? (are|is) closed/i
    const listingGone = () => {
      const t = textOf(document.querySelector("main, [role=main], .jobsearch-JobComponent, .jobsearch-NoResult") || document.body).slice(0, 5000)
      if (LISTING_GONE.test(t)) return true
      // Indeed often drops /viewjob?jk=… into a search/home page when the listing is gone.
      if (/(^|\.)indeed\./i.test(location.hostname)) {
        // Auth redirect is Sign-in, not “listing gone”.
        if (/secure\.indeed\.com|\/account\/|\/auth/i.test(location.href)) return false
        const hadJk = /[?&]jk=/i.test(intent.job || "") || /\/viewjob/i.test(intent.job || "")
        const onListing = /[?&]jk=/i.test(location.search) || /\/viewjob/i.test(location.pathname)
        if (hadJk && !onListing) return true
      }
      return false
    }
    /** Same-URL navigate / Workday "1 Erreur" — never apply-go again (that was the reopen loop). */
    const pageBroken = () => {
      const t = textOf(document.body).slice(0, 4000)
      if (/\b(1\s+erreur|\d+\s+erreurs?|an error occurred|something went wrong|page (is )?unavailable|unable to (load|process)|we'?re sorry)\b/i.test(t)) return true
      // Workday spinner forever with no form fields and an error chip.
      if (/\.myworkday(jobs|site)\.com$/i.test(location.hostname) && !fields().length) {
        if ([...document.querySelectorAll("[role=alert], [data-automation-id*=error], .error")].some((e) => shown(e) && /erreur|error/i.test(textOf(e)))) return true
      }
      return false
    }
    const sameJobUrl = (href) => {
      try {
        const a = new URL(href, location.href)
        const b = new URL(location.href)
        return a.origin === b.origin && a.pathname.replace(/\/$/, "") === b.pathname.replace(/\/$/, "")
      } catch { return false }
    }
    /** Ask Broods/Edge for short answers on empty fields (profile + low-stakes questions). */
    async function askAgentFills() {
      // Hard stop — never loop "Asking Odds…" when Workday re-renders the same step.
      if (agentFillCalls >= AGENT_FILL_MAX || agentTried) return false
      // Only send real questions — "Type your response" / file chrome starve both rules and Broods.
      const empty = fields().filter((f) => f.kind !== "file" && !answered(f) && realAsk(f.label, true) && !genericUpload(f.label) && !isResumeAsk(f.label)).slice(0, 12)
      if (!empty.length) {
        // CV-only / no text gaps: do not keep calling Broods — mark tried so the ladder advances.
        agentTried = true
        return false
      }
      const sig = empty.map((f) => f.label).join("|")
      if (agentAskedSig === sig) { agentTried = true; return false }
      agentAskedSig = sig
      for (const f of empty) await readChoices(f)
      agentFillCalls += 1
      agentTried = true
      say("Asking Odds for answers from your profile…", "filling")
      const res = await ask({
        type: "suggest-answers",
        url: location.href,
        questions: empty.map((f) => ({
          key: A.applicationQuestionKey(f.label, jobId),
          label: f.label.slice(0, 200),
          kind: f.kind === "choice" ? "radio" : (f.kind === "combobox" || f.kind === "listbox") && f.options?.length ? "select" : f.kind,
          ...(f.options ? { options: f.options.slice(0, 40) } : {}),
        })),
      }, 15000).catch(() => null)
      // MCP / apply-agent return { accepted }; never look only at .answers (that dropped every Broods fill).
      const answers = Array.isArray(res?.accepted) ? res.accepted
        : Array.isArray(res?.answers) ? res.answers
        : Array.isArray(res) ? res : []
      let n = 0
      for (const a of answers) {
        if (typeof a?.key !== "string" || typeof a?.answer !== "string" || !a.answer.trim()) continue
        facts.remembered = { ...(facts.remembered || {}), [a.key]: a.answer.slice(0, 1000) }
        n++
      }
      if (n) {
        for (const f of fields()) { attempts.delete(elOf(f)); verifications.delete(elOf(f)) }
        say(`Odds filled ${n} answer${n === 1 ? "" : "s"} from your profile — continuing…`, "filling")
      } else {
        say("Odds checked your profile — filling what the rules know…", "filling")
      }
      return n > 0
    }

    /**
     * Last resort before Stuck: Broods must confirm (scan + answers + click).
     * Never leave the person staring at Filling with no agent turn.
     * @returns {"moved"|"human"|"stuck"}
     */
    async function agentConfirm(status) {
      agentTried = true
      say("No progress — Broods is reading this page…", "filling")
      const heading = document.title + " " + textOf(document.querySelector("h1, h2"))
      const dropdownOpts = [...document.querySelectorAll(".dropdown-location, .dropdown-results > *, [role='option']")]
        .filter((n) => shown(n) && textOf(n) && !/no location found|loading|try entering/i.test(textOf(n)))
        .map((n) => textOf(n).slice(0, 80))
        .slice(0, 12)
      const snapshot = {
        title: document.title.slice(0, 120),
        headings: [...document.querySelectorAll("h1, h2")].map((h) => textOf(h).slice(0, 80)).filter(Boolean).slice(0, 5),
        errors: [...document.querySelectorAll('[role="alert"], .error, [aria-invalid="true"]')].map((e) => textOf(e).slice(0, 100)).filter(Boolean).slice(0, 10),
        fields: fields().slice(0, 25).map((f) => ({
          label: f.label.slice(0, 120),
          kind: f.kind,
          required: true,
          empty: !answered(f),
          key: A.applicationQuestionKey(f.label, jobId),
          // Choices let Broods answer with an exact option from Autofill (it only had the label before).
          ...(f.options ? { options: f.options.slice(0, 20).map((o) => String(o).slice(0, 80)) } : {}),
        })),
        buttons: [...visibleControls().map((b) => b.text).filter(Boolean), ...dropdownOpts].slice(0, 40),
        censor_flags: typeof A.classifyCensorFlags === "function"
          ? A.classifyCensorFlags({
            fields: fields().map((f) => ({
              label: f.label,
              kind: f.kind,
              required: f.kind !== "checkbox" && required(elOf(f), f.label),
              answered: answered(f),
              fillFailed: !answered(f) && f.kind !== "file" && typeof A.answerText === "function" && Boolean(A.answerText(f.label, facts)),
            })),
            hasForm: fields().length > 0,
            hasApplyCta: Boolean(applyButton()),
            hasNext: Boolean(nextButton()),
            captcha: Boolean(blockingCaptcha()),
            account: [...document.querySelectorAll('input[type="password"]')].some((e) => shown(e)),
            stuckLoop: /stuck/i.test(status),
            listingGone: false,
            onReview: false,
          })
          : [],
        facts: {
          name: facts?.name || null,
          email: facts?.email || facts?.answers?.email || null,
          phone: facts?.phone || facts?.answers?.phone || null,
          city: facts?.answers?.city || facts?.place || null,
          place: facts?.place || null,
        },
      }
      const scan = await ask({ type: "suggest-scan", url: location.href, status, snapshot }).catch(() => null)
      if (scan?.stage === "captcha" && blockingCaptcha()) {
        say("Captcha on the page — open the tab when you can, then Odds continues.", "ask")
        return "human"
      }
      if (scan?.stage === "account") {
        say("Account or login required — open the tab when you can. Odds never creates accounts or types passwords.", "ask")
        return "human"
      }
      if (Array.isArray(scan?.answers) && scan.answers.length) {
        for (const a of scan.answers) {
          if (typeof a?.key !== "string" || typeof a?.answer !== "string" || !a.answer.trim()) continue
          facts.remembered = { ...(facts.remembered || {}), [a.key]: a.answer.slice(0, 1000) }
        }
        for (const f of fields()) { attempts.delete(elOf(f)); verifications.delete(elOf(f)) }
        say("Odds confirmed answers from Broods — filling them in…", "filling")
        return "moved"
      }
      if (scan?.action === "click" && typeof scan.text === "string" && !AGENT_CLICK_DENY.test(scan.text)) {
        const want = scan.text.replace(/\s+/g, " ").trim()
        const el = [...document.querySelectorAll("a, button, input[type=button], input[type=submit]")].find((b) => shown(b) && controlLabel(b) === want)
          || [...document.querySelectorAll(".dropdown-location, .dropdown-results > *, [role='option']")].find((b) => shown(b) && textOf(b).replace(/\s+/g, " ").trim() === want)
        if (el && !humanConsentButton(el)) {
          await ask({ type: "apply-follow" })
          el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
          el.click()
          pressed = true
          say("Odds confirmed the next click — continuing…", "filling")
          return "moved"
        }
      }
      if (await askAgentFills()) return "moved"
      if (await tryAgentClick(status, { forceLlm: true })) { pressed = true; return "moved" }
      if (fields().some((f) => f.kind !== "file" && !answered(f))) {
        await fillAll()
        await handoff?.publish(fields().filter((f) => f.kind !== "file" && boxOf(f).classList.contains("odds-ask")), facts)
        say("odds filled in what it knows. Answer the outlined questions: odds keeps your answers. Then check the form and send it yourself.", "ask")
        return "human"
      }
      say("Odds assist could not move this application forward after assist. Open the tab to continue.", "ask")
      return "stuck"
    }

    // Pages that draw their form late, or one step at a time (Workday): filled in again as fields come.
    for (let round = 0; round < 120; round++) {
      if (pausedByPerson) return
      globalThis.oddsDismissCookies?.()
      // Redirected to board login mid-apply — same Sign-in instruction, then resume.
      if (boardName() && boardLooksSignedOut(boardName()) && !(await ensureBoardSignedIn())) return
      // Heartbeat while still filling — never overwrite Captcha / Account / outlined (ask) with Filling.
      {
        const barState = document.body.querySelector(".odds-apply-bar")?.dataset.state
        if ((round === 0 || round % 5 === 0) && barState !== "ask" && barState !== "done" && barState !== "problem") {
          say(round === 0 ? "Filling in the background…" : "Continuing in the background…", "filling")
        }
      }
      if (confirmed()) return
      if (listingGone()) {
        say("This job is no longer available. No application was submitted.", "problem")
        document.body.querySelector(".odds-apply-bar")?.classList.add("odds-apply-float")
        await ask({ type: "job-closed", url: intent.job || location.href }).catch(() => null)
        return
      }
      if (pageBroken()) {
        const outcome = await agentConfirm("page_error")
        if (outcome === "moved") { stuckRounds = 0; continue }
        return
      }
      // Fill from profile FIRST every round — never escalate to Stuck while name/email are still empty.
      {
        const early = await fillAll()
        if (early.done > 0) {
          stuckRounds = 0
          sawForm = true
        }
      }
      const heading = document.title + " " + textOf(document.querySelector("h1, h2"))
      const pageSig = `${location.href}|${heading.slice(0, 120)}|${fields().map((f) => `${f.label}:${answered(f) ? 1 : 0}`).slice(0, 12).join("|")}|${pressed}|${sawApplicant}`
      if (pageSig === lastSig) stuckRounds += 1
      else { lastSig = pageSig; stuckRounds = 0 }
      const emptyKnown = () => stillEmptyGaps()
      const emptyAny = () => fields().some((f) => f.kind !== "file" && !answered(f) && required(elOf(f), f.label))
      // First stall: refill + Broods answers/click — never wait until desktop Stuck.
      if (stuckRounds >= 8 && !recovered) {
        recovered = true
        stuckRounds = 0
        say("No progress — filling again and asking Odds…", "filling")
        for (const f of fields()) { attempts.delete(elOf(f)); verifications.delete(elOf(f)) }
        const refill = await fillAll()
        if (refill.done > 0) continue
        if (await askAgentFills()) {
          await fillAll()
          continue
        }
        const again = applyButton()
        if (again) {
          const a = again.closest("a") || (again.tagName === "A" ? again : null)
          const h = a && "href" in a ? String(a.href || "") : ""
          if (/^https:\/\//i.test(h) && !sameJobUrl(h)) await ask({ type: "apply-go", url: h })
          else { await ask({ type: "apply-follow" }); again.click() }
          await sleep(800)
          continue
        }
        if (await tryAgentClick("stuck_no_progress", { forceLlm: true })) { pressed = true; continue }
      }
      // Second stall: Broods must confirm (scan) before any Stuck chip.
      if (stuckRounds >= 16) {
        if (emptyKnown() || emptyAny()) {
          for (const f of fields()) { attempts.delete(elOf(f)); verifications.delete(elOf(f)) }
          if (await askAgentFills()) {
            const again = await fillAll()
            if (again.done > 0 || emptyKnown()) { stuckRounds = 0; continue }
          }
          const forced = await fillAll()
          if (forced.done > 0) { stuckRounds = 0; continue }
        }
        const scanSig = `${location.href}|${heading.slice(0, 80)}`
        if (globalThis.__oddsScanSig === scanSig) {
          // Already confirmed this page — stop after assist (never silent loop).
          say("Odds assist could not move this application forward after assist. Open the tab to continue.", "ask")
          return
        }
        globalThis.__oddsScanSig = scanSig
        const outcome = await agentConfirm("stuck_loop")
        if (outcome === "moved") { stuckRounds = 0; continue }
        return
      }
      // Read the form first: Workday account steps often have name + password together —
      // fill what we know, then stop for the password (never gate the whole page on password alone).
      const candidates = fields()
      // New wizard step (Kraft FR Reprendre → Contact): allow fill + one Broods turn again; never stuck on resume burn.
      const stepSig = [...document.querySelectorAll("h1, h2, h3, [data-automation-id='pageHeader']")].map(textOf).join("|").slice(0, 200)
      if (stepSig && stepSig !== lastStepSig) {
        if (lastStepSig) {
          agentTried = false
          gapsBroodsTried = false
          agentFillCalls = 0
          agentAskedSig = ""
          for (const f of candidates) { attempts.delete(elOf(f)); verifications.delete(elOf(f)) }
        }
        lastStepSig = stepSig
      }
      // English, Dutch and French contact labels (Workday fr-FR / Kraft Heinz): accents stripped in the match via \w? for e in telephone/prenom.
      const applicant = candidates.some(f => f.kind === "file" || /first.?name|last.?name|full.?name|given name|family name|voornaam|achternaam|prenom|nom de famille|email|e-?mail|courriel|phone|telephone|telefoon|portable|resume|curriculum|cover letter|\bcv\b|reprendre/i.test(f.label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")))
      if (applicant && !sawApplicant) {
        // The real form: kept as this job's application address, so the next run (and Open application tab) goes straight here.
        void ask({ type: "apply-hunt", op: "form" })
      }
      if (applicant) sawApplicant = true
      // Landed on the employer's list of vacancies (or another job): look for this one like a person would, at most 3 tries — never loop on it.
      if (!applicant && !sawApplicant && round >= 2 && onJobList()) {
        if (await huntForJob() === "moved") { await sleep(1500); continue }
        return
      }
      const challenge = blockingCaptcha()
      // Only the page heading — never document.title / nav chrome ("Sign in" link on Studentjob, Jobster, etc.).
      const pageHead = textOf(document.querySelector("h1, h2")).trim()
      const login = /^(sign[\s-]?in|log[\s-]?in|create (an )?account|register|sign up|inloggen|account aanmaken|mot de passe|cr[eé]er un compte)\b/i.test(pageHead)
        || (/\b(sign[\s-]?in|log[\s-]?in|create (an )?account|inloggen|account aanmaken)\b/i.test(pageHead) && pageHead.length < 80 && !/\b(intern|job|vacature|sollicit|apply|application|marketing|content)\b/i.test(pageHead))
      const passwordField = [...document.querySelectorAll('input[type="password"]')].some(shown)
      // Captcha: only a real visible challenge. Hidden reCAPTCHA on Bamboo/etc. must not block fill.
      // When the applicant form is already on screen, keep filling — person handles captcha at send if needed.
      if (challenge && !applicant) {
        verifiedRounds = 0
        say("Captcha on the page — open the tab when you can, then Odds continues.", "ask")
        await sleep(2000)
        continue
      }
      // Sign-in (Glassdoor/Workday/etc.): fill email/username from Odds profile first; never passwords.
      // fields() already skips password inputs.
      if ((login && passwordField) || ((login || passwordField) && !sawApplicant)) {
        verifiedRounds = 0
        const { any } = await fillAll()
        say(
          any
            ? "Email from your Odds profile is filled in. Type your password on the tab — Odds never types passwords."
            : "Account or login required — open the tab when you can. Odds never creates accounts or types passwords.",
          "ask",
        )
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
      if (portalFrame && !candidates.length) {
        say("Waiting for the application form to load…", "filling")
        await sleep(1000)
        continue
      }
      const go = !applicant && !pressed ? applyButton() : null
      if (go) {
        pressed = true
        say("Opening the employer’s application form…", "filling")
        // Same tab when Apply is a real link (Glassdoor "Apply on the employer's website"): one job, one tab.
        const href = (() => {
          const a = go.closest("a") || (go.tagName === "A" ? go : null)
          const h = a && "href" in a ? String(a.href || "") : ""
          return /^https:\/\//i.test(h) ? h : null
        })()
        if (href && !sameJobUrl(href)) await ask({ type: "apply-go", url: href })
        else {
          await ask({ type: "apply-follow" })
          go.click()
        }
        await sleep(500)
        continue
      }
      // Still on a listing (no Apply match yet): ask Odds once early — don't wait until the desktop stuck message.
      if (!applicant && !pressed && round >= 2 && await tryAgentClick("no_apply_yet")) {
        pressed = true
        continue
      }
      if (await handoff?.refresh(facts)) {
        for (const f of fields()) { attempts.delete(elOf(f)); verifications.delete(elOf(f)) }
      }
      let { done, any } = await fillAll()
      // Resume-only step (Kraft FR "Reprendre"): after CV lands, press Suivant — never Broods-loop.
      // Check every heading — job title is often h1 while the step is h2 "Reprendre".
      const headingsJoined = [...document.querySelectorAll("h1, h2, h3, [data-automation-id='pageHeader']")].map(textOf).join(" | ")
      const resumeOnly = isResumeAsk(headingsJoined)
        && !fields().some((f) => f.kind !== "file" && !answered(f) && (required(elOf(f), f.label) || (typeof A.isContactLabel === "function" && A.isContactLabel(f.label))))
      if (resumeOnly && (uploaded || fields().some((f) => f.kind === "file" && answered(f)))) {
        const nxt = nextButton()
        if (nxt && !nxt.disabled) {
          say("CV uploaded — continuing…", "filling")
          for (const f of fields()) { attempts.delete(elOf(f)); verifications.delete(elOf(f)) }
          nxt.click()
          stuckRounds = 0
          uploaded = false // next page may ask for another file; allow upload again
          await sleep(700)
          continue
        }
      }
      // Broods before human: empty outlined / known gaps → suggest-answers once, stay on filling (never false needs_input).
      if (sawApplicant && !agentTried && stillEmptyGaps()) {
        if (await askAgentFills()) {
          const again = await fillAll()
          done += again.done
          any = any || again.any
          stuckRounds = 0
        } else if (await tryAgentClick("empty_before_human", { forceLlm: false })) {
          pressed = true
          continue
        }
      }
      const handBack = fields().filter(f => f.kind !== "file" && boxOf(f).classList.contains("odds-ask") && !(typeof A.agentCanAnswer === "function" && A.agentCanAnswer(f.label, facts, f.options || [])))
      for (const f of handBack) await readChoices(f)
      await handoff?.publish(handBack, facts)
      const unsupported = [...document.querySelectorAll('[aria-required="true"][role="combobox"], [aria-required="true"][role="checkbox"]')].filter(e => shown(e) && (e.getAttribute("aria-checked") !== "true") && !e.matches("input, select, textarea"))
      const errors = [...document.querySelectorAll('[role="alert"]')].filter(e => shown(e) && /error|invalid|required|failed|too large|not supported/i.test(textOf(e)))
      // A password to make (an account is needed to apply): never typed by odds, so the application is not finished and is not "ready".
      const passwords = [...document.querySelectorAll('input[type="password"]')].filter((e) => shown(e) && !e.value)
      const total = document.querySelectorAll(".odds-ask").length + unsupported.length + errors.length + passwords.length
      const next = nextButton()
      if (any) sawForm = true
      verifiedRounds = sawApplicant && (any || sawForm) && total === 0 && !stillEmptyGaps() ? verifiedRounds + 1 : 0
      if (any && (done || total || round > 2)) {
        // Password / real login heading only — never treat a site-wide "Sign in" nav as Account once fields exist.
        if (passwords.length) say("This site needs an account. Choose your password on the page: odds never types passwords. The rest is filled in.", "ask")
        else if (!sawApplicant && login) say("Sign in or make the account yourself; odds fills in the form after.", "ask")
        else if (!sawApplicant) say(candidates.length ? "Filling what we know…" : "Waiting for the application form…", "filling")
        else if (stillEmptyGaps()) {
          // Stage machine: filling → agent_answers → agent_scan → human. Never Checking… with gaps.
          const stage = typeof A.nextApplyStage === "function"
            ? A.nextApplyStage({
              formFilled: formActuallyFilledDom(),
              stillEmptyGaps: true,
              agentAnswersTried: agentTried,
              agentScanTried: gapsBroodsTried,
              captcha: Boolean(challenge),
              account: Boolean(passwords.length),
            })
            : (!agentTried ? "agent_answers" : (!gapsBroodsTried ? "agent_scan" : "human"))
          if (stage === "agent_answers") {
            say("Filling what we know — asking Odds for the rest…", "filling")
            if (await askAgentFills()) { stuckRounds = 0; continue }
            // Empty answers still counts as tried so we escalate to Broods scan in this round.
          }
          if (stage === "agent_scan" || (agentTried && !gapsBroodsTried)) {
            gapsBroodsTried = true
            const outcome = await agentConfirm("known_gaps_stall")
            if (outcome === "moved") { stuckRounds = 0; continue }
            if (outcome === "human" || outcome === "stuck") return
          }
          if (stage === "human" || gapsBroodsTried) {
            if (round < 40) say("Still filling Autofill answers — Broods already checked…", "filling")
            else if (claimReady(agentTried)) return
          }
        }
        else if (total && !agentTried) say("Filling what we know — asking Odds for the rest…", "filling")
        else if (total) say(`odds filled in what it knows. Answer the ${total === 1 ? "outlined question" : `${total} outlined questions`}: odds keeps your answers. Then check the form and send it yourself.`, "ask")
        else if (tickConsents()) say("Continuing to the next application step…", "busy")
        else if ([...document.querySelectorAll('input[type="checkbox"]')].some((c) => shown(c) && !c.checked && (c.required || c.getAttribute("aria-required") === "true") && !A.isConsentCheckbox?.(labelOf(c) || textOf(c.closest("label, fieldset") || c.parentElement)))) say("Everything is filled in. Check the remaining boxes and send it yourself.", "done")
        else if (next && !stillEmptyGaps()) {
          // Was say-only — Kraft FR "Suivant" never advanced → Asking Odds / Checking loop.
          say("Continuing to the next application step…", "busy")
          next.click()
          stuckRounds = 0
          verifiedRounds = 0
          await sleep(500)
          continue
        }
        else if (verifiedRounds < 2 && !stillEmptyGaps()) say("Checking that the website kept your details and CV…", "busy")
        else if (claimReady(agentTried)) return
      } else if (!any && sawApplicant && sawForm && total === 0) {
        // The steps are through (a review page has no fields): what is left is the person's to check and send.
        if (next) {
          say("Continuing to the next application step…", "busy")
          next.click()
          stuckRounds = 0
          await sleep(500)
          continue
        }
        else if (!passwords.length && claimReady(agentTried)) return
      } else if (!any && round >= 6) {
        if (challenge) {
          say("Captcha on the page — open the tab when you can, then Odds continues.", "ask")
        } else if (login || passwordField) {
          say("Account or login required — open the tab when you can. Odds never creates accounts or types passwords.", "ask")
        } else {
          // Broods confirms before Stuck — never dump the person on a silent empty page.
          const outcome = await agentConfirm("no_form")
          if (outcome === "moved") { stuckRounds = 0; continue }
          // agentConfirm already said Stuck / human — do not leave Filling.
          return
        }
      } else if (!any && !pressed && round === 3) {
        // No form here: the board's own Apply opens it (the intent going along to a new tab).
        const boardApply = applyButton()
        if (boardApply) {
          pressed = true
          say("Opening the employer’s application form…", "filling")
          const href = (() => {
            const a = boardApply.closest("a") || (boardApply.tagName === "A" ? boardApply : null)
            const h = a && "href" in a ? String(a.href || "") : ""
            return /^https:\/\//i.test(h) ? h : null
          })()
          if (href && !sameJobUrl(href)) await ask({ type: "apply-go", url: href })
          else {
            await ask({ type: "apply-follow" })
            boardApply.click()
          }
        } else if (await tryAgentClick("no_apply_button")) {
          pressed = true
          continue
        }
      }
      if (verifiedRounds >= 2 && sawApplicant && !stillEmptyGaps()) {
        const signature = `${textOf(document.querySelector("h1, h2"))}|${fields().map(f => f.label).join("|")}`
        if (next && advanced.get(next) !== signature) {
          advanced.set(next, signature)
          keep()
          say("Continuing to the next application step…", "busy")
          next.click()
          verifiedRounds = 0
        }
      }
      await sleep(round < 20 ? 250 : 2000)
    }
    // Loop budget exhausted — Broods confirms once, then Stuck after assist (never silent timeout).
    const final = await agentConfirm("loop_exhausted")
    if (final === "moved") {
      say("Odds confirmed a next step — open the tab if it does not continue.", "filling")
    }
  }
  let running = false
  let wantContinue = false
  /** After extension reload, stay quiet if this tab already needs the person — do not re-enter the fill loop and thrash. Continue always restarts fill (answers may have arrived). */
  const launch = (fromContinue = false) => {
    if (fromContinue) wantContinue = true
    if (running) return
    running = true
    ;(async () => {
      try {
        for (;;) {
          const forced = wantContinue
          wantContinue = false
          if (!forced) {
            const { intent } = (await ask({ type: "apply-intent" })) || {}
            // Password/captcha/account: wait for the person. Outlined/stuck: re-enter fill so Broods still runs.
            if (intent?.status === "needs_input") {
              const msg = intent.message || "Complete this step on the application tab when you are ready."
              // Stale LinkedIn/Indeed/Glassdoor Sign-in after apply-go to employer (Kraft Heinz etc.):
              // never replay "Sign in to LinkedIn…" on careers.kraftheinz.com — that was false Account.
              const board = (msg.match(/\bsign in to (linkedin|indeed|glassdoor)\b/i) || msg.match(/\bstill not signed in to (linkedin|indeed|glassdoor)\b/i) || [])[1]
              if (board) {
                const h = location.hostname
                const onBoard = board.toLowerCase() === "linkedin" ? /(^|\.)linkedin\.com$/i.test(h)
                  : board.toLowerCase() === "indeed" ? /(^|\.)indeed\.|secure\.indeed\.com$/i.test(h)
                  : /(^|\.)glassdoor\./i.test(h)
                if (!onBoard) {
                  // Clear the gate so Odds opens Apply on this employer listing.
                  await ask({ type: "application-progress", status: "filling", message: "Opening the employer’s application…" }).catch(() => null)
                  await start()
                  if (!wantContinue) return
                  continue
                }
              }
              // Do NOT match bare "password" — every Sign-in line ends with "Odds never types your password."
              const humanOnly = /\b(captcha|account or login required|sign in or make the account|choose your password|create (an )?account|type your password on the|email from your odds profile is filled|sign in to (linkedin|indeed|glassdoor)|still not signed in to)\b/i.test(msg)
              if (humanOnly) {
                // Re-check the page itself: after the person signs in (a redirect or reload), the wall is gone, so Odds moves on by itself
                // instead of repeating "Sign in…" from the last page. Only a wall that is really still here waits.
                const board = boardName()
                const stillWalled = board ? boardLooksSignedOut(board)
                  : Boolean(blockingCaptcha()) || [...document.querySelectorAll('input[type="password"]')].some(shown)
                if (!stillWalled) {
                  if (board) void noteBoardSession(board)
                  const cont = board ? `Signed in to ${board} — continuing…` : "Continuing…"
                  await ask({ type: "application-progress", status: "filling", message: cont }).catch(() => null)
                  await start({ forced: true })
                  if (!wantContinue) return
                  continue
                }
                say(msg, "ask")
                if (!wantContinue) return
                continue
              }
            }
          }
          await start({ forced })
          if (!wantContinue) return
        }
      } finally { running = false }
    })()
  }
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message?.type === "application-ping") { reply({ ok: true }); return }
    if (message?.type === "application-continue") launch(true)
  })
  launch(false)
})()
