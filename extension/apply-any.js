// Applying with odds anywhere but LinkedIn: in a tab opened from "odds apply" in the panel (or by such a tab: the employer's own form), odds fills
// in the application form's fields it knows (name, email, phone, LinkedIn, website, city, the standard answers on the person's odds profile, their
// own earlier answers) and puts their CV in the CV upload. A question odds cannot answer is outlined; what the person answers is kept for the next
// form. odds never sends the form: the person checks it and submits it. On a job board's page that is not the form yet, odds presses its Apply.
;(() => {
  const A = globalThis.oddsApply
  const APPLY_BUILD = "2026-10-16-drive-speed-v1"
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
    // Off the page itself, not merely scrolled out of view: a form above the fold after scrolling is still the form.
    const box = el.getBoundingClientRect()
    const right = box.right + window.scrollX, bottom = box.bottom + window.scrollY, left = box.left + window.scrollX
    return right < 0 || bottom < 0 || left > Math.max(document.documentElement.scrollWidth, window.innerWidth) + 2000 || (box.width <= 1 && box.height <= 1) || el.tabIndex === -1 && el.getAttribute("autocomplete") === "off" && Number(getComputedStyle(el).opacity) === 0
  }
  const textOf = (el) => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim()

  /** Placeholder chrome ("Type your response") is never the question — that caused empty Odds prompts and missed autofill. */
  const PLACEHOLDER_ASK = /^(type your (response|answer)|enter (your )?(answer|response)|your answer|please (enter|type|write)|write (your )?(answer|response)|antwoord|uw antwoord)\b/i
  // EN + FR Workday/Eightfold file chrome ("Sélectionner un fichier") — never Broods text questions.
  const genericUpload = (t) => /^(upload(\s+a)?\s+file|choose(\s+a)?\s+file|browse|tap to choose|drop (it|file)|drag\s*(and|&)\s*drop|choose a file or drop|s[eé]lectionner(\s+un)?\s+fichier|choisir(\s+un)?\s+fichier|parcourir|t[eé]l[eé]charger(\s+un)?\s+fichier)(\s+(it\s+|files?\s+)?here)?$/i.test((t || "").replace(/\s+/g, " ").trim())
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
      // Its own form's label first: some sites render the form twice (desktop + mobile) with the same ids.
      const sel = `label[for="${CSS.escape(el.id)}"]`
      const label = el.form?.querySelector(sel) || el.closest("[class*='field' i], [class*='form' i]")?.querySelector(sel) || document.querySelector(sel)
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
  /** This job's own cover / motivation letter from Odds (upload_letter), if the person made one. */
  let letter = null
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
      // The search box inside a dropdown drawn as role=combobox (its own entry below): one question, not two.
      if (el.tagName === "INPUT" && el.closest("[role='combobox']:not(input):not(select)")) continue
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
  const comboValue = (input) => {
    const control=input.closest("[class*='control' i]") || input.parentElement?.closest("[class*='select' i], [class*='container' i]")
    return textOf(control?.querySelector("[class*='single-value'], [class*='singlevalue' i], [class*='selected-value']"))
  }
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
      dropdownChoices.set(f.el, seen.filter((o) => o && !PLACEHOLDER.test(o)).slice(0, 300))
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

  /** Consent, terms and privacy-notice boxes are ticked: the person chose consent yes in Odds. Answers how many it ticked. Never anything else. */
  function tickConsents() {
    let ticked = 0
    for (const c of document.querySelectorAll('input[type="checkbox"], [role="checkbox"]:not(input)')) {
      const on = () => (c.matches("input") ? c.checked : c.getAttribute("aria-checked") === "true")
      if (on() || !shown(c) && !c.closest("label") || c.disabled || c.closest(".odds-apply-bar, nav, header, footer, [id*='cookie' i], [class*='cookie' i], [id*='onetrust' i]")) continue
      const label = (c.matches("input") ? labelOf(c) : "") || c.getAttribute("aria-label") || textOf(c.closest("label, fieldset") || c.parentElement)
      if (!A.isConsentCheckbox?.(label)) continue
      c.click()
      if (!on()) c.closest("label")?.click()
      if (on()) ticked++
    }
    return ticked
  }

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
    const fallback = (texts) => { if (broodsOnly()) return -1; const only = A.privacyChoice(texts); if (only >= 0) return only; const d = A.demographicChoice(f.label, texts, facts); return d >= 0 ? d : A.preferenceChoice(f.label, texts) }
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
  /**
   * A phone box next to a country-code picker takes only the national number once the picker names a country. While the picker still
   * says "International" (or nothing), the box reads the number itself: it needs the full +31…, or 612345678 turns into +61 2 3456 78.
   */
  function countryPickerSet(list) {
    const pickers = list.filter((f) => /country code|calling code|landcode|code du pays|indicatif|country/i.test(f.label) && (f.kind === "select" || f.kind === "combobox" || f.kind === "listbox"))
    return pickers.some((f) => { const v = String(fieldValue(f) || "").trim(); return v && !/^(international|select|choose|kies|--|\+?$)/i.test(v) && !PLACEHOLDER.test(v) })
  }
  function fillPlainOrCard(f, answer, besideCountry) {
    const expected = A.valueFor(f.kind, f.label, answer, besideCountry)
    type(f.el, expected)
    return { ok: true, expected, expectedOption: -1, expectedText: null }
  }

  /** Fills in what odds knows; answers how many fields it filled and how many it left marked for the person. */
  const broodsOnly = () => globalThis.oddsBroodsOnly === true
  /** What Broods answered for this question (kept on facts.remembered by key), else the person's saved gender; null when Broods has not answered. */
  function broodsAnswer(label) {
    const r = facts?.remembered?.[A.applicationQuestionKey(label, facts?.job_id)]
    return typeof r === "string" && r.trim() ? r : (globalThis.oddsSavedGender?.(label, facts) ?? null)
  }
  /** The answer a field gets: Broods' when Broods-only, the built-in rules otherwise. */
  const answerFor = (label) => (broodsOnly() ? broodsAnswer(label) : A.answerText(label, facts))
  let broodsStepSig = ""
  let broodsStepCalls = 0
  /** Broods reads this step: every empty question (with its choices) goes to Broods once, and the fill uses exactly its answers. */
  async function broodsStep() {
    if (!broodsOnly() || broodsStepCalls >= 15) return false
    const open = fields().filter((f) => f.kind !== "file" && f.kind !== "checkbox" && !answered(f) && realAsk(f.label, true) && !genericUpload(f.label) && !isResumeAsk(f.label) && broodsAnswer(f.label) === null && !/password|captcha|verification code/i.test(f.label))
    if (!open.length) return false
    const sig = open.map((f) => f.label).join("|")
    if (sig === broodsStepSig) return false
    broodsStepSig = sig
    broodsStepCalls += 1
    for (const f of open) await readChoices(f)
    say("Broods is reading this step…", "filling")
    const res = await ask({
      type: "suggest-answers",
      url: location.href,
      broods_only: true,
      questions: open.slice(0, 30).map((f) => ({
        key: A.applicationQuestionKey(f.label, facts?.job_id),
        label: f.label.slice(0, 200),
        kind: f.kind === "choice" ? "radio" : (f.kind === "combobox" || f.kind === "listbox") && f.options?.length ? "select" : f.kind,
        ...((f.options?.length || ["combobox", "listbox"].includes(f.kind)) ? { options: (f.options?.length ? f.options : listed(elOf(f)).texts).slice(0, 300).map((o) => String(o).slice(0, 120)) } : {}),
      })),
    }, 35000).catch(() => null)
    const answers = Array.isArray(res?.accepted) ? res.accepted : Array.isArray(res?.answers) ? res.answers : []
    let n = 0
    for (const a of answers) {
      if (typeof a?.key !== "string" || typeof a?.answer !== "string" || !a.answer.trim()) continue
      facts.remembered = { ...(facts.remembered || {}), [a.key]: a.answer.slice(0, 1000) }
      n++
    }
    if (n) for (const f of fields()) { attempts.delete(elOf(f)); verifications.delete(elOf(f)) }
    say(n ? `Broods answered ${n} question${n === 1 ? "" : "s"} — filling them in…` : "Broods had no answers for this step — the rest is yours.", "filling")
    return n > 0
  }
  /** Tries per search box over the whole page (never reset by a new answer): the cap that stops slow re-typing loops. */
  const searchTries = new WeakMap()
  /** A search box was given up on this page: Broods reads the page next (before the person), once. */
  let searchGaveUp = false
  async function fillAll() {
    let done = 0
    let left = 0
    done += tickConsents()
    const all = fields()
    const besideCountry = countryPickerSet(all)
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
      let answer = answerFor(f.label)
      // "Consider me for other roles too?": the choice that shares least (this job only) is taken, never the one that lets an employer keep the details.
      // Built-in picks below (privacy, Prefer not to say, preferences) are rules: off while Broods answers everything.
      if (answer === null && !broodsOnly() && (f.kind === "select" || f.kind === "radio" || f.kind === "choice" || f.kind === "combobox" || f.kind === "listbox")) {
        const only = A.privacyChoice(f.options || [])
        if (only >= 0) answer = f.options[only]
      }
      // Gender, age and background: Prefer not to say unless the person said they answer them themselves.
      if (answer === null && !broodsOnly() && (f.kind === "select" || f.kind === "radio" || f.kind === "choice" || f.kind === "combobox" || f.kind === "listbox")) {
        const decline = A.demographicChoice(f.label, f.options || [], facts)
        if (decline >= 0) answer = f.options[decline]
      }
      // Voluntary disclosure handed back without options yet: Prefer not to answer.
      if (answer === null && !broodsOnly() && typeof A.resolveAgentAnswer === "function") {
        const resolved = A.resolveAgentAnswer(f.label, facts, f.options || [])
        if (resolved !== null) answer = resolved
      }
      // A choice that changes nothing (which language would you prefer, which office): the first real option.
      if (answer === null && !broodsOnly() && (f.kind === "select" || f.kind === "radio" || f.kind === "choice")) {
        const pick = A.preferenceChoice(f.label, f.options)
        if (pick >= 0) answer = f.options[pick]
      }
      const known = answer !== null || (!broodsOnly() && typeof A.agentCanAnswer === "function" && A.agentCanAnswer(f.label, facts, f.options || []))
      // A site can discard a synthetic change on its next render. Retry known answers forever; only bounce unknowns.
      if (answered(f) && (invalid || wrongValue)) {
        if (known) { attempts.set(control, 0); verifications.delete(control) }
        else { box.classList.add("odds-ask"); left++; continue }
      }
      // A search box (place, school, dropdown) that will not take the answer costs seconds each try: 2 tries in all, then it is outlined and the
      // run moves on (Broods reads the page, then the person) — never the same slow typing every round.
      const searchWidget = f.widget === "typeahead" || f.widget === "listbox" || f.widget === "combobox" || f.kind === "combobox" || f.kind === "listbox"
      if (searchWidget && !answered(f) && (searchTries.get(control) || 0) >= 2) { box.classList.add("odds-ask"); left++; searchGaveUp = true; continue }
      if ((attempts.get(control) || 0) >= 2) {
        // Known Autofill answers: never give up and dump on the person — Lever often clears a synthetic set; retry (plain fields only, they are instant).
        if (known && !answered(f) && searchWidget) { box.classList.add("odds-ask"); left++; searchGaveUp = true; continue }
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
        if (searchWidget) searchTries.set(control, (searchTries.get(control) || 0) + 1)
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
      if (f.kind !== "file" && answerFor(f.label)) return true
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
      fillFailed: !answered(f) && f.kind !== "file" && Boolean(answerFor(f.label)),
    }))
    if (typeof A.formActuallyFilled === "function") return A.formActuallyFilled(states)
    return !stillEmptyGaps()
  }
  function outlineEmptyGaps() {
    for (const f of fields()) {
      if (answered(f)) continue
      const known = (f.kind === "file" && cv && isResumeAsk(`${f.label} ${f.el.name || ""} ${f.el.id || ""}`))
        || (f.kind !== "file" && answerFor(f.label))
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
  const AGENT_CLICK_DENY = /\b(submit|send application|password|captcha|sign[\s-]?in|log[\s-]?in|sign[\s-]?up|register|create (an )?account|create profile|accept all)\b/i
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
    }, 45000)
    const want = typeof res?.text === "string" ? res.text.replace(/\s+/g, " ").trim() : ""
    if (res?.action !== "click" || !want || AGENT_CLICK_DENY.test(want)) return false
    const el = [...document.querySelectorAll("a, button, input[type=button], input[type=submit]")].find((b) => shown(b) && controlLabel(b) === want)
    if (!el || humanConsentButton(el) || pastEmptyRequired(want)) {
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
  /** A forward button while this step's required questions are still empty: never pressed by Odds or Broods — those questions go to the person (or the phone) first. */
  const pastEmptyRequired = (label) => FORWARD_LABEL.test(label) && fields().some((f) => f.kind !== "checkbox" && !answered(f) && required(elOf(f), f.label))
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
    }, 45000).catch(() => null) : null
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
  // ---- Broods drives this tab (MCP): the extension is the hands, Broods the brain. ----
  // Broods sends one command at a time (read_page, fill, options, click, upload_cv); the extension does it here in the person's own tab and
  // answers. Hard rules, whatever Broods asks: never Submit/Send, never a password or captcha, never a consent box, never another tab.
  const DRIVE_DENY = /\b(submit|send application|send|verzend\w*|versturen|absenden|envoyer|soumettre|password|wachtwoord|captcha|sign[\s-]?up|register|create (an )?account|create profile|accept all|delete|remove|logout|log out|sign out)\b/i
  function finalSubmitControl(el) {
    const control=el.closest("button,input[type=submit]")
    if(!control || !control.form || String(control.type).toLowerCase() !== "submit") return false
    return !/^(next|continue|review|save and continue|volgende|verder|suivant|back|previous|reject all(?: cookies)?|deny all(?: cookies)?|necessary only|functional only)$/i.test(controlLabel(control).trim())
  }
  const prefilledFields = new WeakMap()
  const PREFILL_CONTACT = /^(first name|given name|last name|family name|surname|full name|name|email|e-mail|email address|phone|phone number|mobile|mobile number|linkedin|linkedin url|linkedin profile|city|country|current location|location|voornaam|achternaam|telefoon)$/i
  async function drivePrefill() {
    if (openDialog() || blockingCaptcha()) return
    await prefillContacts()
    // The CV goes last: some sites (Lever) read an uploaded CV and clear or hide name/email while they do. Wait for that, then fill
    // again whatever it emptied — Broods must never see a contact field missing or be told the form is done when it is not.
    let uploadedNow = false
    for (const f of fields()) {
      if (f.kind !== "file" || answered(f)) continue
      const label = (A.questionText ? A.questionText(f.label) : f.label).replace(/[*:✱★•]/g, "").trim()
      if (cv && isResumeAsk(label) && await uploadCv(f)) { prefilledFields.set(elOf(f), fieldValue(f)); uploadedNow = true }
    }
    if (uploadedNow) {
      await sleep(2500)
      await prefillContacts()
    }
  }
  async function prefillContacts() {
    const country = fields().some(f => /country code|landcode/i.test(f.label))
    for (const f of fields()) {
      if (answered(f) || secretField(f) || f.kind === "checkbox" || f.kind === "file") continue
      const label = (A.questionText ? A.questionText(f.label) : f.label).replace(/[*:✱★•]/g, "").trim()
      if (!PREFILL_CONTACT.test(label)) continue
      const answer = A.answerText(f.label, facts)
      if (!answer) continue
      const result = f.widget === "typeahead" ? await fillTypeahead(f, answer, country)
        : ["combobox","listbox"].includes(f.kind) ? await fillCombobox(f,answer)
        : ["select","radio","choice"].includes(f.kind) ? fillButtonChoice(f,answer)
        : await fillPlainOrCard(f, answer, country)
      if (result?.ok && answered(f)) prefilledFields.set(elOf(f), fieldValue(f))
    }
  }
  const driveFieldIds = new WeakMap(), driveButtonIds = new WeakMap()
  let driveFieldSeq=0,driveButtonSeq=0
  let driveFields = new Map()
  let driveButtons = new Map()
  const fieldValue = (f) => {
    try {
      if (f.kind === "radio") return f.options?.[f.el.findIndex((r) => r.checked)] ?? ""
      if (f.kind === "choice") return f.options?.[f.el.findIndex(pressed)] ?? ""
      if (f.kind === "select") return f.options?.[f.el.selectedIndex] ?? ""
      if (f.kind === "combobox") return comboValue(f.el)
      if (f.kind === "listbox") return PLACEHOLDER.test(textOf(f.el)) ? "" : textOf(f.el)
      if (f.kind === "checkbox") return elOf(f).checked ? "checked" : ""
      if (f.kind === "file") return elOf(f).files?.length ? elOf(f).files[0].name : ""
      return String(f.el.value ?? "").slice(0, 300)
    } catch { return "" }
  }
  const secretField = (f) => /password|wachtwoord|captcha|verification code|security code|social security|\bbsn\b|credit card/i.test(f.label) || elOf(f)?.type === "password"
  /** What Broods sees: the step's questions (id, label, kind, required, value, known choices), its buttons, errors, and any captcha/password wall. */
  /** An open pop-up (preferences, job alert, consent, sign-up prompt): when there is one, Broods sees only it — that is what blocks the page. */
  /** A cookie banner (cookieconsent's cc-window and the like) is not the pop-up the form waits behind: the form stays in view; its buttons are still listed. */
  const cookieBanner = (d) => /\bcc-window\b|cookie|consent-banner|onetrust|cookiebot|didomi|usercentrics/i.test(`${d.id} ${typeof d.className === "string" ? d.className : ""} ${d.getAttribute("aria-label") || ""}`) || (!d.querySelector("input:not([type=hidden]), textarea, select") && /\bcookies?\b/i.test(textOf(d).slice(0, 400)))
  const openDialog = () => [...document.querySelectorAll("[role='dialog'], [role='alertdialog'], [aria-modal='true'], dialog[open]")].filter((d) => shown(d) && !d.closest(".odds-apply-bar") && textOf(d).length > 0 && !cookieBanner(d)).pop() || null
  /** Site chrome (header search, menus, footer) is never part of the application. Not named "chrome": that would hide the extension API. */
  const siteChrome = (el) => Boolean(el.closest("header, nav, footer, [role='navigation'], [role='banner'], [role='contentinfo'], [role='search'], [class*='navbar' i], [class*='globalnav' i], [id*='footer' i], [class*='footer' i]"))
  function missingJobPage() {
    const headings = [document.title, ...[...document.querySelectorAll("h1,h2")].filter(shown).map(textOf)]
    return headings.some(text => /^(404(?:\b|\s)|page (?:was )?not found\b|pagina niet gevonden\b|we can.t find (?:this|that) page\b)/i.test(String(text || "").trim()))
  }
  function drivePage() {
    driveFields = new Map()
    driveButtons = new Map()
    const dialog = openDialog()
    const inScope = (el) => (dialog ? dialog.contains(el) : !siteChrome(el))
    const list = fields().filter((f) => !secretField(f) && inScope(elOf(f))).slice(0, 60)
    const out = list.map((f, i) => {
      const node=elOf(f)
      if(!driveFieldIds.has(node)) driveFieldIds.set(node,`f${driveFieldSeq++}`)
      const id=driveFieldIds.get(node)
      driveFields.set(id, f)
      const consent = f.kind === "checkbox" && Boolean(A.isConsentCheckbox?.(f.label))
      return { id, label: A.questionText ? A.questionText(f.label).slice(0, 300) : f.label.slice(0, 300), kind: f.kind, required: required(elOf(f), f.label), filled: answered(f), ...(prefilledFields.has(elOf(f)) && prefilledFields.get(elOf(f)) === fieldValue(f) ? { by: "odds" } : {}), value: fieldValue(f), ...((f.options?.length || ["combobox", "listbox"].includes(f.kind)) ? { options: (f.options?.length ? f.options : listed(elOf(f)).texts).slice(0, 300).map((o) => String(o).slice(0, 120)) } : {}), ...(consent ? { consent: true } : {}) }
    })
    // Checkboxes drawn by the site (Oracle, Workday: the real input hidden, a styled box or role=checkbox shown) — fields() skips them.
    const seenBoxes = new Set(list.filter((f) => f.kind === "checkbox").map((f) => elOf(f)))
    for (const box of document.querySelectorAll("input[type=checkbox], [role='checkbox']")) {
      if (out.length >= 70 || seenBoxes.has(box) || !inScope(box)) continue
      const input = box.matches("input") ? box : null
      const forSel = `label[for="${CSS.escape(input?.id || "__none__")}"]`
      const face = input ? (input.closest("label") || input.form?.querySelector(forSel) || document.querySelector(forSel) || input.parentElement) : box
      if (!face || !shown(face)) continue
      const label = (input ? labelOf(input) : "") || box.getAttribute("aria-label") || textOf(face) || textOf(box.closest("[class*='checkbox' i], fieldset, div"))
      if (!label || label.length > 500) continue
      if(!driveFieldIds.has(box)) driveFieldIds.set(box,`f${driveFieldSeq++}`)
      const id=driveFieldIds.get(box)
      const f = { kind: "checkbox", el: input || box, face, label, custom: true }
      driveFields.set(id, f)
      const checked = input ? input.checked : box.getAttribute("aria-checked") === "true"
      out.push({ id, label: label.slice(0, 300), kind: "checkbox", required: Boolean(input?.required || box.getAttribute("aria-required") === "true" || /\*/.test(label)), filled: checked, value: checked ? "checked" : "", ...(A.isConsentCheckbox?.(label) ? { consent: true } : {}) })
    }
    let b = 0
    const buttons = []
    // Apply controls always count and come first: job boards put "Apply on the employer's website" in the job's own <header>, and
    // a page full of links (Glassdoor's matches, ads) must never push them past the list's end.
    const APPLYISH = /\b(apply|solliciteer|solliciteren|bewerben|postuler|candidat|easy apply|quick apply)/i
    const controls = [...document.querySelectorAll("a, button, input[type=button], input[type=submit], [role='button']")]
    const applyFirst = [...controls.filter((el) => APPLYISH.test(controlLabel(el))), ...controls.filter((el) => !APPLYISH.test(controlLabel(el)))]
    for (const el of applyFirst) {
      if (!shown(el) || b >= 60 || el.closest(".odds-apply-bar")) continue
      const text = controlLabel(el).slice(0, 100)
      if (text.length < 1) continue
      if (!inScope(el) && !(APPLYISH.test(text) && !dialog)) continue
      b++
      if(!driveButtonIds.has(el)) driveButtonIds.set(el,`b${driveButtonSeq++}`)
      const id=driveButtonIds.get(el)
      driveButtons.set(id, el)
      const a = el.closest("a")
      buttons.push({ id, text, ...(a?.href && /^https?:/.test(a.href) ? { href: a.href.slice(0, 200) } : {}), ...(DRIVE_DENY.test(text) || finalSubmitControl(el) ? { blocked: true } : {}) })
    }
    return {
      url: location.href.slice(0, 500),
      title: document.title.slice(0, 200),
      headings: [...document.querySelectorAll("h1, h2, h3")].filter(shown).map(textOf).filter(Boolean).slice(0, 8).map((t) => t.slice(0, 160)),
      errors: [...document.querySelectorAll('[role="alert"], .error, [aria-invalid="true"]')].filter(shown).map(textOf).filter(Boolean).slice(0, 10).map((t) => t.slice(0, 200)),
      captcha: Boolean(blockingCaptcha()),
      password_field: [...document.querySelectorAll('input[type="password"]')].some(shown),
      ...(missingJobPage() ? { closed: true, closed_reason: "The job page was not found (404)." } : {}),
      ...(dialog ? { dialog: { title: textOf(dialog.querySelector("h1, h2, h3, [class*='title' i]")).slice(0, 160) || textOf(dialog).slice(0, 160), note: "A pop-up is open: these fields and buttons are only the pop-up's. Complete it (fill + continue) to get past it." } } : {}),
      fields: out,
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
      if (denyText.test(words) || finalSubmitControl(target)) return { ok: false, error: "Odds never presses this; it is the person's" }
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
  /** One Broods command, done in this tab. Answers what happened; a click that leaves the page answers before it clicks. */
  async function driveCommandRaw(cmd, sendResult) {
    const args = cmd.args || {}
    if (cmd.tool === "read_page") return drivePage()
    if (["screenshot", "click_at", "type_text", "press_key", "scroll"].includes(cmd.tool)) return driveVision(cmd, sendResult, DRIVE_DENY)
    if (cmd.tool === "options") {
      const f = driveFields.get(args.id)
      if (!f || !elOf(f)?.isConnected) return { error: "That field is gone. read_page again." }
      return { id: args.id, options: (await readChoices(f)) || f.options || [] }
    }
    if (cmd.tool === "fill") {
      const items = Array.isArray(args.fields) ? args.fields.slice(0, 40) : []
      const results = []
      const sigBefore = `${location.href}|${[...driveFields.values()].map((f) => `${f.label}:${fieldValue(f)}`).join("|")}`
      const besideCountry = countryPickerSet([...driveFields.values()])
      for (const it of items) {
        const f = driveFields.get(it?.id)
        let value = typeof it?.value === "string" ? it.value.slice(0, 2000) : ""
        if (!f || !elOf(f)?.isConnected) { results.push({ id: it?.id, ok: false, error: "field gone, read_page again" }); continue }
        // The person's own number written the local way (0612345678) into a phone box that reads numbers itself (no country picked):
        // give it the full saved +31 number, or the box takes 06… / 61… as another country's.
        const PHONE_LABEL = /\b(mobile|phone|telephone|telefoon\w*|mobiel\w*)\b/i
        const saved = String(facts?.phone || facts?.answers?.phone || "")
        if (PHONE_LABEL.test(f.label) && !besideCountry && !/^\s*(\+|00)/.test(value) && /^\s*\+/.test(saved) && A.nationalNumber
          && A.nationalNumber(saved).replace(/\D/g, "") === A.nationalNumber(value).replace(/\D/g, "")) value = saved.replace(/\s+/g, "")
        if (secretField(f)) { results.push({ id: it.id, ok: false, error: "the person fills this one" }); continue }
        if (f.kind === "file") { results.push({ id: it.id, ok: false, error: "use upload_cv" }); continue }
        if (f.kind === "checkbox") {
          // Consent and terms boxes are ticked when Broods says yes (the person's choice in Odds: consent yes).
          const want = /^(yes|true|check|checked|on|1)$/i.test(value.trim())
          const el = elOf(f)
          const isOn = () => (el.matches("input") ? el.checked : el.getAttribute("aria-checked") === "true")
          // A styled box: click what the person sees (its label/box), then the input itself if that did not take.
          if (isOn() !== want) (f.face && f.face !== el ? f.face : el).click()
          await sleep(80)
          if (isOn() !== want) el.click()
          await sleep(60)
          results.push({ id: it.id, ok: isOn() === want, value: isOn() ? "checked" : "" })
          continue
        }
        let result = { ok: false }
        try {
          const widget = f.widget || (f.kind === "choice" ? "choice" : f.kind === "listbox" || f.kind === "combobox" ? f.kind : "plain")
          const work = (async () => {
            if (widget === "typeahead") return fillTypeahead(f, value, besideCountry)
            if (widget === "listbox" || widget === "combobox" || f.kind === "combobox" || f.kind === "listbox") return fillCombobox(f, value)
            if (widget === "choice" || f.kind === "select" || f.kind === "radio" || f.kind === "choice") return fillButtonChoice(f, value)
            return fillPlainOrCard(f, value, besideCountry)
          })()
          // One field never holds the step: 8 s at most, then Broods is told it failed and can try another way.
          result = await Promise.race([work, sleep(8000).then(() => ({ ok: false, error: "the site did not take it within 8 s" }))])
        } catch (e) { result = { ok: false, error: String(e?.message || e).slice(0, 120) } }
        await sleep(80)
        // DOM verification: selected value / typed text must stick before we report ok.
        const stuck = fieldValue(f)
        let okDom = Boolean(result.ok) && answered(f) && (stuck.length > 0 || f.kind === "checkbox")
        // A phone box that reformats what it gets (a country picker in front): the digits Broods meant must still be there.
        let phoneError = ""
        if (okDom && /\b(mobile|phone|telephone|telefoon\w*|mobiel\w*)\b/i.test(f.label)) {
          const want = A.nationalNumber ? A.nationalNumber(value).replace(/\D/g, "") : value.replace(/\D/g, "").slice(-8)
          const full = /^\s*(\+|00)/.test(value) ? value.replace(/\D/g, "").replace(/^00/, "") : ""
          const got = stuck.replace(/\D/g, "")
          if ((want && !got.endsWith(want)) || (full && /^\s*\+/.test(stuck) && got !== full) || (!full && /^\s*\+/.test(stuck) && got === want)) { okDom = false; phoneError = `the phone box changed it to "${stuck}": set the country code picker to the number's country first, then fill the number again` }
        }
        results.push({ id: it.id, ok: okDom, value: stuck, ...(okDom ? {} : { error: phoneError || result.error || "no matching option or the site did not keep the value" }) })
      }
      const sigAfter = `${location.href}|${[...driveFields.values()].map((f) => `${f.label}:${fieldValue(f)}`).join("|")}`
      const unfilled = [...driveFields.entries()]
        .filter(([, f]) => required(elOf(f), f.label) && !answered(f))
        .map(([id, f]) => ({ id, label: f.label.slice(0, 120) }))
        .slice(0, 20)
      return {
        results,
        verified: results.length > 0 && results.every((r) => r.ok),
        unfilled,
        ...(sigBefore === sigAfter && results.some((r) => !r.ok) ? { unchanged: true, error: "page/fields unchanged after fill — try options or another strategy once" } : {}),
      }
    }
    if (cmd.tool === "upload_cv") {
      const f = driveFields.get(args.id)
      if (!f || f.kind !== "file" || !elOf(f)?.isConnected) return { ok: false, error: "not a file field (read_page again)" }
      const ok = await uploadCv(f)
      const name = fieldValue(f)
      return { ok: Boolean(ok) && Boolean(name), value: name, file_name: name }
    }
    if (cmd.tool === "upload_letter") {
      const f = driveFields.get(args.id)
      if (!f || f.kind !== "file" || !elOf(f)?.isConnected) return { ok: false, error: "not a file field (read_page again)" }
      if (!letter) return { ok: false, error: "no cover letter for this job in Odds: finish needs_you with reason 'letter'" }
      const file = await ask({ type: "cv-file", doc: letter.id }, 15000)
      if (file?.status !== "ok") return { ok: false, error: "the letter could not be loaded from Odds" }
      const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], file.name, { type: file.type }))
      try { f.el.files = transfer.files } catch { /* some ATS wrap the input */ }
      f.el.dispatchEvent(new Event("input", { bubbles: true }))
      f.el.dispatchEvent(new Event("change", { bubbles: true }))
      await sleep(80)
      return { ok: Boolean(f.el.files?.length), value: fieldValue(f) }
    }
    if (cmd.tool === "open_job") {
      if (!/^https:\/\//.test(driveJobUrl)) return { ok: false, error: "no job link known; use back" }
      await sendResult({ ok: true, note: "opening the job's own link; read_page next" })
      location.href = driveJobUrl
      return null
    }
    if (cmd.tool === "back") {
      // Going back out of the web (to a blank or new-tab page) leaves no page for Odds to drive: every next step would expire.
      if (history.length <= 1 || !/^https?:\/\//.test(document.referrer)) return { ok: false, error: "there is no web page to go back to from here; use open_job for the job's own link, or finish" }
      await sendResult({ ok: true, note: "went back one page; read_page next" })
      history.back()
      return null
    }
    if (cmd.tool === "click") {
      const el = driveButtons.get(args.id)
      if (!el || !el.isConnected) return { ok: false, error: "button gone, read_page again" }
      const text = controlLabel(el)
      if (DRIVE_DENY.test(text) || finalSubmitControl(el)) return { ok: false, error: "Odds never presses this; it is the person's" }
      // Next/Review with empty required fields must not advance — leave Broods on needs_you instead of false Review.
      if (/^(next|continue|review|review your application|continue to next step)$/i.test(text.trim())) {
        const snap = drivePage()
        const empty = (snap.fields || []).filter((f) => f.required && !f.filled && !f.consent)
        if (empty.length) return { ok: false, error: `required fields still empty: ${empty.map((f) => f.label).join("; ").slice(0, 300)}`, unfilled: empty.map((f) => f.label).slice(0, 12), page: snap }
      }
      const before = location.href
      // Answer first: a click that loads another page ends this script, and the new page picks up the next command.
      await sendResult({ ok: true, clicked: text.slice(0, 100), note: "page may change; read_page next" })
      await ask({ type: "apply-follow" }).catch(() => null)
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      el.click()
      await sleep(location.href === before ? 900 : 200)
      return null
    }
    return { error: `Unknown tool ${cmd.tool}` }
  }
  async function driveCommand(cmd, sendResult) {
    const result = await driveCommandRaw(cmd, sendResult)
    if (result && cmd.tool !== "read_page" && cmd.tool !== "screenshot") {
      await sleep(180)
      return { ...result, page: drivePage() }
    }
    return result
  }
  /** Broods drives: take its commands for this run until it finishes; the bar shows what it does and how it ended. */
  /** The job's own link for this run (open_job brings the tab back to it). */
  let driveJobUrl = ""
  /** Only promoted, structure-only click recipes run without a model. No fields or values are stored here. */
  async function driveRecipes(intent) {
    const attempts = []
    if (intent.recipePending) {
      const pending = intent.recipePending
      attempts.push({ lesson: pending.lesson, ok: location.href !== pending.url && fields().length > 0 })
      await ask({ type: "drive-recipe", pending: null })
    }
    const reply = await ask({ type: "drive", op: "playbook", page: location.href }, 5000)
    for (const recipe of (reply?.playbook?.recipes || []).slice(0, 3)) {
      const lesson = recipe.lesson
      if (recipe.confidence < 0.6 || recipe.successes < 5 || !["opener", "skip_dialog"].includes(lesson?.kind)) continue
      const dialog = openDialog()
      if ((lesson.kind === "skip_dialog" && !dialog) || (lesson.kind === "opener" && fields().some(f => /name|email|resume|cv/i.test(f.label)))) continue
      if (!/^(apply( now| on (company website|employer's website|the employer's website))?|easy apply|solliciteren|skip|not now|close|reject all|necessary only|functional only)$/i.test(lesson.button || "") || DRIVE_DENY.test(lesson.button)) continue
      const matches = [...(dialog || document).querySelectorAll("a,button,[role='button']")].filter(el => shown(el) && !el.disabled && !el.closest(".odds-apply-bar") && controlLabel(el) === lesson.button)
      if (matches.length !== 1) { attempts.push({ lesson, ok: false }); continue }
      const before = location.href, beforeFields = fields().length
      await ask({ type: "drive-recipe", pending: { lesson, url: before, at: Date.now() } })
      await ask({ type: "apply-follow" })
      matches[0].click()
      await sleep(600)
      if (location.href !== before) return { navigating: true, attempts }
      await ask({ type: "drive-recipe", pending: null })
      const ok = lesson.kind === "skip_dialog" ? !dialog?.isConnected || !shown(dialog) : fields().length > beforeFields
      attempts.push({ lesson, ok })
      if (!ok) break // mismatch immediately falls back to the agent
    }
    return { navigating: false, attempts }
  }
  /** Wrong-job guard before personal data: different non-ATS employer host than the intended link. */
  function wrongJobPage(intended) {
    try {
      const want = new URL(intended)
      const page = new URL(location.href)
      const hostOf = (h) => h.replace(/^www\./i, "").toLowerCase()
      const ih = hostOf(want.hostname), ph = hostOf(page.hostname)
      if (!ih || !ph || ih === ph || ph.endsWith(`.${ih}`) || ih.endsWith(`.${ph}`)) return null
      const boards = /(greenhouse|lever\.co|ashbyhq|myworkdayjobs|workday|smartrecruiters|recruitee|teamtailor|personio|indeed|glassdoor|linkedin)\./i
      if (boards.test(ih) || boards.test(ph)) return null
      return `The link opens a different job (${ph} instead of ${ih}). Not filling personal details.`
    } catch { return null }
  }
  async function driveLoop(intent) {
    driveJobUrl = String(intent.job || "")
    const wrong = wrongJobPage(driveJobUrl || location.href)
    if (wrong) {
      // Wrong employer/job after redirect — needs_you with reason other, never Closed.
      say(wrong, "ask")
      return
    }
    say("Filling your details from Autofill…", "filling")
    await drivePrefill()
    const recipes = await driveRecipes(intent)
    if (recipes.navigating) return
    await drivePrefill()
    say("Broods is applying in this tab…", "filling")
    const start = await ask({ type: "drive", op: "start", url: intent.job, page: location.href, run_id: intent.driveRun || null, recipe_attempts: recipes.attempts }, 30000).catch(() => null)
    const runId = start?.run_id
    if (!runId) {
      say(start?.error ? `Broods could not start: ${start.error}` : "Broods could not start. Press Apply with Odds again.", "ask")
      return
    }
    let lostSince = 0
    let fresh = true
    // Ended for the person (captcha, sign-in, questions, a letter, stuck): Odds keeps watching the tab for 30 minutes and carries on by
    // itself once they handled it. Broods going quiet is decided by the server (retried once, then said), never by a silent timer here.
    let endedAt = 0
    let endedReason = ""
    let resumedFor = 0
    const person = watchPerson()
    for (let i = 0; i < 4000; i++) {
      // The person is filling in the form themselves: Broods waits (no step handed out) and picks up 20 s after they stop.
      if (!endedAt && Date.now() - person.at < PERSON_QUIET_MS) {
        say("You're filling in — Broods waits, then carries on around what you entered.", "filling")
        await ask({ type: "drive", op: "next", run_id: runId, hold: true }, 15000).catch(() => null)
        await sleep(3000)
        continue
      }
      // Waiting for the person: once they acted here and went quiet, or the captcha is gone, the same run carries on — no button needed.
      if (endedAt && resumedFor !== endedAt) {
        const handled = (person.at > endedAt && Date.now() - person.at >= PERSON_QUIET_MS) || (endedReason === "captcha" && !blockingCaptcha())
        if (handled) {
          resumedFor = endedAt
          const ok = await ask({ type: "drive", op: "continue", run_id: runId }, 15000).catch(() => null)
          if (ok?.ok) { endedAt = 0; say("Broods is carrying on…", "filling") }
        }
      }
      const next = await ask({ type: "drive", op: "next", run_id: runId, fresh }, 35000).catch(() => null)
      // No answer at all is the connection, not Broods: say so and keep trying for 5 minutes, then carry on where the run is.
      if (!next || next.status === "error") {
        lostSince ||= Date.now()
        if (Date.now() - lostSince > 300000) {
          say("Odds lost its connection while Broods was applying. Press Apply with Odds again to carry on from here.", "ask")
          return
        }
        say("Connection lost — Odds keeps going as soon as it is back…", "filling")
        await sleep(Math.min(10000, 1500 + (Date.now() - lostSince) / 10))
        continue
      }
      fresh = false
      if (lostSince) { lostSince = 0; say("Broods is applying in this tab…", "filling") }
      if (next.done) {
        if (!endedAt) {
          endedAt = Date.now()
          endedReason = next.reason || ""
          if (next.reason === "closed") await ask({ type: "job-closed", url: driveJobUrl || location.href })
          const [text, state] = driveEndText(next)
          say(text, state)
        }
        // The tab stays watched while it is open (the tracker shows the run only then): 30 minutes waiting for the person, 3 hours at review.
        if (["submitted", "stopped", "failed"].includes(next.status) || next.reason === "closed" || Date.now() - endedAt > (next.status === "review" ? 10800000 : 1800000)) return
        await sleep(3000)
        continue
      }
      if (endedAt) { endedAt = 0; say("Broods is carrying on…", "filling") }
      if (next.command) {
        const cmd = next.command
        const note = typeof cmd.note === "string" && cmd.note.trim() ? cmd.note.trim() : ""
        if (note) say(`Broods: ${note}`, "filling")
        else if (cmd.tool === "read_page") say(`Broods is reading the page (step ${next.steps ?? ""})…`, "filling")
        else if (cmd.tool === "fill") say("Broods is filling in your answers…", "filling")
        else if (cmd.tool === "click") say("Broods is moving to the next step…", "filling")
        let sent = false
        let stale = false
        const sendResult = async (result) => {
          if (stale) return
          if (result && !result.page && ["click", "click_at", "back", "open_job"].includes(cmd.tool)) result = { ...result, page_pending: true }
          sent = true
          for (let t = 0; t < 4; t++) {
            const ok = await ask({ type: "drive", op: "result", run_id: runId, id: cmd.id, result, doc_gen: next.doc_gen }, 15000).catch(() => null)
            // Server rejected stale (run ended / wrong document): stop mutating and posting.
            // (The run's own end — and why it ended — comes from the next drive-next, never from here.)
            if (ok?.stale === true || (ok && ok.ok === false && ok.stale)) { stale = true; return }
            if (ok && ok.status !== "error" && ok.ok !== false) return
            await sleep(2000 * (t + 1))
          }
        }
        const result = await driveCommand(cmd, sendResult).catch(e => ({ok:false,error:String(e?.message || e).slice(0,200)}))
        if (stale) continue
        // A step that can open another page: this page may be on its way out. Give it a moment before asking for the next step, so the
        // read the server queued for the NEW page is taken there, not by this old page in its last instant (that read is then refused
        // and Broods waits ~25 s for nothing).
        if (!sent && result !== null) await sendResult(result)
        if (["click", "click_at", "back", "open_job"].includes(cmd.tool) && !(result && result.page)) await sleep(1500)
      }
    }
  }
  /** The person's own typing and clicks on the page (never Broods', whose events are synthetic, never the Odds bar). */
  const PERSON_QUIET_MS = 20000
  function watchPerson() {
    const state = { at: 0 }
    // Only answering the form counts: typing or pasting into a field, or picking a choice. Clicking to bring the tab forward, scrolling,
    // pressing a button or closing a pop-up is not filling in, and must not pause Broods.
    const FORM_CONTROL = "input:not([type=button]):not([type=submit]):not([type=reset]):not([type=image]), textarea, select, [contenteditable=''], [contenteditable='true'], [role='textbox'], [role='combobox'], [role='option'], [role='radio'], [role='checkbox'], [role='listbox']"
    const mark = (e) => {
      if (!e.isTrusted) return
      const t = e.target
      if (!t || !t.closest || t.closest(".odds-apply-bar, [data-odds-bar]")) return
      if (e.type === "keydown" && /^(Tab|Escape|Shift|Control|Alt|Meta|PageUp|PageDown|Home|End|ArrowUp|ArrowDown|F\d+)$/.test(e.key)) return
      if (!t.closest(FORM_CONTROL) && !(t.closest("label") && t.closest("form, [role='form'], [class*='field' i]"))) return
      state.at = Date.now()
    }
    for (const type of ["keydown", "mousedown", "input", "paste"]) document.addEventListener(type, mark, true)
    return state
  }
  /** What the bar says when a Broods run ends, by why it ended. */
  function driveEndText(next) {
    const m = next.message || ""
    if (next.status === "review") return [m || "Filled in by Broods. Check everything, then send it yourself.", "done"]
    if (next.status === "submitted") return ["You sent it.", "done"]
    if (next.status === "stopped") return [m || "Broods stopped. Continue from the tracker, or finish it yourself.", "ask"]
    const why = {
      captcha: "Captcha on the page — tick it and Broods carries on by itself.",
      account: "Sign in on this page (Odds never types passwords) — Broods carries on by itself after.",
      letter: "This application asks for a cover letter — add one for this job in Odds (Documents) and Broods carries on.",
      questions: "Broods needs your answers: fill them in here or answer in Odds, and it carries on.",
      closed: "This job no longer takes applications.",
    }[next.reason] || ""
    const text = [why, m].filter(Boolean).join(" ")
    return [next.status === "needs_you" ? (text || "Broods needs you for a step — open the tab.") : `Odds assist could not move this application forward after assist: ${text || "Broods stopped."}`, "ask"]
  }
  /** The employer's own words saying the application went through (a thank-you page or message, with no form left). */
  const SENT = /thank you for (applying|your (application|interest in))|your application (has been|was|is) (successfully )?(submitted|received|sent)|(we have|we've) received your application|application (submitted|received|complete)|bedankt voor je sollicitatie|je sollicitatie is (verzonden|ontvangen)|vielen dank für ihre bewerbung/i
  let reported = false
  /** After the person sends it (the fill loop may be over by then): the site's own thank-you on this page marks the job applied. */
  let watchingSent = 0
  function watchSent() {
    if (watchingSent || reported) return
    watchingSent = window.setInterval(() => { if (confirmed() || reported) { window.clearInterval(watchingSent); watchingSent = 0 } }, 500)
    window.setTimeout(() => { window.clearInterval(watchingSent); watchingSent = 0 }, 60000)
  }
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
  async function waitIntent(quiet = false) {
    for (let i = 0; i < 40; i++) {
      const { intent } = (await ask({ type: "apply-intent" })) || {}
      if (intent) return intent
      // Heartbeat so Odds never looks idle while the handoff catches up — only in a tab Odds was asked to apply in.
      if (!quiet && (i === 0 || i % 8 === 0)) say("Waiting for Odds to attach this application…", "filling")
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
    // A page Odds is not applying in (any site the person just browses) shows nothing at all: the bar is only for application tabs.
    // A tab being handed an application (a site opening the employer form in a new tab) gets a short, silent wait to pick it up.
    const intent = await waitIntent(!opts.forced)
    if (!intent) {
      if (opts.forced) say("Odds did not attach this tab. Press Open application tab or Apply with Odds again.", "ask")
      return
    }
    say("Filling in the background…", "filling")
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
    letter = kit.letter || null
    if (!listening) {
    listening = true
    document.addEventListener("click", (event) => {
      const b = event.target instanceof Element ? event.target.closest("button, input[type=submit], a") : null
      if (b && /submit|send|next|continue|verzend|versturen|volgende|apply|solliciteer|review/i.test(textOf(b) || b.value || "")) { keep(); watchSent() }
    }, true)
    document.addEventListener("submit", () => { keep(); watchSent() }, true)
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
    if (missingJobPage()) {
      say("This job page is no longer available. No application was submitted.", "problem")
      await ask({type:"job-closed",url:intent.job || location.href})
      return
    }
    // Indeed / Glassdoor guest: tell the person to sign in — do not hang on Filling / Looking for Apply.
    if (!(await ensureBoardSignedIn())) return
    // Broods drives (switch on in Odds, the default): it reads this tab and applies from the person's profile and Autofill; the extension only acts.
    if (kit.broods_drive === true) {
      // An application form embedded from an ATS (Greenhouse, Lever... in an iframe): the frame drives, this page stays out (one driver per run).
      const embedded = window.top === window && [...document.querySelectorAll("iframe[src]")].some((f) => { try { return portalHost(new URL(f.src, location.href).hostname) } catch { return false } })
      if (embedded) {
        say("Broods is applying in the form on this page…", "filling")
        return
      }
      await driveLoop(intent)
      return
    }
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
        broods_only: broodsOnly(),
        questions: empty.map((f) => ({
          key: A.applicationQuestionKey(f.label, jobId),
          label: f.label.slice(0, 200),
          kind: f.kind === "choice" ? "radio" : (f.kind === "combobox" || f.kind === "listbox") && f.options?.length ? "select" : f.kind,
          ...(f.options ? { options: f.options.slice(0, 40) } : {}),
        })),
      }, 25000).catch(() => null)
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
    /** Outlined questions handed to the person: true once they are answered on the tab, an answer arrives from Odds (the phone), or Continue is pressed. */
    async function waitForAnswers() {
      for (const until = Date.now() + 1800000; Date.now() < until && !pausedByPerson;) {
        await sleep(1500)
        if (wantContinue) return true
        const open = fields().filter((f) => f.kind !== "file" && boxOf(f).classList.contains("odds-ask"))
        if (!open.length || open.every(answered)) return true
        if (await handoff?.refresh(facts)) {
          for (const f of fields()) { attempts.delete(elOf(f)); verifications.delete(elOf(f)) }
          return true
        }
      }
      return false
    }
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
              fillFailed: !answered(f) && f.kind !== "file" && Boolean(answerFor(f.label)),
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
      const scan = await ask({ type: "suggest-scan", url: location.href, status, snapshot }, 45000).catch(() => null)
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
        if (el && !humanConsentButton(el) && !pastEmptyRequired(want)) {
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
        // The answers can come from the phone (or the tab itself): Odds carries on once they are in, never left at this step.
        if (await waitForAnswers()) return "moved"
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
      // Wrong employer host after redirect: stop without marking the intended job Closed.
      if (wrongJobPage(intent.job || "")) {
        say(wrongJobPage(intent.job || ""), "ask")
        return
      }
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
      // Broods reads each new step first (Broods-only): its answers are what the fill below types in.
      if (await broodsStep()) stuckRounds = 0
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
      // A search box would not take a known answer (2 tries): Broods reads the page now — the step before the person, never minutes of re-typing.
      if (searchGaveUp && !gapsBroodsTried) {
        gapsBroodsTried = true
        const outcome = await agentConfirm("search_box_stuck")
        if (outcome === "moved") { stuckRounds = 0; continue }
        if (outcome === "human" || outcome === "stuck") return
      }
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
      const handBack = fields().filter(f => f.kind !== "file" && boxOf(f).classList.contains("odds-ask") && !(broodsOnly() ? broodsAnswer(f.label) !== null : typeof A.agentCanAnswer === "function" && A.agentCanAnswer(f.label, facts, f.options || [])))
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
