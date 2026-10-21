// Applying with odds anywhere but LinkedIn: in a tab opened from "odds apply" in the panel (or by such a tab: the employer's own form), odds fills
// in the application form's fields it knows (name, email, phone, LinkedIn, website, city, the standard answers on the person's odds profile, their
// own earlier answers) and puts their CV in the CV upload. A question odds cannot answer is outlined; what the person answers is kept for the next
// form. odds never sends the form: the person checks it and submits it. On a job board's page that is not the form yet, odds presses its Apply.
;(() => {
  const A = globalThis.oddsApply
  // Chrome loads a hidden page behind the address bar (google.com/search/warmup.html) and prerenders pages: nothing is ever driven there.
  if (document.prerendering || /^\/search\/warmup\.html/.test(location.pathname)) return
  const APPLY_BUILD = "2026-10-19-fill-verify-broods-ladder"
  const portalHost = host => /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|smartrecruiters\.com|successfactors\.eu|successfactors\.com|icims\.com)$/.test(host)
  // A form drawn in a blank frame of the page (HubSpot, Framer, Webflow embeds): Odds is put there on purpose (see blankFrameForm) and drives it.
  // A frame of this same page with no address of its own (about:blank, srcdoc, or written by the page's script); a frame from another site has
  // no frameElement here, so it never counts.
  const blankFrame = window.top !== window && (() => { try { const own = window.frameElement; if (!own) return false; const src = own.getAttribute("src") || ""; return /^about:/.test(location.href) || !src || /^about:/.test(src) } catch { return false } })()
  if (!A || /(^|\.)linkedin\.com$/.test(location.hostname) || location.hostname === "odds.beeblast.co" || (window.top !== window && !portalHost(location.hostname) && !blankFrame) || globalThis.oddsGenericApplyLoaded === APPLY_BUILD) return
  // A blank frame without the form (a newsletter box, an empty slot) is left alone: one driver per application.
  if (blankFrame && document.querySelectorAll("input:not([type=hidden]):not([type=submit]), textarea, select").length < 3) return
  globalThis.oddsGenericApplyLoaded = APPLY_BUILD
  /** The page's own address (a blank frame has none: its parent's). */
  const pageHref = () => {
    if (!blankFrame) return location.href
    try { return window.parent.location.href } catch { return document.referrer || location.href }
  }
  /** An application form embedded from an ATS (Greenhouse, Lever... in an iframe): that frame drives, this page stays out. */
  // A page that is itself on an ATS domain (jobs.smartrecruiters.com...) drives itself: its own widget frames (consent, captcha, analytics) are not the form.
  const atsFrame = () => window.top === window && !portalHost(location.hostname) && [...document.querySelectorAll("iframe[src]")].some((f) => { try { return portalHost(new URL(f.src, pageHref()).hostname) } catch { return false } })
  /** A blank frame on this page that holds the application form (3+ fields): Odds drives it there instead of here. */
  const blankFrameForm = () => window.top === window && [...document.querySelectorAll("iframe")].some((f) => {
    try {
      const doc = f.contentDocument
      const src = f.getAttribute("src") || ""
      if (!doc || !(/^about:/.test(doc.location.href) || !src || /^about:/.test(src))) return false
      return [...doc.querySelectorAll("input:not([type=hidden]):not([type=submit]), textarea, select")].length >= 3
    } catch { return false }
  })

  // A hidden tab's own timers are slowed by Chrome (to about once a minute after a while): there the wait comes from the extension's
  // background, whose timers run on time, and its reply wakes the page.
  const sleep = (ms) => new Promise((resolve) => {
    let done = false
    const finish = () => { if (!done) { done = true; resolve() } }
    setTimeout(finish, ms)
    if (document.hidden) chrome.runtime.sendMessage({ type: "odds-sleep", ms }).then(finish, () => undefined)
  })
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
    if (/^(verify you are human|security (check|verification)|are you a (human|robot)|captcha|just a moment|checking your browser|press (&|and) hold)\b/i.test(head)) return true
    // Bot walls that replace the whole page (DataDome on SmartRecruiters, Cloudflare, PerimeterX, Arkose): a challenge frame and no form.
    if ([...document.querySelectorAll('iframe[src*="captcha-delivery.com"], iframe[src*="challenges.cloudflare.com"], iframe[src*="arkoselabs"], iframe[src*="funcaptcha"], #px-captcha')].length && !document.querySelector("form input:not([type=hidden]), form textarea")) return true
    for (const el of document.querySelectorAll(
      'iframe[src*="hcaptcha"], iframe[src*="recaptcha"], iframe[src*="turnstile"], iframe[src*="captcha-delivery.com"], iframe[title*="challenge"], #captcha-internal, .cf-turnstile',
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
  const textOf = (el) => (el?.innerText || el?.textContent || "").replace(/[\u200b-\u200d\u2060\ufeff]/g, "").replace(/\s+/g, " ").trim()

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
    // An upload box's own label is often only its button ("Attach" on Greenhouse); the question is the group around it
    // (role=group aria-labelledby -> "Cover Letter*"), with the required star.
    if ((el.type || "").toLowerCase() === "file") {
      const group = el.parentElement?.closest("[aria-labelledby]")
      const named = group ? group.getAttribute("aria-labelledby").split(/\s+/).map((id) => textOf(document.getElementById(id))).join(" ").trim() : ""
      if (named && realAsk(named, true) && !/^(attach|upload|browse|choose( a)? file|select( a)? file|enter manually|dropbox|google drive)$/i.test(named)) return named
    }
    if (el.id) {
      // Its own form's label first: some sites render the form twice (desktop + mobile) with the same ids.
      const sel = `label[for="${CSS.escape(el.id)}"]`
      const label = el.form?.querySelector(sel) || el.closest("[class*='field' i], [class*='form' i]")?.querySelector(sel) || document.querySelector(sel)
      if (label && realAsk(textOf(label), true)) return textOf(label)
    }
    // An input inside a component's shadow root: its label is in that root, on the component itself, or around the component.
    const root = el.getRootNode()
    if (root instanceof ShadowRoot) {
      const inner = textOf(root.querySelector(el.id ? `label[for="${CSS.escape(el.id)}"]` : "label")) || textOf(root.querySelector("label, legend"))
      if (inner && realAsk(inner, true)) return inner
      const byIn = (el.getAttribute("aria-labelledby") || "").split(/\s+/).map((id) => textOf(root.getElementById(id))).join(" ").trim()
      if (realAsk(byIn, true)) return byIn
      for (const a of ["label", "aria-label", "placeholder", "title"]) {
        const v = (root.host.getAttribute(a) || "").trim()
        if (realAsk(v, true)) return v
      }
      const outside = labelOf(root.host)
      if (outside) return outside
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
    // React hears focus as focusin/focusout, never as focus/blur events; and while the person is in the side panel the page has no focus,
    // so el.focus() fires nothing. Workday keeps a typed value only on its blur (focusout): without it the box shows text it never took.
    el.dispatchEvent(new FocusEvent("focusin", { bubbles: true, composed: true }))
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set
      || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
    if (setter) setter.call(el, value)
    else el.value = value
    try {
      el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, composed: true, data: value, inputType: "insertFromPaste" }))
    } catch {
      el.dispatchEvent(new Event("input", { bubbles: true, composed: true }))
    }
    for (const name of ["change", "blur"]) el.dispatchEvent(new Event(name, { bubbles: true, composed: true }))
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true }))
  }

  let applicationJob = null
  let facts = null
  let cv = null
  /** This job's own cover / motivation letter from Odds (upload_letter), if the person made one. */
  let letter = null
  let uploaded = false
  /** Inputs the CV went into, and its name: a site that clears its input after taking the file still shows the name beside it. */
  const cvInputs = new WeakSet()
  let cvStem = ""
  const attempts = new WeakMap()
  const verifications = new WeakMap()
  for (const name of ["input", "change"]) document.addEventListener(name, event => { if (event.isTrusted && event.target instanceof Element) verifications.delete(event.target) }, true)
  const asked = new Set()

  /** Every element matching `selector` on the page, including inside open shadow roots (SmartRecruiters' Easy Apply and other component-built forms draw their inputs there). */
  /** Odds' own bar, pill and mascot tab (some drawn in shadow roots): never a page control. Climbs out of shadow roots to their hosts. */
  function oddsOwn(el) {
    for (let n = el; n; ) {
      if (n.closest?.(".odds-apply-bar, .odds-fill-host, [data-odds-bar], [id^='odds-'], #odds-add, #odds-auto")) return true
      const root = n.getRootNode?.()
      n = root && root !== document && root.host ? root.host : null
    }
    return false
  }
  function deepAll(selector, root = document, out = []) {
    for (const el of root.querySelectorAll(selector)) out.push(el)
    for (const host of root.querySelectorAll("*")) if (host.shadowRoot) deepAll(selector, host.shadowRoot, out)
    return out
  }
  /** The fields of the form on screen: text-like inputs, text areas, selects and radio groups (one entry per group). */
  function fields() {
    const out = []
    const groups = new Set()
    for (const el of deepAll("input, textarea, select")) {
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
        let radios = deepAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`).filter(shown)
        // One radio per name (bunq names them 4396280yes / 4396280no): the radios in the nearest box holding two or more are one question.
        if (radios.length < 2) {
          for (let c = el.parentElement, i = 0; c && i < 6; c = c.parentElement, i++) {
            const near = [...c.querySelectorAll('input[type="radio"]')].filter(shown)
            if (near.length >= 2) { radios = near; for (const r of near) if (r.name) groups.add(r.name); break }
          }
        }
        const fieldset = el.closest("fieldset")
        const legend = fieldset?.querySelector("legend")
        // The question over the choices (Ashby puts it in a label of its own, not tied to any one radio), never the first choice's text.
        const title = fieldset ? [...fieldset.querySelectorAll("label")].find((l) => !l.querySelector("input") && !radios.some((r) => l.htmlFor && l.htmlFor === r.id)) : null
        // Without a legend or a title: the text before the first choice, as for a group of checkboxes ("Have you previously worked at
        // bunq?"), never the first choice's own "Yes".
        const label = textOf(legend) || textOf(title) || (el.closest("[role='radiogroup']") ? labelOf(el.closest("[role='radiogroup']")) : "") || groupOf(radios[0]) || labelOf(el)
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
      // Workday's multi-select prompt ("How Did You Hear About Us?"): a search box over a menu that can have levels (Job Sites → LinkedIn).
      if (el.tagName === "INPUT" && el.closest("[data-automation-id='multiSelectContainer']") && (el.getAttribute("data-uxi-widget-type") === "selectinput" || el.getAttribute("data-automation-id") === "searchBox")) { out.push({ kind: "combobox", el, label, widget: "workday-multi" }); continue }
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
      let label = by || (b.id && textOf(document.querySelector(`label[for="${CSS.escape(b.id)}"]`))) || b.getAttribute("aria-label") || ""
      // A dropdown that names itself by its placeholder ("Select One Required" on Workday): the question is the field's own label above it.
      if (!label || /^\s*(select( one)?|choose|selecteer|kies|please select)\b[\s\w]{0,20}$/i.test(label)) {
        const box = b.closest("[data-automation-id^='formField'], fieldset, [role='group']")
        const own = box ? textOf(box.querySelector("label, legend, [data-automation-id='richText']")) : ""
        label = own || choiceLabel(b) || label
      }
      if (label) out.push({ kind: "listbox", el: b, label, widget: "listbox", ...(dropdownChoices.get(b)?.length ? { options: dropdownChoices.get(b) } : {}) })
    }
    // Yes/No and other short choices drawn as buttons (Ashby): one entry per group, never the form's own Next/Submit.
    for (const box of document.querySelectorAll("div, fieldset")) {
      // (Ashby's Yes/No buttons carry no type, so the browser calls them submit: only an explicit type="submit" is the form's own)
      const buttons = [...box.children].filter((c) => c.tagName === "BUTTON" && c.getAttribute("type") !== "submit")
      // Besides its buttons a group may hold only a hidden input that mirrors the choice (Ashby's yes/no keeps a hidden checkbox).
      const rest = [...box.children].filter((c) => c.tagName !== "BUTTON")
      if (buttons.length < 2 || buttons.length > 6 || !rest.every((c) => c.tagName === "INPUT" && (!shown(c) || c.tabIndex < 0 || c.type === "hidden")) || !buttons.every((b) => shown(b) && textOf(b).length > 0 && textOf(b).length <= 40)) continue
      if (box.closest("#odds-add, .odds-job-chance, .odds-apply-bar, nav, header, footer, [role='search']") || buttons.some((b) => /^(next|continue|submit|review|apply|back|save|cancel|volgende|verder)/i.test(textOf(b)))) continue
      const label = choiceLabel(box)
      if (label) out.push({ kind: "choice", el: buttons, label, options: buttons.map(textOf), box, widget: "choice" })
    }
    // Answer buttons that sit a few boxes deep (Homerun: button-grid › button-row › button-cell › button, one name per question): grouped by that name.
    const byName = new Map()
    for (const b of document.querySelectorAll("button[name]")) {
      if (b.getAttribute("type") === "submit" || !shown(b) || !b.name) continue
      byName.set(b.name, [...(byName.get(b.name) || []), b])
    }
    for (const buttons of byName.values()) {
      if (buttons.length < 2 || buttons.length > 6 || out.some((f) => f.kind === "choice" && f.el.some((b) => buttons.includes(b)))) continue
      if (!buttons.every((b) => textOf(b).length > 0 && textOf(b).length <= 40) || buttons.some((b) => /^(next|continue|submit|review|apply|back|save|cancel|volgende|verder)/i.test(textOf(b)))) continue
      let box = buttons[0].parentElement
      while (box && !buttons.every((b) => box.contains(b))) box = box.parentElement
      if (!box || box.closest("#odds-add, .odds-job-chance, .odds-apply-bar, nav, header, footer, [role='search']")) continue
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
    // Workday's multi-select shows its picks as chips (selectedItem) in its own container.
    const wd = input.closest?.("[data-automation-id='multiSelectContainer']")
    if (wd) return [...wd.querySelectorAll("[data-automation-id='selectedItem']")].map(textOf).filter(Boolean).join(", ")
    const control = input.closest("[class*='control' i]") || input.parentElement?.closest("[class*='select' i], [class*='container' i]")
    // react-select: the choice lives in the single-value sibling. An empty slot means nothing is selected,
    // even when the search input still shows the words that were typed.
    const singleEl = control?.querySelector("[class*='single-value'], [class*='singlevalue' i], [class*='selected-value']")
    if (singleEl) {
      const t = textOf(singleEl)
      return PLACEHOLDER.test(t) ? "" : t
    }
    // react-select with nothing chosen draws no single-value at all: its input holds only search words, never a choice.
    if (/\bselect__input\b/.test(String(input.className || "")) && !control?.querySelector("[class*='multi-value']")) return ""
    // A multi-select shows its picks as chips ("English ×"): their labels, joined. The chip box itself, even empty, is the truth.
    if (control?.querySelector("[class*='multi-value']")) {
      return [...control.querySelectorAll("[class*='multi-value__label'], [class*='multivaluelabel' i]")].map(textOf).filter(Boolean).join(", ")
    }
    // An autocomplete that keeps the chosen suggestion in its own box (Ashby's location), once its list has closed.
    if (input.tagName === "INPUT" && /^(list|both)$/.test(input.getAttribute("aria-autocomplete") || "") && input.getAttribute("aria-expanded") !== "true") return String(input.value || "").trim()
    // Any dropdown input that shows its choice in its own box once its list is closed (a country-code picker showing "(+31) Netherlands").
    if (input.tagName === "INPUT" && (input.getAttribute("role") === "combobox" || input.hasAttribute("aria-haspopup")) && input.getAttribute("aria-expanded") !== "true") {
      const own = String(input.value || "").trim()
      if (own && !PLACEHOLDER.test(own)) return own
    }
    // A button that is the dropdown (aria-haspopup=listbox) shows the choice as its own text.
    if (input.tagName === "BUTTON" && input.getAttribute("aria-expanded") !== "true") {
      const t = textOf(input)
      if (t && !PLACEHOLDER.test(t)) return t
    }
    return ""
  }
  /** Whether the dropdown now shows the option that was picked: its visible text (the list closed) holds that option's words, flags and symbols aside. */
  /** react-select (Greenhouse, many others): the input holds only search words; the chosen option is the "single-value" beside it. */
  const reactSelectBox = (input) => (/\bselect__input\b/.test(String(input?.className || "")) ? input.closest("[class*='select__control'], [class*='-control']") : null)
  const reactSelectChoice = (input) => textOf(reactSelectBox(input)?.querySelector("[class*='single-value'], [class*='multi-value__label']"))
  function choiceShownNear(input, expected) {
    if (!input?.isConnected || !expected || input.getAttribute?.("aria-expanded") === "true") return false
    const norm = (t) => String(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
    const want = norm(expected)
    if (want.length < 2) return false
    // Typed search words are no choice: on react-select only the chosen value counts (it read "University of Amsterdam" typed in an
    // empty School box as kept).
    if (reactSelectBox(input)) return norm(reactSelectChoice(input)).includes(want)
    const wrap = input.parentElement?.closest("[class*='control' i], [class*='select' i], [class*='dropdown' i], [class*='combo' i], [class*='picker' i], [class*='field' i]") || input.parentElement
    const seen = norm(`${input.value || ""} ${wrap?.innerText || input.innerText || ""}`)
    return seen.includes(want)
  }
  /** What a dropdown shows as its choice: a search box's chip, or (a div role=combobox such as MUI's Select) its own text, empty while it shows a prompt. */
  const shownChoice = (input) => {
    const v = comboValue(input)
    if (v || input.tagName === "INPUT" || input.getAttribute("role") !== "combobox") return v
    const t = textOf(input)
    return PLACEHOLDER.test(t) ? "" : t
  }
  /** The options a dropdown shows now: the list that belongs to it, else the visible one on the page. */
  function listed(input, loose = true) {
    // (a Workday field's chosen chips sit in a listbox of their own: never the open list)
    const own = (id) => (id ? (input.getRootNode().getElementById?.(id) ?? document.getElementById(id)) : null)
    const named = input.getAttribute("aria-controls") || input.getAttribute("aria-owns")
    // Without its own id: the list inside this field's own box first (react-select draws its menu there); a list elsewhere on the page only
    // when it is the one list open. Taking "the last list on the page" read another dropdown's choices (Greenhouse's School, Degree and
    // hours boxes all showed the month list) and Broods answered from the wrong options.
    const open = (l) => l && shown(l) && [...l.querySelectorAll("[role='option']")].some((o) => o.getAttribute("data-automation-id") !== "selectedItem")
    // react-select wraps its input in an "input-container" that holds no list: the field's box is the one above it.
    const near = input.closest("[class*='container']:not([class*='input-container']), div")?.querySelector("[role='listbox']")
    // A dropdown that says it is closed owns no open list: the one list open on the page is another field's (Gender's choices were read
    // into Location, School and Degree).
    const anywhere = () => { if (input.getAttribute("aria-expanded") === "false") return null; const all = deepAll("[role='listbox']").filter(open); return all.length === 1 ? all[0] : null }
    const listbox = own(input.getAttribute("aria-controls")) || own(input.getAttribute("aria-owns")) || (named && !loose ? null : (open(near) ? near : anywhere() || near))
    let options = [...(listbox?.querySelectorAll("[role='option'], [data-automation-id='promptOption']") || [])].filter((o) => shown(o) && o.getAttribute("data-automation-id") !== "selectedItem" && !/^\s*(searching|loading|zoeken|bezig|laden)\b/i.test(textOf(o)))
    // Workday draws each choice three times (menuItem › promptLeafNode › promptOption): the menu item is the one to press.
    if (options.some((o) => o.getAttribute("data-automation-id") === "menuItem")) options = options.filter((o) => o.getAttribute("data-automation-id") === "menuItem")
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
  /** The choices a dropdown showed the last time it was opened (a fill that found none of its own tells Broods these). */
  const seenOptions = new WeakMap()
  async function readChoices(f) {
    if (f.options?.length || (f.kind !== "combobox" && f.kind !== "listbox")) return f.options
    if (!dropdownChoices.has(f.el)) {
      let seen = []
      await pickOption(f.el, null, f.label, (list) => { seen = list; return -1 })
      const read = seen.filter((o) => o && !PLACEHOLDER.test(o)).slice(0, 300)
      // Nothing read (another list was open, the menu was slow): not kept, so the next look tries again.
      if (read.length) dropdownChoices.set(f.el, read)
    }
    const options = dropdownChoices.get(f.el) || []
    if (options.length) f.options = options
    return f.options
  }
  /** Opens a dropdown and clicks the option that means `answer`; answers whether one was clicked. */
  async function pickOption(input, answer, label, fallback) {
    // A text box that opens a list (Ashby's location: an <input> with aria-haspopup="listbox") is typed into, not pressed like a button.
    const button = input.tagName === "BUTTON" || (input.getAttribute("aria-haspopup") === "listbox" && input.tagName !== "INPUT")
    // (a div role=combobox, like MUI's Select, opens on the mouse going down, not on a bare click)
    const pressOnly = button && input.tagName !== "BUTTON" && input.getAttribute("role") === "combobox"
    if (button && !pressOnly) input.click()
    else if (pressOnly) {
      input.focus()
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        input.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }))
        await sleep(40)
      }
    } else {
      // A dropdown opens on a whole press (pointer down, mouse down, up, click) on its control box, as a hand does; the arrow key is the second try.
      const control = input.closest("[class*='control'], [class*='Control']") ?? input
      input.focus()
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        control.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }))
        await sleep(40)
      }
    }
    await sleep(150)
    // A list that is drawn a moment after the press (dsm-firmenich: ~600 ms): waited for, and only the box's own list counts meanwhile.
    let { options, texts } = listed(input, false)
    if (input.getAttribute("aria-controls") || input.getAttribute("aria-owns")) {
      for (let waited = 0; texts.length === 0 && waited < 1200; waited += 100) { await sleep(100); ;({ options, texts } = listed(input, false)) }
      if (texts.length === 0) ({ options, texts } = listed(input))
    } else ({ options, texts } = listed(input))
    if (!button && texts.length === 0) {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", keyCode: 40, bubbles: true }))
      await sleep(250)
      ;({ options, texts } = listed(input))
    }
    if (texts.length) seenOptions.set(input, texts)
    const choose = (list) => {
      if (answer === null) return fallback ? fallback(list) : -1
      let i = A.chooseOption(list, answer, label)
      // "How did you hear?" with no LinkedIn in the list: the closest honest option.
      if (i < 0 && A.isHearQuestion(label)) i = A.heardChoice(list, answer)

      return i
    }
    let i = choose(texts)
    // A long list that draws only the part in view (a country list that shows Afghanistan to Cayman Islands first): scrolled a page at a time
    // until the wanted choice is drawn, then picked. Typing in such a box often does nothing, so this comes before typing.
    if (i < 0 && answer !== null && options.length >= 6) {
      let box = options[0].parentElement
      while (box && box !== document.body && !(box.scrollHeight > box.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement
      if (box && box !== document.body) {
        box.scrollTop = 0
        for (let step = 0; step < 80 && i < 0; step++) {
          const before = box.scrollTop
          box.scrollTop = before + Math.max(80, box.clientHeight * 0.8)
          await sleep(120)
          ;({ options, texts } = listed(input))
          i = choose(texts)
          if (box.scrollTop === before) break
        }
      }
    }
    // Some lists open only for typing, or draw their choices from a search: the answer is typed and the match picked.
    // Typing searches the list; only for questions whose answer is a name to look up (a place, a school, a field, a language). A yes/no or legal
    // question is only ever answered with one of its own options — never with a city typed into it ("Amsterdam" in a non-compete question).
    const searchable = /\b(location|city|ville|lieu|plaats|woonplaats|stad|country|pays|land|school|university|universit\w*|[eé]cole|discipline|field of study|institution|degree|dipl[oô]me|nationalit\w*|language|langue|taal|skills?|comp[eé]tences?)\b/i.test(label || "")
    if (i < 0 && !button && answer !== null && input.tagName === "INPUT" && searchable) {
      typeInto(input, searchQuery(answer))
      // Remote place searches often take longer than 900 ms. Do not erase the
      // query while the employer is still fetching suggestions.
      for (let waited = 0; waited < 4000; waited += 100) {
        await sleep(100)
        ;({ options, texts } = listed(input))
        if (texts.length) seenOptions.set(input, texts)
        i = choose(texts)
        if (i >= 0 || texts.length) break
      }
      // A place, a school or a field is searched for: the first suggestion that names what was asked ("Amsterdam" in "Amsterdam, North
      // Holland, Netherlands"). Never one that only starts like it ("Yes" is not "Yeshiva University").
      if (i < 0 && texts.length && /\b(location|city|school|university|discipline|field of study|institution)\b/i.test(label)) {
        const head = String(answer).split(",")[0].trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const named = head.length >= 2 ? new RegExp(`(^|[^\\p{L}])${head}($|[^\\p{L}])`, "iu") : null
        i = named ? texts.findIndex((t) => named.test(String(t))) : -1
      }
      if (i < 0) { typeInto(input, ""); input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); input.blur(); return null }
    }
    if (i < 0) { if (input.tagName === "INPUT" || input.getAttribute("aria-expanded") === "true") input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); if (!button) input.blur(); return null }
    const text = texts[i]
    // Full pointer sequence: react-select and Workday options often open or commit on pointerdown, not on click alone.
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      options[i].dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }))
    }
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
  /** known: a validated site recipe names this field as the CV upload (Greenhouse labels it only "Attach"). */
  /** Whether the page shows this file's name anywhere, in shadow DOM too, however the site writes it ("Kien Phung CV.pdf" shown as "Kien_Phung_CV.pdf"). */
  function fileNameShown(name) {
    const norm = (t) => String(t).toLowerCase().replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[^\p{L}\p{N}]+/gu, "")
    const want = norm(name).slice(0, 18)
    if (want.length < 4) return false
    return deepAll("span, p, div, li, a, button, label, strong, td").some((e) => e.children.length === 0 && shown(e) && norm(textOf(e)).includes(want))
  }
  /** How long one fill step may work in the tab (the server waits 45 s for it). Every per-field budget is measured against this. */
  const FILL_STEP_MS = 40000
  /** Why the CV file could not be had (the server's words), for the upload step's answer to Broods. */
  let cvLoadError = ""
  /** A photo box (profile image, avatar, picture), by its words or because it takes images only: never the CV's place. */
  const imageBox = (el, label) => {
    const accept = String(el?.getAttribute?.("accept") || "").toLowerCase()
    const onlyImages = accept && /image/.test(accept) && !/pdf|doc|application/.test(accept)
    return onlyImages || /\b(profile (image|picture|photo)|photo|picture|avatar|headshot|foto|afbeelding|profielfoto|bild)\b/i.test(`${label} ${el?.name || ""} ${el?.id || ""} ${el?.getAttribute?.("aria-label") || ""}`)
  }
  async function uploadCv(f, known = false) {
    // SmartRecruiters' first file box is "Upload profile image": Odds put the CV there, the site refused it, and Broods' upload into
    // the real CV box was then turned down as "already attached".
    if (imageBox(f.el, f.label)) return false
    const around = `${f.label} ${f.el.name || ""} ${f.el.id || ""} ${f.el.getAttribute("aria-label") || ""}`
    // On a resume-only step, accept any file input even when the button says "Sélectionner un fichier".
    const resumeStep = known || isResumeAsk(around) || isResumeAsk(textOf(document.querySelector("h1, h2, h3")))
      || (f.kind === "file" && fields().filter((x) => x.kind !== "file").every((x) => answered(x) || !required(elOf(x), x.label)))
    if (uploaded || !cv || (!isResumeAsk(around) && !resumeStep)) return false
    const file = await ask({ type: "cv-file", doc: cv.id }, 15000)
    if (file?.status !== "ok") { cvLoadError = file?.message || "The CV file did not load."; return false }
    const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], file.name, { type: file.type }))
    const fieldsBefore = fields().length
    try { f.el.files = transfer.files } catch { /* some ATS wrap the input */ }
    f.el.dispatchEvent(new Event("input", { bubbles: true }))
    f.el.dispatchEvent(new Event("change", { bubbles: true }))
    await sleep(80)
    uploaded = Boolean(f.el.files?.length) && f.el.getAttribute("aria-invalid") !== "true"
    if (!uploaded) {
      // Sites that take the file and clear their input (Homerun, Lever): the file's name shown beside the box means it is in.
      const box = f.el.closest("form, section, [class*='upload' i], [class*='file' i], [class*='dropzone' i], div")?.parentElement || document.body
      const stem = file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 24)
      // Sites that read the CV and rebuild the form from it (SmartRecruiters' Easy Apply): the upload box is gone, or the form grew its
      // own experience / education boxes. That is the CV taken in.
      for (let t = 0; t < 15 && !uploaded; t++) { await sleep(200); uploaded = textOf(box).includes(stem) || fileNameShown(file.name) || !f.el.isConnected || fields().length >= fieldsBefore + 3 }
    }
    if (uploaded) {
      cvInputs.add(f.el); cvStem = file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 24)
      await pageSettled()
    }
    return uploaded
  }
  /** Sites that read the CV (PwC, Phenom) rewrite the form a few seconds later and drop what was typed meanwhile: wait for the page to go quiet. */
  async function pageSettled(quietMs = 1500, maxMs = 9000) {
    let last = Date.now()
    const watch = new MutationObserver(() => { last = Date.now() })
    watch.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
    // (a form drawn in shadow DOM does not show in that observer: its boxes are counted too)
    const shape = () => fields().length + ":" + fields().filter((x) => answered(x)).length
    let was = shape()
    const t0 = Date.now()
    while (Date.now() - last < quietMs && Date.now() - t0 < maxMs) {
      await sleep(150)
      const now = shape()
      if (now !== was) { was = now; last = Date.now() }
    }
    watch.disconnect()
  }
  function cvShownAt(el) {
    if (!uploaded) return false
    if (cvInputs.has(el)) return true
    const box = el.closest("form, section, [class*='upload' i], [class*='file' i], [class*='dropzone' i], div")?.parentElement
    return Boolean(cvStem && ((box && textOf(box).includes(cvStem)) || fileNameShown(cvStem)))
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
    // A required pronoun / gender group nobody answered: the neutral option ("Prefer not to say") is ticked, one box only — never an identity chosen for the person.
    for (const c of document.querySelectorAll('input[type="checkbox"], input[type="radio"]')) {
      if (c.checked || c.disabled || !shown(c) && !c.closest("label")) continue
      const label = labelOf(c) || textOf(c.closest("label") || c.parentElement)
      if (!/\b(prefer not to (say|answer|disclose|specify)|rather not (say|answer)|decline to (answer|state|self)|choose not to (answer|disclose)|do not wish to (answer|disclose|say))\b/i.test(label)) continue
      const group = c.closest("fieldset, [role='group'], [role='radiogroup'], [class*='group' i]") || c.parentElement?.parentElement
      if (!group || !/\b(pronouns?|gender|geslacht|voornaamwoord\w*)\b/i.test(textOf(group).slice(0, 300))) continue
      if (group.querySelector("input:checked")) continue
      c.click()
      if (!c.checked) c.closest("label")?.click()
      if (c.checked) ticked++
    }
    return ticked
  }

  /** Widget handlers — one path per ATS kind (typeahead / choice / listbox / card+plain / file). */
  async function fillTypeahead(f, answer, besideCountry) {
    const place = A.valueFor("text", f.label, answer, besideCountry)
    const full = [place, facts?.place, facts?.answers?.city && facts?.answers?.country ? `${facts.answers.city}, ${facts.answers.country}` : "", facts?.answers?.city ? `${facts.answers.city}, Netherlands` : ""].filter(Boolean)
    // A place search often finds nothing for "Amsterdam, Netherlands" but does for "Amsterdam": the city alone is searched next.
    const tries = [...new Set([...full, ...full.map((q) => String(q).split(",")[0].trim())].filter(Boolean))]
    const wanted = String(place || full[0] || "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean)
    for (const q of tries) {
      // The suggestion that names the whole place asked for first (the city, then its country), else the first one.
      // Compared without punctuation (Greenhouse writes Master’s, Autofill Master's). Then the usual best-option match; the first
      // suggestion only for a place search (a city box lists the city first) — on a list like Degree it picked "Master of Business
      // Administration" for "Master's Degree".
      const bare = (t) => String(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
      const placeBox = /\b(city|location|place|town|address|residence|woonplaats|stad|plaats|locatie)\b/i.test(f.label)
      const expectedText = await pickOption(f.el, q, f.label, (texts) => {
        if (!texts.length) return -1
        const i = texts.findIndex((t) => wanted.every((w) => bare(t).includes(bare(w))))
        if (i >= 0) return i
        const best = typeof A.chooseOption === "function" ? A.chooseOption(texts, String(q), f.label) : -1
        if (best >= 0) return best
        return placeBox ? 0 : -1
      })
      if (expectedText !== null) {
        // react-select keeps the typed words in its input until it loses focus, then drops them: only a chosen value is a fill.
        if (reactSelectBox(f.el)) { await sleep(150); if (choiceShownNear(f.el, expectedText)) return { ok: true, expected: null, expectedOption: -1, expectedText }; continue }
        if (f.el.value.trim() !== "" || Boolean(document.getElementById("selected-location")?.value)) return { ok: true, expected: null, expectedOption: -1, expectedText }
      }
    }
    return { ok: false, expected: null, expectedOption: -1, expectedText: null }
  }
  /**
   * Workday's multi-select prompt: the answer is searched (Workday lists matching choices from every level), the closest one pressed; a
   * choice that is a level of its own (Job Sites) opens its list and the answer is chosen there. Kept only when the field shows it as a chip.
   */
  async function fillWorkdayMulti(f, answer) {
    const input = f.el
    const before = shownChoice(input)
    const choose = (texts) => {
      let i = answer === null ? -1 : A.chooseOption(texts, answer, f.label)
      if (i < 0 && answer !== null && A.isHearQuestion(f.label)) i = A.heardChoice(texts, answer)
      return i
    }
    const press = async (el) => {
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      el.click()
      await sleep(450)
    }
    const waitList = async (ms) => { for (let w = 0; w < ms; w += 150) { await sleep(150); if (listed(input).texts.length) return } }
    const tryList = async () => {
      for (let depth = 0; depth < 3; depth++) {
        const { options, texts } = listed(input)
        const i = choose(texts)
        if (i < 0) return null
        await press(options[i])
        const now = shownChoice(input)
        if (now && now !== before) return now
        if (!(await realClickEl(options[i]).catch(() => false)) || !listed(input).texts.length) await waitList(1200)
        const after = shownChoice(input)
        if (after && after !== before) return after
      }
      return null
    }
    input.focus()
    input.click()
    await waitList(1200)
    let got = await tryList()
    if (!got && answer !== null) {
      typeInto(input, String(answer))
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }))
      await waitList(3000)
      got = await tryList()
    }
    // The search words never stay in the box (the chip is the answer).
    if (String(input.value || "")) typeInto(input, "")
    // Escape closes a list left open; on a control that is no search box and shows no open list it would close the form's own pop-up (Picnic's).
    if (input.tagName === "INPUT" || input.getAttribute("aria-expanded") === "true") input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }))
    return { ok: Boolean(got), expected: null, expectedOption: -1, expectedText: got }
  }
  async function fillCombobox(f, answer) {
    if (f.widget === "workday-multi") return fillWorkdayMulti(f, answer)
    const fallback = (texts) => { if (broodsOnly()) return -1; const only = A.privacyChoice(texts); if (only >= 0) return only; const d = A.demographicChoice(f.label, texts, facts); return d >= 0 ? d : A.preferenceChoice(f.label, texts) }
    let expectedText = await pickOption(f.el, answer, f.label, fallback)
    // A place search finds nothing for "Amsterdam, Netherlands" but does for "Amsterdam": search the first part, take the suggestion that
    // also names the rest ("Amsterdam, North Holland, Netherlands").
    const parts = String(answer).split(",").map((x) => x.trim()).filter(Boolean)
    if (expectedText === null && parts.length > 1) {
      const rest = parts.slice(1).map((x) => x.toLowerCase())
      expectedText = await pickOption(f.el, parts[0], f.label, (texts) => texts.findIndex((t) => rest.every((r) => String(t).toLowerCase().includes(r))))
    }
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
    const pickers = list.filter((f) => /country code|calling code|dial(ling)? code|land(s)?nummer|landcode|landnummer|landenkeuze|vorwahl|ländervorwahl|code du pays|indicatif|prefix|country/i.test(f.label) && (f.kind === "select" || f.kind === "combobox" || f.kind === "listbox"))
    return pickers.some((f) => { const v = String(fieldValue(f) || "").trim(); return v && !/^(international|select|choose|kies|--|\+?$)/i.test(v) && !PLACEHOLDER.test(v) })
  }
  /** A phone box that declares its format (pattern="^[\+]([0-9]*)$" on TNO): the person's number in the first format that fits it. */
  function phoneForPattern(el, value) {
    const pattern = el?.getAttribute?.("pattern")
    if (!pattern || !/\b(phone|mobile|telephone|telefoon\w*|mobiel\w*|gsm)\b/i.test(`${labelOf(el) || ""} ${el.name || ""} ${el.id || ""}`)) return value
    let re
    try { re = new RegExp(`^(?:${pattern})$`) } catch { return value }
    const digits = String(value).replace(/[^\d+]/g, "")
    const full = digits.startsWith("+") ? digits : digits.startsWith("00") ? `+${digits.slice(2)}` : digits.startsWith("0") ? `+31${digits.slice(1)}` : `+${digits}`
    const code = /^\+(\d{2})/.exec(full)?.[1] || "31"
    const national = `0${full.slice(1 + code.length)}`
    for (const c of [full, full.slice(1), national, `00${full.slice(1)}`, national.replace(/^0/, ""), String(value)]) if (re.test(c)) return c
    return value
  }
  /** The most characters a box takes (maxlength, or a "0/500" counter next to it); 0 when it does not say. */
  function charLimit(el) {
    if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return 0
    if (el.maxLength > 0 && el.maxLength < 100000) return el.maxLength
    const counter = textOf(el.parentElement).match(/\b\d{1,5}\s*\/\s*(\d{2,5})\b/)
    return counter ? Number(counter[1]) : 0
  }
  /** An answer cut to fit a box's limit at its last whole sentence (or word), never mid-sentence like a site's own maxlength does. */
  function fitTo(limit, text) {
    if (!limit || text.length <= limit) return text
    const cut = text.slice(0, limit)
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "), cut.endsWith(".") ? cut.length - 1 : -1)
    return end > limit * 0.4 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : limit)
  }
  /**
   * A date box that opens a month / year picker instead of taking typing (PwC's Phenom "Van"/"Tot"): open it, step the year with the
   * picker's own year list or ‹ › arrows until it shows the wanted year, click the month (English, Dutch or German names, or its number),
   * then check the box. Works on any picker of that shape; nothing site-specific.
   */
  const MONTHS = [/^(jan|januari|january|januar)/i, /^(feb|februari|february|februar)/i, /^(mar|mrt|mär|maart|march|märz)/i, /^(apr|april)/i, /^(may|mei|mai)/i, /^(jun|juni|june)/i, /^(jul|juli|july)/i, /^(aug|augustus|august)/i, /^(sep|sept|september)/i, /^(oct|okt|oktober|october)/i, /^(nov|november)/i, /^(dec|dez|december|dezember)/i]
  async function pickDate(el, value) {
    const d = String(value).trim().match(/^(\d{4})-(\d{2})/)
    if (!d || !el?.isConnected) return false
    const year = Number(d[1]), month = Number(d[2]) - 1
    const PICKERISH = "[role='dialog'], [class*='picker' i], [class*='calendar' i], [class*='datepicker' i], [class*='popover' i], [class*='dropdown' i]"
    // A picker still open from the box before is closed first, or the one that opens now would not look new.
    if ([...document.querySelectorAll(PICKERISH)].some((x) => shown(x) && /datepicker/i.test(String(x.className)))) {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }))
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      for (let w = 0; w < 800 && [...document.querySelectorAll(PICKERISH)].some((x) => shown(x) && /datepicker/i.test(String(x.className))); w += 100) await sleep(100)
    }
    // What was already on screen: the picker is whatever becomes visible after the click (new, or shown from hidden).
    const before = new Set([...document.querySelectorAll(PICKERISH)].filter(shown))
    el.click()
    el.focus?.()
    await sleep(300)
    // The picker: something that appeared after the click and holds month names or a year.
    const fresh = [...document.querySelectorAll(PICKERISH)].filter((x) => shown(x) && !before.has(x))
    // A picker of years only (a grid of years the arrows page through): the year is pressed and the box shows it.
    const yearGrid = fresh.find((x) => x.querySelector(".react-datepicker__year-text"))
    if (yearGrid) {
      for (let page = 0; page < 12; page++) {
        const cells = [...yearGrid.querySelectorAll(".react-datepicker__year-text")]
        const hit = cells.find((c) => textOf(c) === String(year))
        if (hit) { hit.click(); await sleep(200); return String(el.value || "").includes(String(year)) }
        const years = cells.map((c) => Number(textOf(c))).filter(Boolean)
        const next = yearGrid.querySelector(year < Math.min(...years) ? ".react-datepicker__navigation--previous" : ".react-datepicker__navigation--next")
        if (!next) break
        next.click()
        await sleep(100)
      }
      return false
    }
    const picker = fresh.find((x) => MONTHS.filter((re) => [...x.querySelectorAll("button, [role='button'], td, [role='gridcell'], [role='option'], span")].some((b) => re.test(textOf(b).trim()))).length >= 6)
      || el.closest("[class*='field' i], [class*='date' i], div")?.parentElement?.querySelector("[class*='picker' i], [class*='calendar' i]")
    if (!picker || !shown(picker)) return false
    const shownYear = () => {
      const sel = picker.querySelector("select")
      if (sel) return Number(sel.value || textOf(sel.options[sel.selectedIndex]))
      const t = textOf(picker).match(/\b(19|20)\d{2}\b/)
      return t ? Number(t[0]) : NaN
    }
    const yearSelect = picker.querySelector("select")
    if (yearSelect && [...yearSelect.options].some((o) => Number(o.value || o.text) === year)) {
      yearSelect.value = [...yearSelect.options].find((o) => Number(o.value || o.text) === year).value
      for (const name of ["input", "change"]) yearSelect.dispatchEvent(new Event(name, { bubbles: true }))
      await sleep(150)
    }
    const arrow = (dir) => [...picker.querySelectorAll("button, [role='button'], a")].find((b) => {
      const t = `${textOf(b)} ${b.getAttribute("aria-label") || ""} ${b.getAttribute("title") || ""} ${typeof b.className === "string" ? b.className : ""}`.toLowerCase()
      return dir < 0 ? /prev|vorig|zurück|earlier|‹|«|<|left|back/.test(t) : /next|volgend|weiter|later|›|»|>|right|forward/.test(t)
    })
    // (A picker whose arrows step one MONTH at a time needs up to ~12 clicks per year: PwC's from this month back to a 2022 start.)
    for (let i = 0; i < 180 && Number.isFinite(shownYear()) && shownYear() !== year; i++) {
      const b = arrow(shownYear() > year ? -1 : 1)
      if (!b) break
      b.click()
      await sleep(25)
    }
    if (Number.isFinite(shownYear()) && shownYear() !== year) return false
    const cell = [...picker.querySelectorAll("button, [role='button'], td, [role='gridcell'], [role='option'], span")].find((b) => shown(b) && (MONTHS[month].test(textOf(b).trim()) || textOf(b).trim() === String(month + 1).padStart(2, "0")))
    if (!cell) return false
    ;(cell.closest("button, [role='button'], td, [role='gridcell']") || cell).click()
    await sleep(200)
    const got = String(el.value || "")
    return got.includes(String(year)) && (got.includes(String(month + 1).padStart(2, "0")) || MONTHS[month].test(got.replace(/^[^a-z]*/i, "")))
  }
  /** Leaves the box and waits a moment: true when the site then still says it holds nothing. */
  async function siteSaysBlank(el) {
    if (!el?.isConnected) return false
    el.dispatchEvent(new Event("blur", { bubbles: false }))
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    await sleep(300)
    return blankErrorNear(el)
  }
  /** A visible "cannot be left blank / is required" message in the field's own block (the site's own verdict that it holds nothing). */
  function blankErrorNear(el) {
    const BLANK = /(cannot|can.?t|must not|should not) be (left )?(blank|empty)|darf nicht leer|ne peut pas être vide|mag niet leeg zijn/i
    let box = el
    for (let n = 0; n < 4 && box?.parentElement && box.parentElement !== document.body; n++) {
      box = box.parentElement
      if ([...box.querySelectorAll("input:not([type=hidden]), textarea, select")].length > 1) break
    }
    if (!box) return false
    return [...box.querySelectorAll("*")].some((n) => n.children.length === 0 && shown(n) && n.textContent.length < 120 && BLANK.test(n.textContent) && !n.contains(el))
  }
  /** Until when the events on the page are Odds' own real input (watchPerson ignores them). */
  let realInputUntil = 0
  const realInput = (message, ms) => {
    realInputUntil = Math.max(realInputUntil, Date.now() + ms + 1500)
    return ask(message, ms).finally(() => { realInputUntil = Math.max(realInputUntil, Date.now() + 1000) })
  }
  /** Real mouse / keyboard through Chrome's debugger (top page only: a frame's coordinates are not the tab's). */
  async function realClickEl(el) {
    if (window !== top || !el?.isConnected) return false
    try { el.scrollIntoView({ block: "center", inline: "center" }) } catch { /* ignore */ }
    await sleep(80)
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return false
    const res = await realInput({ type: "real-input", op: "click", x: r.left + r.width / 2, y: r.top + r.height / 2 }, 8000).catch(() => null)
    return Boolean(res?.ok)
  }
  async function realTypeEl(el, text, clear = true) {
    if (window !== top || !el?.isConnected) return false
    try { el.scrollIntoView({ block: "center" }) } catch { /* ignore */ }
    await sleep(80)
    const r = el.getBoundingClientRect()
    const res = await realInput({ type: "real-input", op: "type", text, clear, x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 }, 20000).catch(() => null)
    return Boolean(res?.ok)
  }
  const realKey = (key) => (window === top ? realInput({ type: "real-input", op: "key", key }, 6000).catch(() => null) : Promise.resolve(null))
  /**
   * The last rung for a field that refused Odds' own events: the same answer through real input. A box gets it typed (in its own shapes
   * too); a choice gets its option clicked; a search list gets the answer typed and the matching option clicked. Never a different answer.
   */
  /**
   * The suggestion a search box drew for what was typed, found by where it is (right under the box, as wide as it) and not by its markup:
   * many sites draw it as plain items with no role. The "Cannot find it? Fill in manually" line is never one.
   */
  function suggestionBelow(input, answer) {
    const r = input.getBoundingClientRect()
    const want = String(answer).toLowerCase().trim()
    const head = want.split(",")[0].trim()
    const found = deepAll("li, [role='option'], [role='menuitem'], a, button, div, span, p").filter((e) => {
      if (e === input || e.contains(input) || input.contains(e) || !shown(e)) return false
      const b = e.getBoundingClientRect()
      if (b.top < r.bottom - 2 || b.top > r.bottom + 420 || b.right < r.left || b.left > r.right + 40) return false
      const t = textOf(e).toLowerCase().trim()
      if (!t || t.length > 140 || /cannot find|can.t find|fill in manually|not found|niet gevonden|searching|loading/.test(t)) return false
      if ([...e.children].some((c) => textOf(c).toLowerCase().trim() === t)) return false
      return t === want || t.startsWith(want) || (head.length >= 3 && t.startsWith(head))
    })
    // The item itself, never a box that holds several of them (clicking its middle would pick another line).
    const items = found.filter((e) => !found.some((o) => o !== e && e.contains(o)))
    items.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
    return items[0] || null
  }
  /** What is typed into a search box: the first part of a place ("Amsterdam" of "Amsterdam, Netherlands"), which is what the site's search finds. */
  const searchQuery = (value) => (String(value).includes(",") ? String(value).split(",")[0].trim() : String(value)).slice(0, 40)
  async function realRetry(f, value) {
    const el = elOf(f)
    if (["text", "textarea", "date", "month", "number", "tel", "email"].includes(f.kind)) {
      // A date that typing does not take: the box's own month / year picker.
      if (/^\d{4}-\d{2}/.test(String(value).trim()) && await pickDate(el, value).catch(() => false)) return true
      for (const shape of [value, ...altShapes(el, value)]) {
        if (!(await realTypeEl(el, shape))) return false
        await sleep(150)
        if (answered(f) && fieldValue(f)) return true
      }
      return false
    }
    if (f.kind === "choice" || f.kind === "radio") {
      const i = A.chooseOption(f.options || [], value, f.label)
      if (i < 0) return false
      const target = f.kind === "radio" ? (f.el[i].closest("label") || document.querySelector(`label[for="${CSS.escape(f.el[i].id || "__none__")}"]`) || f.el[i]) : f.el[i]
      await realClickEl(target)
      await sleep(150)
      return answered(f)
    }
    if (f.kind === "checkbox") {
      await realClickEl(f.face && f.face !== el ? f.face : el)
      await sleep(120)
      return answered(f)
    }
    if (f.kind === "combobox" || f.kind === "listbox" || f.kind === "select") {
      if (f.kind === "select") return false
      await realClickEl(el)
      await sleep(250)
      if (el.matches("input")) await realTypeEl(el, searchQuery(value))
      const want = String(value).toLowerCase()
      const shownOptions = () => deepAll("[role='option'], li[class*='option' i], [class*='option' i]:not(select)").filter(shown).filter((o) => !/^\s*(searching|loading|zoeken|bezig|laden)\b/i.test(textOf(o)))
      // (a search list says "Searching…" first: wait for its real lines)
      for (let waited = 0; waited < 4000; waited += 200) { await sleep(200); if (waited >= 600 && shownOptions().length) break }
      const option = (shownOptions()
        .find((o) => { const t = textOf(o).toLowerCase().replace(/^(add new|new entry|nieuw toevoegen|toevoegen|voeg toe)\s*:?\s*/, ""); return t && (t === want || t.startsWith(want) || want.startsWith(t) || (want.length >= 6 && t.includes(want))) }) || suggestionBelow(el, value))
      if (option) await realClickEl(option)
      else await realKey("Enter")
      await sleep(250)
      // A search box keeps typed text that was never chosen only until the person leaves it: leave it (Tab), then see what stayed.
      if (el.matches("input") && !option) { await realKey("Tab"); await sleep(400) }
      return answered(f)
    }
    return false
  }
  /**
   * Other shapes of the same answer for a box that refused it: a date in the box's own format (its placeholder or pattern: MM/YYYY,
   * DD-MM-JJJJ, TT.MM.JJJJ…, else the common ones), a number on its own ("8.0 / 10" → "8.0", "8,0"). Never a different answer.
   */
  function altShapes(el, value) {
    const out = []
    const v = String(value).trim()
    const hint = `${el?.getAttribute?.("placeholder") || ""} ${el?.getAttribute?.("pattern") || ""} ${el?.getAttribute?.("aria-label") || ""} ${el?.getAttribute?.("data-format") || ""}`
    const date = v.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/)
    if (date) {
      const [, y, m, d = "01"] = date
      const fmt = hint.match(/\b(dd|tt|jj)?[\s./-]*(mm)[\s./-]*(yyyy|jjjj|aaaa|yy)\b|\b(yyyy|jjjj)[\s./-]*(mm)\b/i)
      if (fmt) {
        const t = fmt[0]
        out.push(t.replace(/yyyy|jjjj|aaaa/i, y).replace(/yy/i, y.slice(2)).replace(/mm/i, m).replace(/dd|tt/i, d).replace(/jj/i, d))
      }
      if (el?.type === "month") out.push(`${y}-${m}`)
      out.push(`${m}/${y}`, `${m}-${y}`, `${d}-${m}-${y}`, `${d}/${m}/${y}`, `${d}.${m}.${y}`, y)
    }
    const num = v.match(/^(\d+(?:[.,]\d+)?)\s*(?:\/|out of|uit|van)\s*\d+/i) || (el?.type === "number" || el?.inputMode === "numeric" || el?.inputMode === "decimal" ? v.match(/(\d+(?:[.,]\d+)?)/) : null)
    if (num) out.push(num[1], num[1].replace(".", ","), num[1].replace(",", "."))
    if (!date && !num) out.push(v)
    return [...new Set(out)].filter((x) => x && x !== v || !date && !num).slice(0, 6)
  }
  /** Typed key by key (keydown, the character, input, keyup), as masked boxes need; the box is emptied first. */
  async function typeLikePerson(el, text) {
    if (!el) return
    try { el.focus?.() } catch { /* ignore */ }
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const set = Object.getOwnPropertyDescriptor(proto, "value")?.set
    const put = (v) => (set ? set.call(el, v) : (el.value = v))
    put("")
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }))
    for (const ch of String(text)) {
      el.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true, cancelable: true }))
      el.dispatchEvent(new KeyboardEvent("keypress", { key: ch, bubbles: true, cancelable: true }))
      put(String(el.value ?? "") + ch)
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" }))
      el.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }))
      await sleep(15)
    }
    for (const name of ["change", "blur"]) el.dispatchEvent(new Event(name, { bubbles: true }))
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
  }
  let driveTactics = {}
  /** Fields Odds' own code filled from the person's saved answer, or a consent / "prefer not to say" rule: Broods may not change them. */
  const lockedByOdds = new WeakMap()
  let driveCopilot = false
  let copilotNextAt = 0
  let copilotHost = null
  let copilotDismissed = false
  let copilotIntentSeen = false
  function fillPlainOrCard(f, answer, besideCountry) {
    // react-phone-number-input (Recruitee and others): the full international number sets its own country picker; a national number is
    // read in whatever country it shows ("6 1234 5678" became +61 under International).
    if (elOf(f)?.classList?.contains("PhoneInputInput") || elOf(f)?.closest?.(".PhoneInput")) {
      const digits = String(answer).replace(/[^\d+]/g, "")
      const full = digits.startsWith("+") ? digits : digits.startsWith("00") ? `+${digits.slice(2)}` : digits.startsWith("0") ? `+31${digits.slice(1)}` : facts?.phone && String(facts.phone).replace(/[^\d+]/g, "").endsWith(digits) ? String(facts.phone).replace(/[^\d+]/g, "") : `+31${digits}`
      type(f.el, full)
      return { ok: true, expected: full, expectedOption: -1, expectedText: null }
    }
    // The box's own declared format wins over any guess from a country picker nearby (TNO's "Country of residence" is not a phone code).
    const fitted = phoneForPattern(elOf(f), answer)
    if (fitted !== answer || elOf(f)?.getAttribute?.("pattern") && /\b(phone|mobile|telefoon\w*|mobiel\w*)\b/i.test(f.label)) {
      type(f.el, fitted)
      return { ok: true, expected: fitted, expectedOption: -1, expectedText: null }
    }
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
      url: pageHref(),
      broods_only: true,
      questions: open.slice(0, 30).map((f) => ({
        key: A.applicationQuestionKey(f.label, facts?.job_id),
        label: f.label.slice(0, 200),
        kind: f.kind === "choice" ? "radio" : (f.kind === "combobox" || f.kind === "listbox") && f.options?.length ? "select" : f.kind,
        ...((f.options?.length || ["combobox", "listbox"].includes(f.kind)) ? { options: (f.options?.length ? f.options : dropdownChoices.get(f.el)?.length ? dropdownChoices.get(f.el) : listed(elOf(f)).texts).slice(0, 300).map((o) => String(o).slice(0, 120)) } : {}),
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
        ok = verify() && answered(f) && !fieldInvalid(f)
      }
      if (!ok && answer !== null && !secretField(f)) {
        const recovered = await recoverFill(f, String(answer), { allowReal: false, started: Date.now() })
        if (recovered.ok) {
          ok = true
          verifications.set(control, () => answered(f) && !fieldInvalid(f))
        }
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
    const changed = !bar || bar.dataset.raw !== text || bar.dataset.state !== state
    // Heartbeat so Odds keeps a live line even when the words stay the same.
    if (changed || Date.now() - lastReport > 4000) {
      lastReport = Date.now()
      ask({ type: "application-progress", status, message: text })
    }
    // The bar itself is the Odds mascot rolled out with one plain sentence (mascot.js), drawn in a shadow root.
    bar = globalThis.oddsMascot.bar(text, state)
    bar.dataset.raw = text
    // An application is running here: the Odds panel opens in the page by itself (Chrome's side panel needs a click; the page's own frame does not).
    if (typeof setPanelBusy === "function") setPanelBusy(state === "filling")
  }

  // ---- "Save to Autofill?" (the side panel asks): the answers on this form that Autofill does not have yet (questions, not contact details
  // or the profile's own facts). The panel shows each with a tick and an editable box; only what the person keeps is saved, as their own
  // answer: the next form asking the same question gets it word for word, and they can edit it any time in Odds → Autofill.
  /** Autofill already keeps this question in other words ("…thesis, how many hours…" asked another way): never offered again. */
  function savedLike(question) {
    const saved = Array.isArray(facts?.saved_answers) ? facts.saved_answers : []
    const words = (t) => new Set(String(t).toLowerCase().replace(/[^a-z0-9à-ÿ ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !/^(the|and|you|your|for|are|with|this|that|our|will|have|from|what|which|would|how|many|much|does|did|can|its|per)$/.test(w)))
    const want = words(question)
    if (want.size < 3) return false
    return saved.some((s) => {
      const have = words(s.q)
      if (have.size < 3) return false
      const hit = [...want].filter((w) => have.has(w)).length
      return hit / Math.min(want.size, have.size) >= 0.6 && hit >= 3
    })
  }
  function newAnswersHere() {
    if (!facts) return []
    // A question Autofill already keeps (whatever its answer: the person may have edited it there) is not offered again.
    const saved = new Set((Array.isArray(facts.saved_answers) ? facts.saved_answers : []).map((s) => String(s.q).replace(/\s+/g, " ").trim().toLowerCase()))
    const out = []
    const seen = new Set()
    for (const f of fields()) {
      if (out.length >= 12) break
      if (!["text", "textarea", "number", "select", "radio", "choice", "combobox", "listbox"].includes(f.kind) || secretField(f) || siteChrome(elOf(f)) || !answered(f)) continue
      const question = (A.questionText ? A.questionText(f.label) : f.label).replace(/\s+/g, " ").trim().slice(0, 500)
      const answer = (["text", "textarea", "number"].includes(f.kind) ? String(f.el.value ?? "") : fieldValue(f)).replace(/\s+/g, " ").trim().slice(0, 1000)
      if (question.length < 8 || !answer || seen.has(question) || SENSITIVE.test(question)) continue
      // Contact details and what the profile already answers live in Autofill's own boxes; answers kept already are not asked again.
      if (factKey(answer)) continue
      let fromProfile = null
      try { fromProfile = A.answerText(f.label, facts) } catch { fromProfile = null }
      if (fromProfile || saved.has(question.toLowerCase()) || savedLike(question) || sent.has(`${question}\n${answer}`)) continue
      seen.add(question)
      out.push({ question, answer, long: f.kind === "textarea" || answer.length > 80 })
    }
    return out
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
      // Once the CV is in one box, another CV-sounding box (Ashby's "Autofill from resume" beside its "Resume") is not a gap: it
      // turned Broods' "ready" into "Answer the outlined questions" on finished Prosus and Bynder forms.
      if (f.kind === "file" && cv && !uploaded && isResumeAsk(`${f.label} ${f.el.name || ""} ${f.el.id || ""}`)) return true
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
      required: f.kind === "file" ? Boolean(cv && !uploaded && isResumeAsk(`${f.label} ${f.el.name || ""}`)) : f.kind !== "checkbox" && required(elOf(f), f.label),
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
      if (own?.href && own.href.split("#")[0] === pageHref().split("#")[0]) return false
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
  /** Labels already clicked with no page change. The next ask sets force_llm and skips these. */
  const agentFailedLabels = []
  const AGENT_ACTION_MAX = 3
  /** All "which button?" asks in one application, across pages (kept on the run): a hard stop, never minutes of the same question. */
  const AGENT_RUN_MAX = 12
  /** When stuck: rules first, then Broods (apply-stuck, then apply-roam) with exclude. Fresh budget per URL. */
  async function tryAgentClick(status, opts = {}) {
    if (pageHref() !== agentActionUrl) {
      agentActionUrl = pageHref()
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
    say(forceLlm ? "Asking Broods how to unblock this step…" : "Asking Odds how to reach the application form…", "filling")
    const before = `${pageHref()}|${textOf(document.querySelector("h1, h2")).slice(0, 80)}|${fields().map((f) => f.label).slice(0, 8).join("|")}`
    const res = await ask({
      type: "suggest-action",
      url: pageHref(),
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
        const b = new URL(pageHref())
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
    const after = `${pageHref()}|${textOf(document.querySelector("h1, h2")).slice(0, 80)}|${fields().map((f) => f.label).slice(0, 8).join("|")}`
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
    const here = pageHref().split("#")[0]
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
  // The only buttons Broods may not press: sending the application itself (the person's own Submit) and a captcha. Everything else on a page
  // (Create account, Register, Accept, Delete, Sign in…) is its call: it reads the page and chooses.
  // Test runs against real sites (made-up applicant) set this in storage so that no account is ever made there: Create account / Register / Sign up are refused.
  let noAccountClicks = false
  chrome.storage.local.get("oddsNoAccountClicks").then((v) => { noAccountClicks = v?.oddsNoAccountClicks === true }).catch(() => undefined)
  chrome.storage.onChanged.addListener((changes) => { if (changes.oddsNoAccountClicks) noAccountClicks = changes.oddsNoAccountClicks.newValue === true })
  const ACCOUNT_BUTTON = /\b(create (an |your )?account|register( now)?|sign[\s-]?up|registreren|account aanmaken)\b/i
  const DRIVE_DENY = /\b(submit( (my )?application)?|send (my |the )?application|verzend\w*( sollicitatie)?|versturen|absenden|soumettre|captcha)\b/i
  function finalSubmitControl(el) {
    const control=el.closest("button,input[type=submit]")
    if(!control || !control.form || String(control.type).toLowerCase() !== "submit") return false
    const label = controlLabel(control).trim()
    // A step forward named after the next step ("Next: Questions", "Continue to experience") is not the final Submit, unless it also
    // says submit / send / apply.
    if (/^(next|continue|volgende|verder|suivant|weiter|save and continue|go to step|back|previous|return to (the )?previous|vorige|terug)\b/i.test(label) && !/\b(submit|send|verzend\w*|versturen|apply|solliciteer\w*|absenden|envoyer)\b/i.test(label)) return false
    return !/^(next|continue|review|save and continue|volgende|verder|suivant|back|previous|reject all(?: cookies)?|deny all(?: cookies)?|necessary only|functional only)$/i.test(label)
  }
  /** Milliseconds from the start of this page's application to the first field Odds filled (reported with the run), and the page's start. */
  let startT0 = 0
  let firstFillMs = null
  const prefilledFields = new (class extends WeakMap { set(k, v) { if (startT0 && firstFillMs === null && String(v || "").trim()) firstFillMs = Math.round(performance.now() - startT0); return super.set(k, v) } })()
  /** While Odds itself fills or clicks (a prefill, a Broods command): the browser's own input/change events after a scripted checkbox
   * click are trusted, and must not read as the person filling in. */
  let oddsActing = 0, oddsActedAt = 0
  /**
   * A short log of every click on this page and who made it (Odds acting, the person, or the page itself), kept in this browser: the last 40,
   * newest last, on the saved logins page under "Activity log". It says what pressed a button such as a site's own "Delete All Data".
   */
  const clickAudit = (event) => {
    try {
      const el = event.target instanceof Element ? event.target.closest("button, a, input[type=button], input[type=submit], [role=button]") : null
      const label = el ? (controlLabel(el) || "").slice(0, 70) : ""
      if (!label) return
      const who = oddsActing > 0 || Date.now() - oddsActedAt < 400 ? "odds" : event.isTrusted ? "person" : "page"
      if (/delete|remove|verwijder|supprimer/i.test(label)) console.warn("[odds] click on a delete control:", who, label)
      chrome.storage.local.get("oddsClickLog").then(({ oddsClickLog = [] }) => {
        const next = [...oddsClickLog, { t: Date.now(), who, label, host: location.hostname }].slice(-40)
        return chrome.storage.local.set({ oddsClickLog: next })
      }).catch(() => undefined)
    } catch { /* never in the way of the page */ }
  }
  document.addEventListener("click", clickAudit, true)
  async function asOdds(work) {
    oddsActing++
    try { return await work() } finally { oddsActing--; oddsActedAt = Date.now() }
  }
  /** Which of the person's contact details Odds put in a field (first_name, email, cv…): read_page shows it so the server learns where it goes. */
  const prefilledKeys = new WeakMap()
  /** Every field is filled by Odds on its own at most once per page: a field the person (or Broods) emptied again stays theirs. */
  const prefillTried = new WeakSet()
  const PREFILL_CONTACT = /^(first name|given name|last name|family name|surname|full name|name|email|e-mail|email address|e-mail address|phone|phone number|mobile|mobile number|linkedin|linkedin url|linkedin profile|city|country|current location|location|voornaam|achternaam|telefoon)$/i
  // ---- Site recipes: field mappings Broods runs proved on this ATS/host (label pattern → which contact detail), replayed here so Broods'
  // first read_page already shows them filled. Structure only, from the server's validated playbook: never a value, answer or URL.
  let drivePlaybook = null
  /** The playbook request started with the page (answered from the local copy at once), shared with driveRecipes. */
  let earlyPlaybook = null
  /** Recipe replays not yet reported to the server ({lesson, ok}); the next drive-start or command result carries them. */
  let recipeAttempts = []
  /** The same rule as the server's fieldPattern: a label as lowercase words, or null when it holds anything else (a file name, an email). */
  const fieldPattern = (label) => {
    const text = String(label || "").toLowerCase().replace(/[*:✱★•]/g, " ").replace(/\((optional|required)\)/g, " ").replace(/\s+/g, " ").trim()
    return /^[a-z][a-z '&/()?,-]{0,47}$/.test(text) && text.split(" ").length <= 6 ? text : null
  }
  const patternOf = (f) => fieldPattern(A.questionText ? A.questionText(f.label) : f.label)
  /** Each canonical contact key, asked the way Autofill understands it. */
  const CONTACT_ASK = { first_name: "First name", last_name: "Last name", full_name: "Full name", email: "Email", phone: "Phone", linkedin: "LinkedIn", city: "City", country: "Country" }
  const factValue = (key) => (CONTACT_ASK[key] && facts ? A.answerText(CONTACT_ASK[key], facts) : null)
  const sameText = (a, b) => String(a || "").replace(/\s+/g, " ").trim().toLowerCase() === String(b || "").replace(/\s+/g, " ").trim().toLowerCase()
  /** Which of the person's own contact details a value is (only its key leaves the tab), or null. */
  function factKey(value) {
    const v = String(value || "").trim()
    if (!v) return null
    for (const key of ["full_name", "first_name", "last_name", "email", "linkedin", "city", "country"]) if (sameText(factValue(key), v)) return key
    const saved = factValue("phone"), digits = v.replace(/\D/g, "")
    const national = saved && A.nationalNumber ? A.nationalNumber(saved).replace(/\D/g, "") : ""
    return national.length >= 6 && digits.length >= 6 && digits.endsWith(national) ? "phone" : null
  }
  /** The contact value really sits in the box (a phone box that reformatted the number to another country does not count). */
  function keptValue(f, key, answer) {
    const kept = fieldValue(f)
    if (!answered(f) || !kept) return false
    if (key !== "phone") return true
    const want = A.nationalNumber ? A.nationalNumber(answer).replace(/\D/g, "") : answer.replace(/\D/g, "").slice(-8)
    return kept.replace(/\D/g, "").endsWith(want) && !(/^\s*\+/.test(kept) && kept.replace(/\D/g, "") === want)
  }
  /** A phone box with intl-tel-input's flag picker (.iti): choose the country by its dial code, then type the national number. */
  const DIAL = { 31: "nl", 32: "be", 33: "fr", 34: "es", 39: "it", 44: "gb", 49: "de", 351: "pt", 353: "ie", 1: "us", 7: "ru", 84: "vn", 62: "id", 86: "cn", 91: "in", 90: "tr", 48: "pl", 40: "ro", 30: "gr", 20: "eg", 55: "br", 52: "mx", 81: "jp", 82: "kr", 65: "sg", 60: "my", 63: "ph", 66: "th", 92: "pk", 234: "ng", 27: "za" }
  async function fillIti(f, answer) {
    const full = answer.replace(/[^\d+]/g, "")
    const code = [3, 2, 1].map((n) => full.slice(1, 1 + n)).find((c) => DIAL[c])
    const wrap = f.el.closest(".iti, .intl-tel-input")
    if (!code || !wrap) return null
    const iso = DIAL[code]
    const flag = wrap.querySelector(".iti__selected-country, .iti__selected-flag, .selected-flag, button[aria-haspopup], [role='combobox']")
    const already = wrap.querySelector(`.iti__flag.iti__${iso}, .iti__${iso}`) && (wrap.querySelector(".iti__selected-dial-code")?.textContent || `+${code}`).includes(`+${code}`)
    if (flag && !already) {
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) { flag.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 })); await sleep(30) }
      await sleep(250)
      const option = document.querySelector(`.iti__country[data-country-code="${iso}"], li[data-country-code="${iso}"], [data-dial-code="${code}"][role='option']`)
      if (option) {
        option.scrollIntoView?.({ block: "nearest" })
        for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) { option.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 })); await sleep(30) }
        await sleep(200)
      }
    }
    const national = full.slice(1 + code.length).replace(/^0+/, "")
    type(f.el, national)
    return { ok: true, expected: national, expectedOption: -1, expectedText: null }
  }
  async function fillContact(f, answer, besideCountry) {
    if (f.el?.closest?.(".iti, .intl-tel-input") && /^\+\d/.test(String(answer).replace(/\s/g, ""))) {
      const done = await fillIti(f, String(answer))
      if (done) return done
    }
    return f.widget === "typeahead" ? fillTypeahead(f, answer, besideCountry)
      : ["combobox", "listbox"].includes(f.kind) ? fillCombobox(f, answer)
      : ["select", "radio", "choice"].includes(f.kind) ? fillButtonChoice(f, answer)
      : fillPlainOrCard(f, answer, besideCountry)
  }
  /** The CV went in: the box holds it, or the site replaced the box with the attached file (Greenhouse, Lever). */
  const cvPlaced = (f) => answered(f) || (uploaded && (!f.el.isConnected || !shown(f.el)))
  async function replayMappings() {
    const recipes = (drivePlaybook?.recipes || []).filter((r) => r?.lesson?.kind === "mapping" && typeof r.lesson.label === "string" && r.confidence >= 0.55).slice(0, 12)
    if (!recipes.length) return false
    // A phone box beside a country picker still on International gets the full +31 number (countryPickerSet is false then).
    const besideCountry = countryPickerSet(fields())
    let uploadedNow = false
    for (const { lesson } of recipes) {
      // Counted the way read_page lists fields (no secrets, no site chrome), so nth means the same field the server learned.
      const same = fields().filter((f) => !secretField(f) && !siteChrome(elOf(f)) && patternOf(f) === lesson.label)
      const f = same[lesson.nth || 0]
      if (!f || prefillTried.has(elOf(f)) || answered(f) || f.kind === "checkbox") continue
      // The page must still look the way the recipe was learned: a file box for the CV, a text or choice box for contact details.
      if ((f.kind === "file") !== (lesson.method === "upload")) continue
      prefillTried.add(elOf(f))
      if (lesson.field === "cv") {
        // One CV per page: once it is in, a same-labelled box left over is another upload (Greenhouse swaps the CV box for its file name,
        // and the next "Attach" is the cover letter's).
        if (!cv || uploaded || /autofill|auto-fill|parse/i.test(f.label)) continue
        const ok = Boolean(await uploadCv(f, true)) && cvPlaced(f)
        if (ok) { prefilledFields.set(elOf(f), fieldValue(f)); prefilledKeys.set(elOf(f), "cv"); uploadedNow = true }
        recipeAttempts.push({ lesson, ok })
        continue
      }
      let answer = factValue(lesson.field)
      if (!answer) continue
      if (lesson.field === "phone" && !besideCountry) answer = answer.replace(/\s+/g, "")
      const result = await Promise.race([fillContact(f, answer, besideCountry).catch(() => ({ ok: false })), sleep(8000).then(() => ({ ok: false }))])
      await sleep(60)
      const ok = Boolean(result?.ok) && keptValue(f, lesson.field, answer)
      if (ok) { prefilledFields.set(elOf(f), fieldValue(f)); prefilledKeys.set(elOf(f), lesson.field) }
      recipeAttempts.push({ lesson, ok })
    }
    return uploadedNow
  }
  /** Consent, terms and privacy boxes a form requires: ticked, as the person chose consent yes in Odds. Never a cookie banner's box. */
  /** Lever's "…has my consent to retain my data for the purpose of considering me for employment": consent to keep the application. */
  const consentToKeep = (label) => /\b(consent|agree)\b/i.test(label) && /\b(my data|personal data|personal information|employment|retain)\b/i.test(label) && !/\b(gender|ethnic\w*|race|disabilit\w*|veteran|sexual|religio\w*|criminal)\b/i.test(label)
  async function tickRequiredConsents() {
    const dialog = openDialog()
    for (const box of document.querySelectorAll("input[type=checkbox], [role='checkbox']")) {
      const input = box.matches("input") ? box : null
      const on = () => (input ? input.checked : box.getAttribute("aria-checked") === "true")
      if (prefillTried.has(box) || on() || (dialog ? !dialog.contains(box) : siteChrome(box)) || box.closest(".odds-apply-bar")) continue
      const face = input ? (input.closest("label") || (input.id && document.querySelector(`label[for="${CSS.escape(input.id)}"]`)) || input.parentElement) : box
      if (!face || !shown(face)) continue
      const label = ((input ? labelOf(input) : "") || box.getAttribute("aria-label") || textOf(face)).replace(/\s+/g, " ").trim()
      const needed = Boolean(input?.required || box.getAttribute("aria-required") === "true" || /\*/.test(label))
      if (!needed || label.length > 500 || /cookies?/i.test(label) || !(A.isConsentCheckbox?.(label) || consentToKeep(label))) continue
      prefillTried.add(box)
      ;(face !== box ? face : box).click()
      await sleep(60)
      if (!on()) box.click()
      await sleep(40)
    }
  }
  const drivePrefill = () => asOdds(drivePrefillNow)
  /** Required dropdowns that draw their choices only when opened (Greenhouse's Yes/No questions): opened once, so read_page lists their
   * choices and Broods answers them in its first fill instead of an options call per question. */
  // At most 4 s per read in all, and a dropdown that did not open in time is not tried again on the next read: a page of fifteen slow
  // dropdowns (IMC) must never keep the tab from answering its next step (the server stops waiting after 25 s).
  const choicesTried = new WeakSet()
  async function listRequiredChoices() {
    const started = Date.now()
    for (const f of fields()) {
      if (Date.now() - started > 4000) break
      if (!["combobox", "listbox"].includes(f.kind) || f.options?.length || dropdownChoices.has(f.el) || choicesTried.has(f.el) || answered(f) || secretField(f) || siteChrome(elOf(f))) continue
      if (!required(elOf(f), f.label) || listed(elOf(f)).texts.length) continue
      choicesTried.add(f.el)
      await Promise.race([readChoices(f).catch(() => null), sleep(1200)])
    }
  }
  async function drivePrefillNow() {
    globalThis.oddsDismissCookies?.()
    if (openDialog() || blockingCaptcha()) return
    let uploadedNow = await replayMappings()
    await prefillContacts()
    await tickRequiredConsents()
    await listRequiredChoices()
    // The CV goes last: some sites (Lever) read an uploaded CV and clear or hide name/email while they do. Wait for that, then fill
    // again whatever it emptied — Broods must never see a contact field missing or be told the form is done when it is not.
    for (const f of fields()) {
      if (f.kind !== "file" || answered(f) || prefillTried.has(elOf(f))) continue
      const label = (A.questionText ? A.questionText(f.label) : f.label).replace(/[*:✱★•]/g, "").trim()
      // Ashby's "Autofill from resume" rewrites the form from the file: the CV goes into the Resume box itself.
      if (!cv || !isResumeAsk(label) || /autofill|auto-fill|parse/i.test(label)) continue
      prefillTried.add(elOf(f))
      if (await uploadCv(f)) { prefilledFields.set(elOf(f), fieldValue(f)); prefilledKeys.set(elOf(f), "cv"); uploadedNow = true }
    }
    if (uploadedNow) {
      await sleep(2500)
      await prefillContacts(true)
    }
    await prefillByRules()
  }
  /**
   * Every other empty question the built-in rules answer from the person's facts (education, yes/no eligibility, how they heard,
   * location, dates...), filled the way Broods' own fill does, once per field. Broods then only sees what is left.
   */
  const ruleTried = new WeakSet()
  /**
   * Questions with an answer that never needs the person, on any site: a demographic survey question (ethnicity, gender identity,
   * disability, veteran, orientation…) gets the site's own "prefer not to say" / "decline" option; a question asking consent to process
   * data gets its yes (the person chose consent yes in Odds). Only from the site's own options, never typed text.
   */
  const SENSITIVE = /\b(ethnic|race|racial|background|gender identity|gender|pronoun|sexual|orientation|lgbt|disab|veteran|religio|neurodiver|socio-?economic|first.generation|caring responsib)/i
  const DECLINE = /prefer not|rather not|decline|don.?t wish|do not wish|not to (say|disclose|answer|self.identify)|choose not|wil ik niet|zeg ik liever niet/i
  const CONSENT_Q = /\b(consent|toestemming|agree to (the )?(processing|use)|process(ing)? (of )?(my )?(personal )?data)\b/i
  // Willingness and commitment ("Can you commit to 6 months from 1 February?", "36-40 hours", "3 days in the office", "open to relocate"):
  // the person's own choice to make, and "No" only filters them out. Yes, unless they saved another answer for it.
  const COMMIT_Q = /\b((can|could|would|will|are) you (commit|be available|available|willing|able to (work|start|commit|relocate|travel))|commit to|open to (relocat\w*|travel\w*|work\w*)|willing to (relocate|travel|work)|bereid|beschikbaar)\b/i
  /**
   * The person's own saved answer to this same question (asked before in Odds, on any job), word for word. Matched on the question's
   * words, newest answer first; a choice takes the option that answer names. Never reworded, never added to.
   */
  function savedAnswerFor(f) {
    const saved = Array.isArray(facts?.saved_answers) ? facts.saved_answers : []
    if (!saved.length) return null
    const words = (t) => new Set(String(t).toLowerCase().replace(/[^a-z0-9à-ÿ ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !/^(the|and|you|your|for|are|with|this|that|our|will|have|from|what|which)$/.test(w)))
    const want = words(A.questionText ? A.questionText(f.label) : f.label)
    if (want.size < 3) return null
    let best = null, score = 0
    for (const s of saved) {
      const have = words(s.q)
      const hit = [...want].filter((w) => have.has(w)).length / Math.max(want.size, have.size)
      if (hit > score) { score = hit; best = s }
    }
    if (!best || score < 0.75) return null
    const answer = String(best.a).trim()
    if (["select", "radio", "choice", "combobox", "listbox"].includes(f.kind)) {
      const options = (f.options || []).map(String)
      const i = A.chooseOption ? A.chooseOption(options, answer, f.label) : -1
      return i >= 0 ? options[i] : null
    }
    return answer
  }
  async function declineOrConsent(f) {
    if (!["select", "radio", "choice", "combobox", "listbox"].includes(f.kind)) return null
    const options = ((await readChoices(f).catch(() => null)) || f.options || []).map(String)
    if (SENSITIVE.test(f.label)) return options.find((o) => DECLINE.test(o)) || null
    if (CONSENT_Q.test(f.label)) return options.find((o) => /^(yes|ja|i (agree|consent|give))/i.test(o.trim())) || null
    if (COMMIT_Q.test(f.label) && !/\b(salary|visa|sponsor|permit|right to work|authori[sz]ed)\b/i.test(f.label)) return options.find((o) => /^(yes|ja|oui|i can|absolutely)\b/i.test(o.trim())) || null
    return null
  }
  async function prefillByRules() {
    if (!facts || typeof A.answerText !== "function") return
    drivePage()
    const todo = []
    for (const [id, f] of driveFields) {
      const el = elOf(f)
      if (!el?.isConnected || ruleTried.has(el) || answered(f) || secretField(f) || f.kind === "file" || f.kind === "checkbox") continue
      ruleTried.add(el)
      let answer = null
      try { answer = A.answerText(f.label, facts) } catch { answer = null }
      let lock = false
      if (!answer) { answer = savedAnswerFor(f); lock = Boolean(answer) }
      // Consent and "prefer not to say" are fixed; a commitment "Yes" is only a default Broods may correct from the facts.
      if (!answer) { answer = await declineOrConsent(f); lock = Boolean(answer) && !COMMIT_Q.test(f.label) }
      if (typeof answer === "string" && answer.trim()) todo.push({ id, value: answer.trim(), ...(lock ? { lock: true } : {}) })
    }
    // A demographic question asked as a group of checkboxes ("multiple choice allowed"): tick only its "prefer not to say" box.
    for (const [id, f] of driveFields) {
      const el = elOf(f)
      if (f.kind !== "checkbox" || !el?.isConnected || ruleTried.has(el) || answered(f)) continue
      const group = groupOf(el) || ""
      if (SENSITIVE.test(group) && DECLINE.test(f.label)) { ruleTried.add(el); todo.push({ id, value: "yes" }) }
    }
    if (!todo.length) return
    const res = await driveCommandRaw({ tool: "fill", args: { fields: todo.slice(0, 40) } }, async () => {}).catch(() => null)
    for (const r of res?.results || []) {
      const f = driveFields.get(r.id)
      if (r.ok && f) {
        prefilledFields.set(elOf(f), fieldValue(f)); const k = factKey(fieldValue(f)); if (k) prefilledKeys.set(elOf(f), k)
        if (todo.find((t) => t.id === r.id)?.lock) lockedByOdds.set(elOf(f), fieldValue(f))
      }
    }
  }
  /** Odds' own fill finished the step: every required question filled, the CV in, only the person's Submit left (no Next, no wall). */
  function onlySubmitLeft() {
    const page = drivePage()
    if (!page || page.captcha || page.dialog || page.closed) return false
    const fieldsLeft = (page.fields || []).filter((f) => f.required && !f.filled)
    if (fieldsLeft.length || (page.errors || []).length) return false
    const buttons = page.buttons || []
    const submit = buttons.some((b) => b.blocked && /submit|send|apply|verstuur|verzend|solliciteer/i.test(b.text))
    const onward = buttons.some((b) => !b.blocked && /^(next|continue|review|volgende|verder|save and continue|doorgaan)\b/i.test(b.text))
    return submit && !onward && (page.fields || []).length >= 3
  }
  /** again: after a CV upload, refill contact boxes the site's own CV reader emptied (they were filled once already). */
  async function prefillContacts(again = false) {
    const country = fields().some(f => /country code|landcode/i.test(f.label))
    for (const f of fields()) {
      if (answered(f) || secretField(f) || f.kind === "checkbox" || f.kind === "file") continue
      if (prefillTried.has(elOf(f)) && !(again && prefilledFields.has(elOf(f)))) continue
      const label = (A.questionText ? A.questionText(f.label) : f.label).replace(/[*:✱★•]/g, "").trim()
      if (!PREFILL_CONTACT.test(label)) continue
      const answer = A.answerText(f.label, facts)
      if (!answer) continue
      prefillTried.add(elOf(f))
      const result = await fillContact(f, answer, country)
      if (result?.ok && answered(f)) { prefilledFields.set(elOf(f), fieldValue(f)); prefilledKeys.set(elOf(f), factKey(fieldValue(f))) }
    }
  }
  const driveFieldIds = new WeakMap(), driveButtonIds = new WeakMap()
  let driveFieldSeq=0,driveButtonSeq=0
  let driveFields = new Map()
  let driveButtons = new Map()
  /** The choices of a dropdown that refused an answer, so Broods answers with one of them word for word (empty when it has none to show). */
  const failedChoices = (f) => {
    if (!["combobox", "listbox", "select"].includes(f.kind)) return null
    const list = (f.options?.length ? f.options : seenOptions.get(elOf(f)) || dropdownChoices.get(elOf(f)) || []).filter((o) => o && !PLACEHOLDER.test(o))
    return list.length ? list.slice(0, 40).map((o) => String(o).slice(0, 80)) : null
  }
  const fieldValue = (f) => {
    try {
      if (f.kind === "radio") return f.options?.[f.el.findIndex((r) => r.checked)] ?? ""
      if (f.kind === "choice") return f.options?.[f.el.findIndex(pressed)] ?? ""
      if (f.kind === "select") return f.options?.[f.el.selectedIndex] ?? ""
      if (f.kind === "combobox") return comboValue(f.el)
      if (f.kind === "listbox") return PLACEHOLDER.test(textOf(f.el)) ? "" : textOf(f.el)
      if (f.kind === "checkbox") return elOf(f).checked ? "checked" : ""
      if (f.kind === "file") return elOf(f).files?.length ? elOf(f).files[0].name : ""
      // Lever Current location: the pick is the hidden field, not whatever was typed into the search box.
      if (f.el?.id === "location-input" || f.el?.name === "location") {
        const sel = document.getElementById("selected-location")
        if (sel?.value) {
          try { const parsed = JSON.parse(sel.value); if (parsed?.name) return String(parsed.name).slice(0, 300) } catch { return String(sel.value).slice(0, 300) }
        }
      }
      return String(f.el.value ?? "").slice(0, 300)
    } catch { return "" }
  }
  /** The site itself rejected the value (aria-invalid, or a pattern/type the box says is wrong). */
  function fieldInvalid(f) {
    const nodes = (Array.isArray(f.el) ? f.el : [f.el]).filter(Boolean)
    if (nodes.some((n) => n.getAttribute?.("aria-invalid") === "true")) return true
    const el = nodes[0]
    if (el?.willValidate && el.value && el.validity && !el.validity.valid && !el.validity.valueMissing) return true
    const control = el?.closest?.("[class*='control' i]")
    return Boolean(control && control !== el && control.getAttribute("aria-invalid") === "true")
  }
  /**
   * The value is really kept: the visible choice (text, selected option, pressed button, chip, single-value),
   * and the site has not marked it invalid. A search box that only holds the typed query does not count.
   */
  function valueKept(f, value) {
    if (fieldInvalid(f) || !answered(f)) return false
    const shown = fieldValue(f)
    if (!shown) return false
    const want = String(value ?? "").replace(/\s+/g, " ").trim()
    if (!want) return true
    if (sameText(shown, want)) return true
    if (["choice", "radio", "select", "listbox", "combobox"].includes(f.kind)) {
      const opts = (f.options || []).map(String)
      const i = typeof A.chooseOption === "function" && opts.length ? A.chooseOption(opts, want, f.label) : -1
      if (i >= 0 && sameText(shown, opts[i])) return true
      if (["combobox", "listbox"].includes(f.kind)) {
        const parts = want.toLowerCase().split(",").map((s) => s.trim()).filter(Boolean)
        const got = shown.toLowerCase()
        if (parts[0] && parts[0].length >= 3 && (got === parts[0] || got.startsWith(`${parts[0]},`) || got.startsWith(`${parts[0]} `)) && parts.slice(1).every((p) => got.includes(p))) return true
      }
      return false
    }
    if (/\b(mobile|phone|telephone|telefoon\w*|mobiel\w*)\b/i.test(f.label || "")) {
      const wantD = want.replace(/\D/g, "")
      const gotD = shown.replace(/\D/g, "")
      if (wantD.length >= 6 && gotD.endsWith(wantD.slice(-Math.min(wantD.length, 8)))) return true
    }
    return false
  }
  /** Closest listed option to the answer: the rules' own match, else the option that names the same words. Never a loose first row. */
  function closestOption(texts, answer) {
    const list = (texts || []).map(String)
    const i = typeof A.chooseOption === "function" ? A.chooseOption(list, answer, "") : -1
    if (i >= 0) return i
    const head = String(answer || "").toLowerCase().split(",")[0].trim()
    if (head.length < 3) return -1
    const named = head.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(`(^|[^\\p{L}])${named}($|[^\\p{L}])`, "iu")
    return list.findIndex((t) => re.test(t.toLowerCase()))
  }
  const secretField = (f) => /password|wachtwoord|captcha|verification code|security code|social security|\bbsn\b|credit card/i.test(f.label) || elOf(f)?.type === "password"
  /** What Broods sees: the step's questions (id, label, kind, required, value, known choices), its buttons, errors, and any captcha/password wall. */
  /** An open pop-up (preferences, job alert, consent, sign-up prompt): when there is one, Broods sees only it — that is what blocks the page. */
  /** A cookie banner (cookieconsent's cc-window and the like) is not the pop-up the form waits behind: the form stays in view; its buttons are still listed. */
  const cookieBanner = (d) => /\bcc-window\b|cookie|consent-banner|onetrust|cookiebot|didomi|usercentrics/i.test(`${d.id} ${typeof d.className === "string" ? d.className : ""} ${d.getAttribute("aria-label") || ""}`) || (!d.querySelector("input:not([type=hidden]), textarea, select") && /\bcookies?\b/i.test(textOf(d).slice(0, 400)))
  // A pop-up only hides the page when it acts like one: marked modal, or covering a good part of the screen. A chat window in the corner
  // (PwC's chatbot), a cookie strip (Homerun's) or a toast is not in the way: treating it as the page hid the real Apply / Next buttons.
  const chatWidget = (d) => /\b(chat|chatbot|bot|messenger|intercom|drift|zendesk|livechat|tawk|hubspot-messages|assistant|virtual-agent)\b/i.test(`${d.id} ${typeof d.className === "string" ? d.className : ""} ${d.getAttribute("aria-label") || ""} ${d.getAttribute("title") || ""}`)
    || [...d.querySelectorAll("button, [role='button']")].some((b) => /chat(bot)?(venster)?\s*(sluiten|close)|close chat|end chat|minimi[sz]e chat/i.test(controlLabel(b)))
  const coversPage = (d) => { const r = d.getBoundingClientRect(); return r.width * r.height >= 0.3 * window.innerWidth * window.innerHeight }
  const cookieish = (d) => cookieBanner(d) || [...d.querySelectorAll("button, [role='button'], a")].some((b) => /cookie/i.test(controlLabel(b)))
  const openDialog = () => [...document.querySelectorAll("[role='dialog'], [role='alertdialog'], [aria-modal='true'], dialog[open]")].filter((d) => shown(d) && !d.closest(".odds-apply-bar") && textOf(d).length > 0 && !cookieish(d) && !chatWidget(d) && (d.getAttribute("aria-modal") === "true" || d.matches("dialog:modal") || coversPage(d))).pop() || null
  /** Site chrome (header search, menus, footer) is never part of the application. Not named "chrome": that would hide the extension API. */
  const siteChrome = (el) => {
    const hit = el.closest("header, nav, footer, [role='navigation'], [role='banner'], [role='contentinfo'], [role='search'], [class*='navbar' i], [class*='globalnav' i], [id*='footer' i], [class*='footer' i]")
    // A class on <html>/<body> ("footer-has-layout-footer" on TNO) or a wrapper holding the page's main content is not site chrome.
    if (!hit || hit === document.body || hit === document.documentElement || hit.querySelector("main, [role='main']")) return false
    // A footer or header inside the application form is the form's own (Homerun's "Next: Questions" sits in <form><footer>), as is
    // one holding form fields or a step's Next / Submit: never site chrome.
    if (hit.closest("form, [role='form']") || hit.querySelector("input:not([type=hidden]), textarea, select")) return false
    return true
  }
  /** On a job board's own search results (Glassdoor: /Vacature/vacatures.htm?…), not on a job. */
  const landedOnBoardSearch = () => /(^|\.)glassdoor\./i.test(location.hostname) && /\/(vacature|job|jobs|emploi|stellenangebote)\/[^/]*(vacatures|jobs|emplois|stellenangebote)\.htm/i.test(location.pathname)
  function missingJobPage() {
    const headings = [document.title, ...[...document.querySelectorAll("h1,h2")].filter(shown).map(textOf)]
    if (headings.some(text => /^(404(?:\b|\s)|page (?:was )?not found\b|pagina niet gevonden\b|we can.t find (?:this|that) page\b|(custom )?job error\b)/i.test(String(text || "").trim()))) return true
    // A listing that says it is over, in a heading or a notice near the top, and no form to fill (any site, English / Dutch / German).
    const over = /\b(no longer (available|active|accepting|open)|(job|position|vacancy|listing|posting) (has )?(expired|been filled|closed)|not accepting (new )?applications|applications? (are|is) closed|niet meer beschikbaar|vacature is (gesloten|vervuld)|nicht mehr verfügbar|stelle (ist )?(besetzt|nicht mehr))\b/i
    const notices = [...headings, ...[...document.querySelectorAll("[role='alert'], [class*='alert' i], [class*='notice' i], [class*='message' i], [class*='banner' i], main p")].filter(shown).slice(0, 12).map(textOf)]
    if (notices.some((t) => over.test(String(t || "").slice(0, 300))) && !document.querySelector("form input:not([type=hidden]):not([type=search]), form textarea")) return true
    // A job taken down on Workday: the job's address still loads, but only the empty "Careers" shell — no job header, no Apply.
    // (Only once the page has settled: 4 s after load, so a slow first paint is not read as closed.)
    // A Glassdoor job link that lands on Glassdoor's search results (/Vacature/vacatures.htm?…): the listing is gone, Glassdoor shows what else there is.
    if (/\/job-listing\//i.test(driveJobUrl || "") && landedOnBoardSearch()) return true
    // Workday's own words for a job that is gone (myworkdayjobs.com and myworkdaysite.com alike).
    if (/\.myworkday(jobs|site)\.com$/i.test(location.hostname) && /\/job\//.test(location.pathname) && /\bthe page you are looking for (doesn.t|does not) exist\b/i.test(textOf(document.body).slice(0, 3000))) return true
    if (/\.myworkday(jobs|site)\.com$/i.test(location.hostname) && /\/job\//.test(location.pathname) && performance.now() > 4000
      && !document.querySelector("[data-automation-id='jobPostingHeader'], [data-automation-id='jobPostingDescription'], [data-automation-id='adventureButton'], input:not([type=hidden])")
      && ![...document.querySelectorAll("a, button")].some((b) => shown(b) && /\b(apply|solliciteer)/i.test(controlLabel(b)))) return true
    return false
  }
  /** The question a checkbox answers when it is one choice of a group ("Work permit": "I am an EU citizen" / "I need sponsorship"...). */
  function groupOf(el) {
    const legend = el.closest("fieldset")?.querySelector("legend")
    if (legend && textOf(legend)) return textOf(legend)
    const g = el.closest("[role='group'], [role='radiogroup']")
    const by = g?.getAttribute("aria-labelledby")
    if (by && textOf(document.getElementById(by.split(" ")[0]))) return textOf(document.getElementById(by.split(" ")[0]))
    if (g?.getAttribute("aria-label")) return g.getAttribute("aria-label")
    // A box holding several checkboxes: the text that comes before its first one.
    let c = el.parentElement
    for (let i = 0; i < 6 && c; i++, c = c.parentElement) {
      const boxes = c.querySelectorAll("input[type=checkbox], [role='checkbox'], input[type=radio]")
      if (boxes.length < 2) continue
      const first = boxes[0]
      const q = [...c.querySelectorAll("legend, label, h1, h2, h3, h4, h5, h6, p, span, div")].find((n) => !n.querySelector("input, [role='checkbox']") && !n.closest("label")?.querySelector("input") && !/^(yes|no|ja|nee|oui|non)$/i.test(textOf(n)) && textOf(n).length > 8 && textOf(n).length < 300 && (n.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING))
      // The question may sit one level up, above the box of choices (bunq): keep climbing until text comes before the first choice.
      if (q) return textOf(q)
    }
    return ""
  }
  /** Whether a search / typeahead box holds typed text with its suggestion list still open (nothing chosen yet). */
  function comboTypedOnly(el) {
    if (!el || !el.matches?.("input") || !String(el.value || "").trim()) return false
    const combo = el.getAttribute("role") === "combobox" || el.hasAttribute("aria-autocomplete") || el.hasAttribute("aria-haspopup") || el.hasAttribute("list")
    if (!combo) return false
    if (el.getAttribute("aria-expanded") === "true") return true
    try { return Boolean(suggestionBelow(el, el.value)) } catch { return false }
  }
  /** The nearest heading above or around a file box ("Resume"): the section it belongs to. */
  function fileSection(el) {
    // The closest heading before the box in the page: the section it sits in.
    const heads = [...document.querySelectorAll("h1, h2, h3, h4, legend, [role=heading]")].filter((h) => (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) && !h.contains(el) && textOf(h).trim().length > 0)
    return heads.length ? textOf(heads[heads.length - 1]).trim().slice(0, 60) : ""
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
      // A search box (city, school…) whose suggestions are still open holds text that was typed, not a choice made: it is not filled.
      const typedOnly = comboTypedOnly(elOf(f))
      // The heading a file box sits under ("Resume", "Cover letter"): its own label is often only "10MB size limit".
      const section = f.kind === "file" ? fileSection(elOf(f)) : ""
      return { id, label: A.questionText ? A.questionText(f.label).slice(0, 300) : f.label.slice(0, 300), ...(section ? { section } : {}), ...(typedOnly ? { needs_choice: "suggestions are open: choose one of them" } : {}), kind: f.kind, required: required(elOf(f), f.label), filled: (answered(f) && !typedOnly && !fieldInvalid(f)) || (f.kind === "file" && (cvShownAt(elOf(f)) || (uploaded && prefilledKeys.get(elOf(f)) === "cv"))), ...(fieldInvalid(f) ? { invalid: true } : {}), ...(prefilledFields.has(elOf(f)) && prefilledFields.get(elOf(f)) === fieldValue(f) ? { by: "odds", ...(prefilledKeys.get(elOf(f)) ? { key: prefilledKeys.get(elOf(f)) } : {}) } : {}), value: fieldValue(f), ...((f.options?.length || ["combobox", "listbox"].includes(f.kind)) ? (() => { const all = f.options?.length ? f.options : listed(elOf(f)).texts; return all.length > 40 ? { options: all.slice(0, 25).map((o) => String(o).slice(0, 80)), options_total: all.length } : { options: all.map((o) => String(o).slice(0, 120)) } })() : {}), ...(consent ? { consent: true } : {}), ...(f.kind === "checkbox" && groupOf(elOf(f)) ? { group: groupOf(elOf(f)).slice(0, 200) } : {}), ...(charLimit(elOf(f)) ? { max_chars: charLimit(elOf(f)) } : {}) }
    })
    // Checkboxes drawn by the site (Oracle, Workday: the real input hidden, a styled box or role=checkbox shown) — fields() skips them.
    const seenBoxes = new Set(list.filter((f) => f.kind === "checkbox").map((f) => elOf(f)))
    for (const box of document.querySelectorAll("input[type=checkbox], [role='checkbox']")) {
      if (out.length >= 70 || seenBoxes.has(box) || !inScope(box)) continue
      // The hidden mirror of a button choice (Ashby yes/no): the buttons are the question, never this box.
      if (box.matches("input") && box.tabIndex < 0 && box.parentElement && [...box.parentElement.children].filter((c) => c.tagName === "BUTTON").length >= 2) continue
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
      out.push({ id, label: label.slice(0, 300), ...(groupOf(box) ? { group: groupOf(box).slice(0, 200) } : {}), kind: "checkbox", required: Boolean(input?.required || box.getAttribute("aria-required") === "true" || /\*/.test(label)), filled: checked, value: checked ? "checked" : "", ...(A.isConsentCheckbox?.(label) ? { consent: true } : {}) })
    }
    let b = 0
    const buttons = []
    // Apply controls always count and come first: job boards put "Apply on the employer's website" in the job's own <header>, and
    // a page full of links (Glassdoor's matches, ads) must never push them past the list's end.
    const APPLYISH = /\b(apply|solliciteer|solliciteren|bewerben|postuler|candidat|easy apply|quick apply)/i
    // Inside web components too (SmartRecruiters draws its form's buttons in shadow roots): fields were found there, its Continue and
    // Next never were, and Broods saw only "Apply with Indeed" and the privacy links.
    // Design-system buttons drawn as custom elements (<spl-button>, <x-button>) with the real button sealed inside: the host is the control.
    const custom = deepAll("*").filter((el) => /-button$/i.test(el.tagName) && !el.querySelector("button") && !el.shadowRoot?.querySelector("button"))
    const controls = [...deepAll("a, button, input[type=button], input[type=submit], [role='button']"), ...custom]
    const applyFirst = [...controls.filter((el) => APPLYISH.test(controlLabel(el))), ...controls.filter((el) => !APPLYISH.test(controlLabel(el)))]
    for (const el of applyFirst) {
      if (!shown(el) || b >= 60 || oddsOwn(el)) continue
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
      url: pageHref().slice(0, 500),
      title: document.title.slice(0, 200),
      headings: [...document.querySelectorAll("h1, h2, h3")].filter(shown).map(textOf).filter(Boolean).slice(0, 8).map((t) => t.slice(0, 160)),
      errors: deepAll('[role="alert"], .error, [aria-invalid="true"]').filter(shown).map(textOf).filter(Boolean).slice(0, 10).map((t) => t.slice(0, 200)),
      captcha: Boolean(blockingCaptcha()),
      // The person's CV is already attached on this page (the site may show it as a file name, not in a box): never upload it again.
      ...(uploaded ? { cv_attached: true } : {}),
      // The person has a CV and this page has a resume box nothing was put in (required or not): Broods is told, and cannot finish review before it is attached.
      ...(!uploaded && cv && list.some((f) => f.kind === "file" && isResumeAsk(`${f.label} ${fileSection(elOf(f))}`) && !cvShownAt(elOf(f))) ? { cv_missing: true } : {}),
      // A dialog is open over the page and only its contents are listed (fields and buttons): said plainly, so it is dealt with first.
      ...(dialog ? { dialog: { title: textOf(dialog.querySelector("h1, h2, h3, [class*='title' i], header") || dialog).slice(0, 120), text: textOf(dialog).slice(0, 300) } } : {}),
      password_field: [...document.querySelectorAll('input[type="password"]')].some(shown),
      ...(missingJobPage() ? { closed: true, closed_reason: "The job page was not found (404)." } : {}),
      ...(dialog ? { dialog: { title: textOf(dialog.querySelector("h1, h2, h3, [class*='title' i]")).slice(0, 160) || textOf(dialog).slice(0, 160), note: "A pop-up is open: these fields and buttons are only the pop-up's. Complete it (fill + continue) to get past it." } } : {}),
      fields: out,
      // A dropdown or list left open over the form (a phone-country list, a select menu): said plainly, so it is closed (Escape) before review.
      ...(() => {
        const menu = deepAll(".select__menu, [class*='select__menu'], [role='listbox'], .iti__country-list:not(.iti__hide), [class*='dropdown-menu'][class*='show']").find((m) => shown(m) && !oddsOwn(m) && m.getBoundingClientRect().height > 20)
        if (!menu) return {}
        const owner = menu.closest(".select__container, .select, [class*='field'], .iti, [class*='question']")
        return { open_list: (owner ? textOf(owner.querySelector("label, legend") || owner).slice(0, 80) : "a list") || "a list" }
      })(),
      // No form, and the page asks for applications by e-mail ("send your CV to jobs@…", a mailto link): the person's to send.
      ...(() => {
        if (out.filter((f) => f.kind !== "checkbox").length >= 2) return {}
        const text = textOf(document.querySelector("main, [role='main'], article") || document.body).slice(0, 20000)
        const mail = [...document.querySelectorAll("a[href^='mailto:']")].map((a) => a.getAttribute("href").slice(7).split("?")[0]).find((m) => /@/.test(m))
          || (/\b(appl\w*|send|mail|e-mail|email|cv|resume|motivation)\b[^.]{0,80}?([\w.+-]+@[\w-]+\.[\w.-]+)/i.exec(text) || [])[2]
        return mail && /\b(appl\w*|send|cv|resume|sollicit\w*|motivation)\b/i.test(text) ? { apply_email: mail.slice(0, 120) } : {}
      })(),
      buttons,
    }
  }

  // ---- Sight: when the page tools cannot see or move something, Broods looks at a screenshot and acts at a point. ----
  let driveImageSize = null
  async function driveVision(cmd, sendResult, denyText) {
    const args = cmd.args || {}
    if (cmd.tool === "screenshot") {
      const shot = await ask({ type: "drive-shot" }, 15000).catch(() => null)
      if (!shot?.image) return { error: shot?.error || "Could not take a screenshot of this tab.", ...(shot?.blank ? { blank: true, diag: shot.diag } : {}) }
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
      if (noAccountClicks && ACCOUNT_BUTTON.test(words)) return { ok: false, error: "No account is made in this test run." }
      if (target.matches("input[type=password]")) return { ok: false, error: "passwords are the person's" }
      await sendResult({ ok: true, clicked: words || target.tagName.toLowerCase(), note: "screenshot or read_page next" })
      // A real click where Broods looked (the site cannot tell it from a person's); Odds' own events only when that is not available.
      const real = window === top ? await realInput({ type: "real-input", op: "click", x, y }, 8000).catch(() => null) : null
      if (real?.ok) return null
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
      // Real typing into the focused box first (masks and search lists listen to real keys).
      if (window === top && (await realInput({ type: "real-input", op: "type", text, clear: !args.append }, 20000).catch(() => null))?.ok) {
        await sleep(120)
        return { ok: true, value: String(el.value ?? el.textContent ?? "").slice(0, 200), via: "real_input" }
      }
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
      if ((await realKey(key))?.ok) return { ok: true, via: "real_input" }
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
  /** Which ladder step a field's own handler is, when that first try already kept the value. */
  function primaryVia(f) {
    if (f.kind === "choice" || f.kind === "radio" || f.widget === "choice") return "choice"
    if (f.widget === "typeahead" || f.kind === "combobox") return "typeahead"
    if (f.kind === "listbox") return "listbox"
    return "plain"
  }
  /** Kept, including a country-code picker that shows only "+31" for "Netherlands +31". */
  function keptNow(f, value) {
    if (valueKept(f, value)) return true
    const stuck = fieldValue(f)
    if (!stuck || fieldInvalid(f)) return false
    if (/^\+\d{1,4}$/.test(stuck.trim()) && ["combobox", "listbox", "select"].includes(f.kind)) {
      const asked = String(value).toLowerCase().replace(/\s*\+\d+.*$/, "").trim()
      const option = (f.options || listed(elOf(f)).texts || []).find((o) => String(o).toLowerCase().startsWith(asked))
      if (asked && option && String(option).includes(stuck.trim())) return true
    }
    return false
  }
  /**
   * The value did not stick. Try, with no model call: the box's own format, key-by-key typing, a typeahead prefix,
   * a choice click, then keyboard. `via` is the step that kept the value. `tried` is every step that ran.
   */
  async function recoverFill(f, value, opts = {}) {
    const allowReal = opts.allowReal === true
    const fillStarted = opts.started || Date.now()
    const fieldStarted = Date.now()
    const timeOk = () => Date.now() - fillStarted < FILL_STEP_MS - 4000 && Date.now() - fieldStarted < 6000
    const tried = []
    const note = (step) => { if (step && !tried.includes(step)) tried.push(step) }
    const finish = (ok, via) => ({ ok, via: ok ? via : "", value: fieldValue(f), tried })
    note(primaryVia(f))
    if (keptNow(f, value)) return finish(true, primaryVia(f))
    let realTried = false
    const tryReal = async () => {
      if (realTried || !allowReal || !timeOk() || !String(value || "").trim() || secretField(f)) return false
      realTried = true
      note("real_input")
      if (!(await realRetry(f, value).catch(() => false))) return false
      return keptNow(f, value)
    }
    if (driveTactics[f.kind] === "real_input" && await tryReal()) return finish(true, "real_input")
    const textKind = ["text", "textarea", "date", "month", "number", "tel", "email"].includes(f.kind)
    if (!keptNow(f, value) && timeOk() && textKind && String(value || "").trim()) {
      let typedSame = false
      for (const alt of altShapes(elOf(f), value)) {
        if (!timeOk()) break
        if (alt === value) typedSame = true
        note("own_format")
        await typeLikePerson(elOf(f), alt)
        await sleep(80)
        if (keptNow(f, alt) || keptNow(f, value)) return finish(true, "own_format")
      }
      if (!typedSame && timeOk()) {
        note("typed")
        await typeLikePerson(elOf(f), value)
        await sleep(80)
        if (keptNow(f, value)) return finish(true, "typed")
      }
    }
    const search = f.kind === "combobox" || f.kind === "listbox" || f.widget === "typeahead"
    if (!keptNow(f, value) && timeOk() && search && elOf(f)?.tagName === "INPUT" && String(value || "").trim()) {
      const prefix = String(value).trim().split(/[\s,]/)[0].slice(0, 12)
      if (prefix.length >= 2) {
        note("typeahead")
        const input = elOf(f)
        typeInto(input, prefix)
        for (let waited = 0; waited < 1100 && timeOk(); waited += 100) {
          await sleep(100)
          const { options, texts } = listed(input)
          const i = closestOption(texts, value)
          if (i < 0) continue
          for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
            options[i].dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }))
          }
          await sleep(100)
          if (keptNow(f, value) || keptNow(f, texts[i])) return finish(true, "typeahead")
          break
        }
      }
    }
    if (!keptNow(f, value) && timeOk() && (f.kind === "choice" || f.kind === "radio")) {
      const i = typeof A.chooseOption === "function" ? A.chooseOption(f.options || [], value, f.label) : -1
      if (i >= 0) {
        note("choice")
        const target = f.kind === "radio" ? (f.el[i].closest("label") || f.el[i]) : f.el[i]
        for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
          target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }))
        }
        await sleep(80)
        if (keptNow(f, value)) return finish(true, "choice")
      }
    }
    if (!keptNow(f, value) && timeOk() && ["combobox", "listbox", "select", "choice", "radio"].includes(f.kind)) {
      note("keyboard")
      const el = elOf(f)
      try { el.focus?.() } catch { /* ignore */ }
      if (f.kind === "select") {
        const i = typeof A.chooseOption === "function" ? A.chooseOption(f.options || [], value, f.label) : -1
        if (i >= 0) {
          el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", keyCode: 40, bubbles: true }))
          el.selectedIndex = i
          el.dispatchEvent(new Event("input", { bubbles: true }))
          el.dispatchEvent(new Event("change", { bubbles: true }))
          el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }))
        }
      } else if (f.kind === "choice" || f.kind === "radio") {
        const i = typeof A.chooseOption === "function" ? A.chooseOption(f.options || [], value, f.label) : -1
        const target = i >= 0 ? (f.kind === "radio" ? f.el[i] : f.el[i]) : el
        try { target.focus?.() } catch { /* ignore */ }
        for (const key of ["ArrowDown", "Enter"]) {
          target.dispatchEvent(new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true }))
          target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }))
        }
      } else {
        for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
          el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }))
        }
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", keyCode: 40, bubbles: true }))
        await sleep(180)
        const { options, texts } = listed(el)
        const i = closestOption(texts, value)
        const hops = i >= 0 ? Math.min(i + 1, 8) : 3
        for (let n = 0; n < hops; n++) el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", keyCode: 40, bubbles: true }))
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }))
        if (i >= 0 && options[i]) {
          for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
            options[i].dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }))
          }
        }
      }
      await sleep(80)
      if (keptNow(f, value)) return finish(true, "keyboard")
    }
    if (await tryReal()) return finish(true, "real_input")
    return finish(false, "")
  }
  let soughtForwardFor = ""
  function hasForward(page) {
    return (page.buttons || []).some((b) => /^(next|continue|review|volgende|verder|save and continue|doorgaan)\b/i.test(String(b.text || "").trim()) || (b.blocked && /\b(submit|send|apply|verstuur|verzend|solliciteer)\b/i.test(String(b.text || ""))))
  }
  /** Required fields are filled and no Next/Continue/Review/Submit is on the page: scroll to the bottom once and read again. */
  async function maybeRevealForward(page) {
    const required = (page.fields || []).filter((f) => f.required && f.kind !== "file" && !f.consent)
    if (!required.length || required.some((f) => !f.filled) || hasForward(page) || page.dialog || page.captcha) return page
    const stamp = `${pageHref()}|${required.map((f) => f.label).join("|")}`
    if (soughtForwardFor === stamp) return page
    soughtForwardFor = stamp
    const root = document.scrollingElement || document.documentElement
    const top = Math.max(root.scrollHeight, document.body?.scrollHeight || 0)
    root.scrollTop = top
    try { window.scrollTo(0, top) } catch { /* ignore */ }
    window.dispatchEvent(new Event("scroll"))
    await sleep(300)
    const again = drivePage()
    again.scrolled_for_forward = true
    return again
  }
  /** One Broods command, done in this tab. Answers what happened; a click that leaves the page answers before it clicks. */
  async function driveCommandRaw(cmd, sendResult) {
    const args = cmd.args || {}
    // Fields that appeared since (Ashby's Application tab, the next step) get the person's contact details and recipes first, once each.
    if (cmd.tool === "read_page") {
      if (!args.review_check) await drivePrefill()
      // A form that rebuilds itself (a field appears, a country is chosen) can empty a contact box Odds filled: put it back before Broods reads, so it is never told a box is done that is empty.
      await prefillContacts(true)
      tickConsents() // (consents and an unanswered pronoun group: the neutral box, before Broods reads what is left)
      // The application's own privacy statement, open over the form: the page shows nothing but that box, and a form with a password and no
      // fields looks like an account wall to the server (the run ended there at Yamaha). Odds takes the consent, then Broods reads the form.
      if (acceptPrivacyStatement()) await sleep(800)
      const page = await maybeRevealForward(drivePage())
      // Like a person looking at the screen: a picture of the page goes with what read_page lists (not for the server's own quick checks).
      // Only when it can matter (it costs the model about 1,500 tokens): the first look at a page, a dialog, no fields, errors, an unchosen search
      // box, a CV box left empty, or the step before did not work. A page that reads cleanly after a step that worked needs no picture.
      const doubt = Boolean(page.dialog) || !(page.fields || []).length || (page.errors || []).length > 0 || (page.fields || []).some((f) => f.needs_choice) || page.cv_missing === true
        || page.url !== lastShotUrl || driveLastFailed
      if (!args.review_check && window === top && doubt) {
        lastShotUrl = page.url
        const shot = await ask({ type: "drive-shot" }, 8000).catch(() => null)
        if (shot?.image) { driveImageSize = { width: shot.width, height: shot.height, viewportWidth: shot.viewportWidth || innerWidth, viewportHeight: shot.viewportHeight || innerHeight }; return { ...page, screenshot: { image: shot.image, width: shot.width, height: shot.height } } }
        // No picture rather than a blank one; why it was blank stays on the step for the trace (the server never shows it to Broods).
        if (shot?.blank) return { ...page, screenshot: { blank: true, diag: shot.diag } }
      }
      return page
    }
    if (["screenshot", "click_at", "type_text", "press_key", "scroll"].includes(cmd.tool)) return driveVision(cmd, sendResult, DRIVE_DENY)
    if (cmd.tool === "options") {
      const f = driveFields.get(args.id)
      if (!f || !elOf(f)?.isConnected) return { error: "That field is gone. read_page again." }
      return { id: args.id, options: (await readChoices(f)) || f.options || [] }
    }
    if (cmd.tool === "fill") {
      // Quick boxes first, dropdowns last: one slow dropdown (seconds each) must not leave the text boxes and ticks "not tried".
      const slow = (it) => (driveFields.get(it?.id)?.kind === "combobox" ? 1 : 0)
      const items = (Array.isArray(args.fields) ? args.fields.slice(0, 40) : []).map((it, i) => ({ it, i })).sort((a, b) => slow(a.it) - slow(b.it) || a.i - b.i).map(({ it }) => it)
      const results = []
      const sigBefore = `${pageHref()}|${[...driveFields.values()].map((f) => `${f.label}:${fieldValue(f)}`).join("|")}`
      const besideCountry = countryPickerSet([...driveFields.values()])
      // Fallbacks (other shapes, real input) are worth a few seconds per field, never the whole step: Broods must get its answer in time.
      const fillStarted = Date.now()
      for (const it of items) {
        const f = driveFields.get(it?.id)
        let value = typeof it?.value === "string" ? it.value.slice(0, 2000) : ""
        if (!f || !elOf(f)?.isConnected) { results.push({ id: it?.id, ok: false, error: "field gone, read_page again" }); continue }
        // The person's own saved answer (or a fixed rule: consent, decline) that Odds put here stays as it is.
        if (!it?.lock && lockedByOdds.has(elOf(f)) && lockedByOdds.get(elOf(f)) === fieldValue(f) && value.trim() !== fieldValue(f)) {
          results.push({ id: it.id, ok: true, value: fieldValue(f), note: "kept: this is the person's own saved answer (or Odds' consent / decline rule); never change it" })
          continue
        }
        // The step answers within ~40 s whatever happens (the server waits 45 s for a fill): fields left over are said to be left over.
        // A dropdown that would get only a few seconds is left "not tried" (the server sends it again in a fresh step) rather than
        // failed in 2 s with no fallback (the last dropdown on GenScript and IMC always lost this way).
        if (Date.now() - fillStarted > FILL_STEP_MS || (["combobox", "listbox"].includes(f.kind) && FILL_STEP_MS - 4000 - (Date.now() - fillStarted) < 4000)) { results.push({ id: it.id, ok: false, error: "not tried: out of time in this step; fill it again in a new fill call" }); continue }
        // Longer than the box takes: cut at a whole sentence here (the site would cut mid-word) and say so, so Broods can rewrite if needed.
        const limit = charLimit(elOf(f))
        const shortened = limit && value.length > limit ? value.length : 0
        if (shortened) value = fitTo(limit, value)
        // The person's own number written the local way (0612345678) into a phone box that reads numbers itself (no country picked):
        // give it the full saved +31 number, or the box takes 06… / 61… as another country's.
        const PHONE_LABEL = /\b(mobile|phone|telephone|telefoon\w*|mobiel\w*)\b/i
        const saved = String(facts?.phone || facts?.answers?.phone || "")
        if (PHONE_LABEL.test(f.label) && !besideCountry && !/^\s*(\+|00)/.test(value)) {
          if (/^\s*\+/.test(saved) && A.nationalNumber && A.nationalNumber(saved).replace(/\D/g, "") === A.nationalNumber(value).replace(/\D/g, "")) value = saved.replace(/\s+/g, "")
          // A Dutch mobile written the local way (06 1234 5678, or saved without +31): +31 6…, never read as another country's code.
          else if (/^0?6\d{8}$/.test(value.replace(/\D/g, ""))) value = `+31${value.replace(/\D/g, "").replace(/^0/, "")}`
        }
        if (secretField(f)) { results.push({ id: it.id, ok: false, error: "the person fills this one" }); continue }
        if (f.kind === "file") { results.push({ id: it.id, ok: false, error: "use upload_cv" }); continue }
        if (f.kind === "checkbox") {
          // Consent and terms boxes are ticked when Broods says yes (the person's choice in Odds: consent yes).
          // Broods may also send the option's own words ("Prefer not to say" for that very box): that is a yes for this box, any other text a no.
          const norm = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
          const want = /^(yes|true|check|checked|on|1)$/i.test(value.trim()) || (norm(value).length > 1 && !/^(no|false|off|0|unchecked|uncheck)$/i.test(value.trim()) && (norm(f.label).includes(norm(value)) || norm(value).includes(norm(f.label))))
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
          // One field never holds the step: 8 s at most, then Broods is told it failed and can try another way. Measured against the
          // whole fill step (FILL_STEP_MS): left at the old 19 s step, every dropdown after the first few got 2 s and no fallbacks.
          const left = Math.max(1500, Math.min(8000, FILL_STEP_MS - 4000 - (Date.now() - fillStarted)))
          result = await Promise.race([work, sleep(left).then(() => ({ ok: false, error: `the site did not take it within ${Math.round(left / 1000)} s` }))])
        } catch (e) { result = { ok: false, error: String(e?.message || e).slice(0, 120) } }
        await sleep(80)
        // The page is the judge: a fill that did not keep the visible value (or left aria-invalid) is a failure, then the ladder runs.
        // If the first widget path already kept the value, recoverFill short-circuits; otherwise it tries own_format / typed / typeahead / choice / keyboard / real_input.
        let recovered
        if (result.ok && valueKept(f, value)) {
          recovered = { ok: true, via: primaryVia(f), value: fieldValue(f), tried: [primaryVia(f)] }
        } else if (result.ok && ["combobox", "listbox"].includes(f.kind) && typeof result.expectedText === "string" && choiceShownNear(elOf(f), result.expectedText)) {
          recovered = { ok: true, via: primaryVia(f), value: String(result.expectedText), tried: [primaryVia(f)] }
        } else {
          recovered = await recoverFill(f, value, { allowReal: true, started: fillStarted })
        }
        let okDom = recovered.ok
        let via = recovered.via
        let stuck = recovered.value
        // A dropdown or search box can show the choice and drop it once focus moves on, because the widget never committed it
        // (SmartRecruiters' city cleared on the next fill, scroll or key while Odds said "kept"). Focus is moved away and the box read
        // again: a choice that is gone is not kept, and Broods is told so.
        let dropped = false
        if (okDom && ["combobox", "listbox"].includes(f.kind)) {
          const el = elOf(f)
          el.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true }))
          el.dispatchEvent(new Event("blur", { bubbles: true, composed: true }))
          try { el.blur?.() } catch { /* ignore */ }
          await sleep(500)
          const kept = () => valueKept(f, value) || (typeof result.expectedText === "string" && choiceShownNear(el, result.expectedText))
          if (!kept()) {
            // Once more the way a person does it: type, wait for the suggestions, and pick the matching one with a real click (widgets
            // that commit only on a trusted pick); else the recovery ladder. Then read again.
            let again = { ok: false, via: "" }
            typeInto(el, String(value).split(",")[0])
            for (let w = 0; w < 2500 && !listed(el).texts.length; w += 150) await sleep(150)
            const { options: sugg, texts: shown } = listed(el)
            const pick = shown.length ? (typeof A.chooseOption === "function" ? A.chooseOption(shown, value, f.label) : -1) : -1
            const at = pick >= 0 ? pick : shown.findIndex((t) => String(t).toLowerCase().includes(String(value).split(",")[0].trim().toLowerCase()))
            if (at >= 0 && await realClickEl(sugg[at]).catch(() => false)) { await sleep(300); again = { ok: true, via: "real_pick" } }
            if (!again.ok || !kept()) again = await recoverFill(f, value, { allowReal: true, started: Date.now() })
            el.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true }))
            try { el.blur?.() } catch { /* ignore */ }
            await sleep(500)
            if (again.ok && kept()) { via = again.via; stuck = fieldValue(f) }
            else { okDom = false; via = ""; stuck = fieldValue(f); dropped = true }
          }
        }
        const tried = recovered.tried
        // A phone box that reformats what it gets (a country picker in front): the digits Broods meant must still be there.
        let phoneError = ""
        if (okDom && /\b(mobile|phone|telephone|telefoon\w*|mobiel\w*)\b/i.test(f.label)) {
          const want = A.nationalNumber ? A.nationalNumber(value).replace(/\D/g, "") : value.replace(/\D/g, "").slice(-8)
          const full = /^\s*(\+|00)/.test(value) ? value.replace(/\D/g, "").replace(/^00/, "") : ""
          const got = stuck.replace(/\D/g, "")
          if ((want && !got.endsWith(want)) || (full && /^\s*\+/.test(stuck) && got !== full) || (!full && /^\s*\+/.test(stuck) && got === want)) { okDom = false; via = ""; phoneError = `the phone box changed it to "${stuck}": set the country code picker to the number's country first, then fill the number again` }
        }
        // A year alone in a box that wants month and year ("Van: MM/JJJJ" on PwC): Broods is told the shape, so its next fill has the month.
        if (!okDom && !phoneError && /^\s*(19|20)\d{2}\s*$/.test(value)) {
          const el = elOf(f)
          const hint = `${el?.getAttribute?.("placeholder") || ""} ${el?.getAttribute?.("pattern") || ""} ${stuck || ""} ${f.label}`
          if (/\b(mm|maand|month)\b|\d{2}\s*[/.-]\s*\d{4}|\b(van|tot|from|to|start|end)\b/i.test(hint)) phoneError = "this box wants month and year (MM/YYYY), not a year alone: fill it again with the month from the facts, e.g. 09/2022"
        }
        // A dropdown that would not take its choice: what it is made of (tags, roles, classes, a short outline; no typed values) goes with the
        // answer, so the next trace shows the widget and the fix can be made for it.
        let diag = null
        if (!okDom && ["combobox", "listbox"].includes(f.kind)) {
          try {
            const el = elOf(f)
            const wrap = el.closest("[class*='control' i], [class*='select' i], [class*='dropdown' i], [class*='combo' i], [class*='picker' i]") || el.parentElement
            const outline = (n, d = 0) => (d > 3 || !n || n.nodeType !== 1) ? "" : `<${n.tagName.toLowerCase()}${n.getAttribute("role") ? ` role=${n.getAttribute("role")}` : ""}${n.hasAttribute("aria-expanded") ? ` expanded=${n.getAttribute("aria-expanded")}` : ""}${typeof n.className === "string" && n.className ? ` .${n.className.split(/\s+/).slice(0, 3).join(".")}` : ""}>${[...n.children].slice(0, 5).map((c) => outline(c, d + 1)).join("")}`
            diag = { tag: el.tagName.toLowerCase(), role: el.getAttribute("role") || "", expanded: el.getAttribute("aria-expanded") || "", shows: String(wrap?.innerText || "").replace(/\s+/g, " ").slice(0, 80), outline: outline(wrap || el).slice(0, 500) }
          } catch { diag = null }
        }
        // Which contact detail it was (never the value): the server learns where this site wants it.
        const key = okDom ? factKey(value) : null
        const keptError = phoneError || (dropped ? "the box showed the choice but dropped it when focus moved on (the widget never committed it): open its list, type a few letters, then pick the suggestion itself (click it, or ArrowDown then Enter)" : fieldInvalid(f) ? "the site marked this value invalid" : "the site did not keep the value")
        results.push({ id: it.id, ok: okDom, value: stuck, ...(diag ? { diag } : {}), ...(key ? { key } : {}), ...(okDom && via ? { via } : {}), ...(tried?.length ? { tried } : {}), ...(shortened ? { note: `this box takes at most ${limit} characters: your ${shortened}-character answer was cut to its last whole sentence` } : {}), ...(okDom ? {} : { error: result.error ? `${keptError}; ${result.error}` : keptError, ...(failedChoices(f) ? { options: failedChoices(f) } : {}) }) })
      }
      const sigAfter = `${pageHref()}|${[...driveFields.values()].map((f) => `${f.label}:${fieldValue(f)}`).join("|")}`
      const unfilled = [...driveFields.entries()]
        .filter(([, f]) => required(elOf(f), f.label) && (!answered(f) || fieldInvalid(f)))
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
      // A CV button with no file field behind it: press it with the site's picker caught, then put the CV in the picker it made.
      const button = driveButtons.get(args.id)
      if (button && button.isConnected && !driveFields.get(args.id)) {
        if (!cv) return { ok: false, error: "no CV in Odds: finish needs_you" }
        const seen = new Set(deepAll("input[type=file]"))
        const armed = await ask({ type: "catch-file-picker" }, 5000).catch(() => null)
        if (!armed?.ok) return { ok: false, error: "could not catch this site's file picker" }
        button.click()
        let input = null
        for (let t = 0; t < 20 && !input; t++) {
          await sleep(100)
          input = document.querySelector("input[type=file][data-odds-picker]") || deepAll("input[type=file]").find((i) => !seen.has(i)) || null
        }
        if (!input) return { ok: false, error: "this button opened no file picker; attach the CV by sight or finish needs_you" }
        const ok = await uploadCv({ el: input, kind: "file", label: `CV ${controlLabel(button)}` }, true)
        const took = Boolean(ok) && Boolean(input.files?.length)
        return { ok: took, value: input.files?.[0]?.name || "", file_name: input.files?.[0]?.name || "", ...(!took && cvLoadError ? { error: `${cvLoadError} The person must fix this in Odds (Documents); finish needs_you reason other with these words.` } : {}) }
      }
      const f = driveFields.get(args.id)
      if (!f || f.kind !== "file" || !elOf(f)?.isConnected) return { ok: false, error: "not a file field (read_page again)" }
      if (uploaded) return { ok: false, cv_attached: true, error: "the CV is already attached on this page (by Odds); this box is another upload, e.g. a cover letter: leave it unless it asks for one" }
      // Broods chose this box for the CV ("Browse on your Device" on Picnic says nothing about a CV): its choice stands.
      const ok = await uploadCv(f, true)
      // A site that reads the CV and redraws the form empties boxes: wait for it, then put back what it wiped (Broods may finish without reading again).
      await pageSettled()
      await prefillContacts(true)
      const name = fieldValue(f) || (ok ? cv?.file_name || "CV attached" : "")
      return { ok: Boolean(ok), value: name, file_name: name, ...(!ok && cvLoadError ? { error: `${cvLoadError} The person must fix this in Odds (Documents); finish needs_you reason other with these words.` } : {}) }
    }
    if (cmd.tool === "upload_letter") {
      const f = driveFields.get(args.id)
      if (!f || f.kind !== "file" || !elOf(f)?.isConnected) return { ok: false, error: "not a file field (read_page again)" }
      // A letter Broods just wrote (write_letter) comes with the command; else the job's own letter from the kit.
      const doc = (typeof args.doc === "string" && args.doc) || letter?.id
      if (!doc) return { ok: false, error: "no cover letter for this job in Odds: call write_letter first" }
      const file = await ask({ type: "cv-file", doc }, 15000)
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
    if (cmd.tool === "check_email") {
      say("Checking your Gmail in the next tab…", "filling")
      const mail = await ask({ type: "drive-mail", from: String(args.from || "").slice(0, 80), subject: String(args.subject || "").slice(0, 80) }, 40000).catch(() => null)
      if (!mail || mail.error) return { ok: false, error: mail?.error || "Could not look in Gmail (is the person signed in to Gmail in this Chrome?)" }
      return { ok: true, ...mail }
    }
    if (cmd.tool === "open_link") {
      const url = String(args.url || "")
      if (!/^https:\/\//.test(url) || url.length > 2000) return { ok: false, error: "an https link is needed" }
      await sendResult({ ok: true, note: "opening the link; read_page next" })
      location.href = url
      return null
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
      // Back may stay in this document (a #section or ?apply=true step): then this page answers with itself. Only when the page really
      // goes does the result leave as it unloads (the message gets out; the next page's read follows).
      addEventListener("pagehide", () => { void sendResult({ ok: true, note: "went back one page; read_page next" }) }, { once: true })
      history.back()
      await sleep(1500)
      return { ok: true, note: "went back within this page", page: await drivePage() }
    }
    if (cmd.tool === "click") {
      const el = driveButtons.get(args.id)
      if (!el || !el.isConnected) return { ok: false, error: "button gone, read_page again" }
      const text = controlLabel(el)
      if (DRIVE_DENY.test(text) || finalSubmitControl(el)) return { ok: false, error: "Odds never presses this; it is the person's" }
      if (noAccountClicks && ACCOUNT_BUTTON.test(text)) return { ok: false, error: "No account is made in this test run: leave it to the person (finish needs_you, reason account)." }
      // Declining the application's own privacy statement ends the registration (Broods took it for a cookie banner's "reject"): it is
      // Accept that goes on, and Broods is told so.
      if (isPrivacyDecline(el)) {
        if (acceptPrivacyStatement()) return { ok: true, clicked: "Accept", note: "That was the application's privacy statement, not cookies: Odds pressed Accept (declining ends the registration). Read the page again." }
        return { ok: false, error: "That is the application's privacy statement, not a cookie banner: do not decline it. Press Accept." }
      }
      // Next/Review with empty required fields must not advance — leave Broods on needs_you instead of false Review.
      if (/^(next|continue|review|review your application|continue to next step)$/i.test(text.trim())) {
        const snap = drivePage()
        const empty = (snap.fields || []).filter((f) => f.required && !f.filled && !f.consent)
        if (empty.length) return { ok: false, error: `required fields still empty: ${empty.map((f) => f.label).join("; ").slice(0, 300)}`, unfilled: empty.map((f) => f.label).slice(0, 12), page: snap }
      }
      const before = pageHref()
      // Answer first: a click that loads another page ends this script, and the new page picks up the next command.
      await sendResult({ ok: true, clicked: text.slice(0, 100), note: "page may change; read_page next" })
      await ask({ type: "apply-follow" }).catch(() => null)
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      el.click()
      await sleep(pageHref() === before ? 900 : 200)
      return null
    }
    return { error: `Unknown tool ${cmd.tool}` }
  }
  /** The page address of the last screenshot sent, and whether the last command failed: a picture goes with the next read when either changes. */
  let lastShotUrl = ""
  let driveLastFailed = false
  async function driveCommand(cmd, sendResult) {
    let result = await asOdds(() => driveCommandRaw(cmd, sendResult))
    if (cmd.tool !== "read_page" && cmd.tool !== "screenshot") driveLastFailed = Boolean(result && (result.ok === false || result.error || (Array.isArray(result.results) && result.results.some((r) => r?.ok === false))))
    if (result && cmd.tool !== "read_page" && cmd.tool !== "screenshot") {
      await sleep(180)
      result = { ...result, page: drivePage() }
    }
    // Recipes replayed during the run go back with this result; the server judges them when the run ends.
    if (result && recipeAttempts.length) result = { ...result, recipe_attempts: recipeAttempts.splice(0) }
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
      attempts.push({ lesson: pending.lesson, ok: pageHref() !== pending.url && fields().length > 0 })
      await ask({ type: "drive-recipe", pending: null })
    }
    const reply = await (earlyPlaybook || ask({ type: "drive", op: "playbook", page: pageHref() }, 5000))
    drivePlaybook = reply?.playbook || drivePlaybook
    for (const recipe of (reply?.playbook?.recipes || []).slice(0, 3)) {
      const lesson = recipe.lesson
      if (recipe.confidence < 0.6 || recipe.successes < 5 || !["opener", "skip_dialog"].includes(lesson?.kind)) continue
      const dialog = openDialog()
      if ((lesson.kind === "skip_dialog" && !dialog) || (lesson.kind === "opener" && fields().some(f => /name|email|resume|cv/i.test(f.label)))) continue
      if (!/^(apply( now| for this job| on (company website|employer's website|the employer's website))?|easy apply|solliciteren|skip|not now|close|reject all|necessary only|functional only)$/i.test(lesson.button || "") || DRIVE_DENY.test(lesson.button)) continue
      const matches = [...(dialog || document).querySelectorAll("a,button,[role='button']")].filter(el => shown(el) && !el.disabled && !el.closest(".odds-apply-bar") && controlLabel(el).replace(/\s+/g, " ").trim().toLowerCase() === lesson.button.toLowerCase())
      // The same button twice on a page (Lever has Apply at the top and the bottom, Ashby a link around a button) is one button; different addresses are ambiguous.
      if (!matches.length || new Set(matches.map((el) => el.getAttribute("href") || "").filter(Boolean)).size > 1) { attempts.push({ lesson, ok: false }); continue }
      const before = pageHref(), beforeFields = fields().length
      await ask({ type: "drive-recipe", pending: { lesson, url: before, at: Date.now() } })
      await ask({ type: "apply-follow" })
      // A new document (the click loads another page) ends this script: the next page checks the recipe. A single-page site (Ashby) swaps its
      // content in place, so the script goes on here.
      let leaving = false
      addEventListener("pagehide", () => { leaving = true }, { once: true })
      matches[0].click()
      await sleep(600)
      if (leaving || (pageHref() !== before && !fields().length && document.readyState !== "complete")) return { navigating: true, attempts }
      for (let i = 0; i < 20 && lesson.kind === "opener" && fields().length <= beforeFields && !leaving; i++) await sleep(150)
      if (leaving) return { navigating: true, attempts }
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
      const page = new URL(pageHref())
      const hostOf = (h) => h.replace(/^www\./i, "").toLowerCase()
      const ih = hostOf(want.hostname), ph = hostOf(page.hostname)
      // Intended "link" that is not a job at all (Odds' own pages, Broods' dashboard): nothing to compare against.
      if (/(^|\.)(broods\.app|beeblast\.co|claude\.ai)$/i.test(ih)) return null
      if (!ih || !ph || ih === ph || ph.endsWith(`.${ih}`) || ih.endsWith(`.${ph}`)) return null
      const boards = /(greenhouse|lever\.co|ashbyhq|myworkdayjobs|workday|smartrecruiters|csod|cornerstoneondemand|eightfold|phenompeople|avature|pageuppeople|jobs\.sap|brassring|ukg|ultipro|recruitee|teamtailor|personio|indeed|glassdoor|linkedin|academictransfer|stepstone|monsterboard|nationalevacaturebank|werkzoeken|jobbird|workable|homerun|bamboohr|successfactors|oraclecloud|taleo|icims|jobvite|softgarden|join)\.|(^|\.)magnet\.me$/i
      if (boards.test(ih) || boards.test(ph)) return null
      return `The link opens a different job (${ph} instead of ${ih}). Not filling personal details.`
    } catch { return null }
  }
  async function driveLoop(intent) {
    driveJobUrl = String(intent.job || "")
    // "Fill with Odds": Broods fills the whole application from the page in front of the person, pressing Next itself, up to Submit.
    // If the person presses Next themselves after a page ended (review / waiting on them), the same run fills the page that follows.
    driveCopilot = intent.copilot === true
    copilotIntentSeen = true
    copilotHost?.remove()
    // A page Broods' own click led to (the employer's site handing over to its ATS on another domain: Henkel → csod.com) belongs to the
    // run already under way. The server checks every page Broods reads against the job's title and employer (jobIdentityMismatch);
    // stopping here silently would leave Broods waiting on a tab that never answers.
    const wrong = intent.driveRun ? null : wrongJobPage(driveJobUrl || pageHref())
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
    // The script filled what it knows; it never decides the form is done. Broods checks the filled page (and does what is left) before review.
    const snap = drivePage()
    const odds = { filled: (snap?.fields || []).filter((f) => f.by === "odds").length, left: (snap?.fields || []).filter((f) => f.required && !f.filled).length, only_submit_left: onlySubmitLeft(), first_fill_ms: firstFillMs }
    const start = await ask({ type: "drive", op: "start", copilot: intent.copilot === true, url: intent.job, page: pageHref(), run_id: intent.driveRun || null, odds_filled: odds, recipe_attempts: [...recipes.attempts, ...recipeAttempts.splice(0)] }, 30000).catch(() => null)
    const runId = start?.run_id
    // What this platform's past runs learned: field kinds that only took a value through real input go there first.
    driveTactics = start?.tactics && typeof start.tactics === "object" ? start.tactics : {}
    if (!runId) {
      say(start?.error ? `Broods could not start: ${start.error}` : "Broods could not start. Press Apply with Odds again.", "ask")
      return
    }
    let lostSince = 0
    let idleSince = 0
    let fresh = true
    // Ended for the person (captcha, sign-in, questions, a letter, stuck): Odds keeps watching the tab for 30 minutes and carries on by
    // itself once they handled it. Broods going quiet is decided by the server (retried once, then said), never by a silent timer here.
    let endedAt = 0
    let endedReason = ""
    let resumedFor = 0
    const person = watchPerson()
    for (let i = 0; i < 4000; i++) {
      // The form showed up in a frame after all (a career page that loads it late): the frame takes the run over, this page stops.
      if (window.top === window && (atsFrame() || blankFrameForm())) {
        if (blankFrameForm()) await ask({ type: "apply-frames" }, 8000).catch(() => null)
        say("Broods is applying in the form on this page…", "filling")
        return
      }
      // The person is filling in the form themselves: Broods waits (no step handed out) and picks up 20 s after they stop.
      if (!endedAt && Date.now() - person.at < PERSON_QUIET_MS) {
        idleSince = 0
        say("You're filling in — Broods waits, then carries on around what you entered.", "filling")
        await ask({ type: "drive", op: "next", run_id: runId, hold: true }, 15000).catch(() => null)
        await sleep(3000)
        continue
      }
      // The person pressed Apply / Fill with Odds again on a run that has ended (stuck, needs you): that press starts a fresh run, it never
      // sits behind the old one for the 30 minutes the tab is watched.
      if (endedAt && wantContinue) return
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
        idleSince = 0
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
        idleSince = 0
        if (!endedAt) {
          endedAt = Date.now()
          endedReason = next.reason || ""
          // One tab's word closes a job for everyone, so a board's own search page (Glassdoor sends a listing there for many reasons) is
          // never enough: the person is told, the posting is left as it is.
          if (next.reason === "closed" && !landedOnBoardSearch()) await ask({ type: "job-closed", url: driveJobUrl || pageHref() })
          const [text, state] = driveEndText(next)
          say(text, state)
        }
        // Fill with Odds: the person pressed Next after this page was filled → the same run fills the page that follows.
        if (driveCopilot && copilotNextAt > endedAt) {
          copilotNextAt = 0
          await sleep(1500)
          const ok = await ask({ type: "drive", op: "continue", run_id: runId }, 15000).catch(() => null)
          if (ok?.ok) { endedAt = 0; say("Filling the next page…", "filling"); continue }
        }
        // The tab stays watched while it is open (the tracker shows the run only then): 30 minutes waiting for the person, 3 hours at review.
        if (["submitted", "stopped", "failed"].includes(next.status) || next.reason === "closed" || Date.now() - endedAt > (next.status === "review" ? 10800000 : 1800000)) return
        await sleep(3000)
        continue
      }
      if (endedAt) { endedAt = 0; say("Broods is carrying on…", "filling") }
      if (next.command) {
        idleSince = 0
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
      } else {
        // The server answered and Broods sent nothing. Three minutes of that is a dead model, not a slow form (the server ends a hung turn at two).
        idleSince ||= Date.now()
        if (Date.now() - idleSince >= 180000) {
          say("Broods' model is unreachable. The fill stopped. Press Apply with Odds to try again.", "ask")
          return
        }
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
      // Odds' own real mouse and keyboard (Chrome's debugger) are trusted events too: never the person, even when a slow field is still
      // being typed after its fill step answered (it held Broods 20 s on IMC as "the person is typing").
      if (!e.isTrusted || Date.now() < realInputUntil || (e.type === "input" && (oddsActing > 0 || Date.now() - oddsActedAt < 400))) return
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
    if (/model is unreachable/i.test(m)) return [m, "ask"]
    if (next.status === "review") return [m || "Filled in by Broods. Check everything, then send it yourself.", "done"]
    if (next.status === "submitted") return ["You sent it.", "done"]
    if (next.status === "stopped") return [m || "Broods stopped. Continue from the tracker, or finish it yourself.", "ask"]
    const why = {
      captcha: "Captcha on the page — tick it and Broods carries on by itself.",
      account: "Sign in on this page (Odds never types passwords) — Broods carries on by itself after.",
      letter: "This application asks for a cover letter — add one for this job in Odds (Documents) and Broods carries on.",
      questions: "Broods needs your answers: fill them in here or answer in Odds, and it carries on.",
      closed: "This job is closed: it no longer takes applications.",
    }[next.reason] || ""
    const text = next.reason === "closed" ? why : [why, m].filter(Boolean).join(" ")
    return [next.status === "needs_you" ? (text || "Broods needs you for a step — open the tab.") : `Couldn't finish this one: ${text || "Odds stopped here."} Finish it in the tab, or press Apply with Odds to try again.`, "ask"]
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
  // Glassdoor and Indeed ask to "complete your preferences" after Apply ("Nu overslaan" / "Bijwerken"). Update leads to their own search page
  // (with the person's last search), so the application is lost: the pop-up is skipped, never filled in, by code, before anything else.
  const NUDGE_TEXT = /\b(voorkeuren|preferences|vacaturemeldingen|job alerts?|complete your profile|vul je profiel|profiel aan)\b/i
  const NUDGE_SKIP = /^(nu overslaan|overslaan|sla over|skip( for now)?|not now|maybe later|later|no,? thanks|nee,? bedankt)$/i
  let nudgeWatching = false
  function skipBoardNudge() {
    if (!boardName()) return false
    const dialog = openDialog()
    if (!dialog || !NUDGE_TEXT.test(textOf(dialog).slice(0, 600))) return false
    const skip = [...dialog.querySelectorAll("button, a, [role='button']")].find((b) => shown(b) && !b.disabled && NUDGE_SKIP.test(controlLabel(b)))
    if (!skip) return false
    skip.click()
    return true
  }
  function watchBoardNudges() {
    if (nudgeWatching || !boardName()) return
    nudgeWatching = true
    const until = Date.now() + 5 * 60_000
    const timer = setInterval(() => { if (Date.now() > until) clearInterval(timer); else skipBoardNudge() }, 600)
    // At the moment it appears, before anything else can press its other button.
    let soon = 0
    new MutationObserver(() => { if (Date.now() > until || soon) return; soon = window.setTimeout(() => { soon = 0; skipBoardNudge() }, 30) }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "hidden", "style", "class"] })
  }
  /** LinkedIn offsite often opens a NEW tab; intent is written a tick later — never silent-quit. */
  async function waitIntent(quiet = false) {
    for (let i = 0; i < 60; i++) {
      const { intent } = (await ask({ type: "apply-intent" })) || {}
      if (intent) { watchBoardNudges(); return intent }
      // Heartbeat so Odds never looks idle while the handoff catches up — only in a tab Odds was asked to apply in.
      if (!quiet && (i === 0 || i % 8 === 0)) say("Waiting for Odds to attach this application…", "filling")
      await sleep(100)
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
    const href = pageHref()
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

  /** First fill from the browser's own copies: contact details and the site's recipes only, on a form that is plainly this page's. The
   * full prefill (CV, consents, rule answers) follows with the fresh kit; a field filled here is never filled twice. */
  async function earlyFill(intent, cached) {
    if (window.top === window && (atsFrame() || blankFrameForm())) return
    if (fields().filter((f) => f.kind !== "checkbox").length < 3 || wrongJobPage(String(intent.job || pageHref()))) return
    // Another job's details never leak in: only the person's own contact facts are used, never the job-specific ones.
    facts = { ...(cached.facts || {}) }
    delete facts.job_id
    cv = cv || cached.cv
    // A host the browser has no copy for yet answers in a moment or not at all: the contact boxes need no recipe, so it is not waited for long.
    drivePlaybook = (await Promise.race([earlyPlaybook, sleep(400).then(() => null)]))?.playbook || null
    await asOdds(async () => {
      globalThis.oddsDismissCookies?.()
      if (openDialog() || blockingCaptcha()) return
      // Plain contact boxes first (instant); recipes then reach the fields the rules do not know, including slow dropdowns.
      await prefillContacts()
      await replayMappings()
    })
    // Does each field still hold its value after the page had a moment (a form that redraws its boxes when it finishes loading wipes them)?
    // The ones that lost it are given back to the full fill that follows; the time stamp starts again with the next field that holds.
    await sleep(400)
    let lost = 0
    for (const f of fields()) {
      const el = elOf(f)
      if (prefilledFields.has(el) && prefilledFields.get(el) && !answered(f) && f.kind !== "file") { prefilledFields.delete(el); prefillTried.delete(el); prefilledKeys.delete(el); lost++ }
    }
    if (lost && !fields().some((f) => prefilledFields.has(elOf(f)))) firstFillMs = null
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
    // The person's own application (pressed in the app or the panel, or this very tab): the Odds panel opens in the page by itself, since Chrome's
    // side panel needs a click. An application nobody is watching (queued from the phone, in the Odds window) shows nothing of the kind.
    if ((intent.foreground === true || intent.here === true || intent.copilot === true) && typeof autoOpenPanel === "function") {
      // The frame is inert while Odds fills, so it cannot take the keyboard: filling does not wait for it to load.
      autoOpenPanel()
    }
    // Everything the server is asked runs at once, and the first fill does not wait for any of it: it uses the copy of the person's details
    // kept in this browser and the site recipes kept for this host (both refreshed in the background).
    startT0 = performance.now()
    const cachedKit = ask({ type: "apply-kit", url: intent.job, cached: true }, 3000).catch(() => null)
    earlyPlaybook = ask({ type: "drive", op: "playbook", page: pageHref() }, 5000).catch(() => null)
    const kitAsked = (async () => {
      let kit = null
      // A slow or failed answer (the worker waking, the server busy) is asked again before anything is said; only "connect" means not connected.
      for (let t = 0; t < 3 && (!kit || kit.status === "error"); t++) {
        if (t) await sleep(600 * t)
        kit = await ask({ type: "apply-kit", url: intent.job }, 35000)
      }
      return kit
    })()
    // Every page this application loads is counted on the run (it survives reloads): the same page again and again, or too many pages, stops for good.
    const visitAsked = visitNoted ? null : ask({ type: "apply-hunt", op: "visit" }).catch(() => null)
    visitNoted = true
    const early = await cachedKit
    if (early?.status === "ok" && early.broods_drive === true && !intent.paused) await earlyFill(intent, early)
    const visit = await visitAsked
    if (visit?.stop) {
      say(visit.message, "ask")
      return
    }
    // The person went back (browser Back) or paused earlier: stay on their page, push nothing forward, say so in Odds.
    // (A register / sign-in page reached again by Back is not "the person went back a step": a site that sends the person back after a refused
    // or declined step puts the same account form on screen again, and Odds carries on with it.)
    if (!opts.forced && !accountKind() && (intent.paused || await cameBack())) {
      pauseForPerson()
      return
    }
    pausedByPerson = false
    const kit = await kitAsked
    if (kit?.status === "connect") return say("Connect odds (its icon in the toolbar) to have this form filled in.", "problem")
    if (!kit) return say("Odds could not load your details. Press Apply with Odds again.", "problem")
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
      await ask({type:"job-closed",url:intent.job || pageHref()})
      return
    }
    // Indeed / Glassdoor guest: tell the person to sign in — do not hang on Filling / Looking for Apply.
    if (!(await ensureBoardSignedIn())) return
    // Broods drives (switch on in Odds, the default): it reads this tab and applies from the person's profile and Autofill; the extension only acts.
    if (kit.broods_drive === true) {
      // An application form embedded from an ATS (Greenhouse, Lever... in an iframe): the frame drives, this page stays out (one driver per run).
      let embedded = atsFrame()
      // A career page that loads its form a moment later (Nebius' Greenhouse embed): wait for it before driving an empty page.
      for (let i = 0; !embedded && !blankFrameForm() && fields().filter((f) => f.kind !== "checkbox").length < 3 && i < 10; i++) {
        await sleep(150)
        embedded = atsFrame()
      }
      if (!embedded && blankFrameForm()) {
        await ask({ type: "apply-frames" }, 8000).catch(() => null)
        say("Broods is applying in the form on this page…", "filling")
        return
      }
      if (embedded) {
        // The form is another site's frame (SmartRecruiters, Workday, iCIMS...): the script is put into every frame of this tab, or nothing would fill it.
        await ask({ type: "apply-frames" }, 8000).catch(() => null)
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
        if (/secure\.indeed\.com|\/account\/|\/auth/i.test(pageHref())) return false
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
        const a = new URL(href, pageHref())
        const b = new URL(pageHref())
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
        url: pageHref(),
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
      const scan = await ask({ type: "suggest-scan", url: pageHref(), status, snapshot }, 45000).catch(() => null)
      if (scan?.stage === "captcha" && blockingCaptcha()) {
        say("Captcha on the page — open the tab when you can, then Odds continues.", "ask")
        return "human"
      }
      if (scan?.stage === "account") {
        say("Account or login required — open the tab and press Create account & Autofill (or Sign in) in the Odds panel.", "ask")
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
      say("Couldn't finish this one. Finish it in the tab, or press Apply with Odds to try again.", "ask")
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
        await ask({ type: "job-closed", url: intent.job || pageHref() }).catch(() => null)
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
      const pageSig = `${pageHref()}|${heading.slice(0, 120)}|${fields().map((f) => `${f.label}:${answered(f) ? 1 : 0}`).slice(0, 12).join("|")}|${pressed}|${sawApplicant}`
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
        const scanSig = `${pageHref()}|${heading.slice(0, 80)}`
        if (globalThis.__oddsScanSig === scanSig) {
          // Already confirmed this page — stop after assist (never silent loop).
          say("Couldn't finish this one. Finish it in the tab, or press Apply with Odds to try again.", "ask")
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
            : "Account or login required — open the tab and press Create account & Autofill (or Sign in) in the Odds panel.",
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
        if (passwords.length) say("This site needs an account. Press Create account & Autofill in the Odds panel. The rest is filled in.", "ask")
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
          say("Account or login required — open the tab and press Create account & Autofill (or Sign in) in the Odds panel.", "ask")
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
          // An application in this tab (Odds' own continue, or the intent below): board pop-ups that would lose it are skipped.
          if (forced) watchBoardNudges()
          if (!forced) {
            const { intent } = (await ask({ type: "apply-intent" })) || {}
            if (intent) watchBoardNudges()
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
    // The toolbar's Fill with Odds: only the top page answers (a form in a frame is filled from there).
    if (message?.type === "odds-fill-now" && window === top) { void fillWithOdds().then((ok) => reply({ ok })); return true }
    if (message?.type === "odds-new-answers" && window === top) { reply({ items: newAnswersHere(), job: applicationJob || driveJobUrl || location.href, review: bar?.dataset.state === "done" }); return }
    if (message?.type === "odds-answers-kept" && window === top && Array.isArray(message.questions)) {
      for (const q of message.questions) sent.add(`${q.question}\n${q.answer}`)
      if (facts && Array.isArray(facts.saved_answers)) facts.saved_answers.unshift(...message.questions.map((q) => ({ q: q.question, a: q.answer })))
      reply({ ok: true }); return
    }
  })
  launch(false)

  // ---- "Fill with Odds": a button on any application form the person brought up themselves (signed in, solved the captcha, pressed
  // Apply). One press: Odds' script fills the page, Broods checks it and does what is left, on this page only. The person presses Next;
  // the next page is filled the same way, and the tracker follows (Filling → Review & send → Applied on the site's thank-you).
  /** A form someone applies with: three or more fields with a contact detail or CV among them, or an ATS form in a frame. */
  function applicationFormHere() {
    if (window !== top) return false
    const list = fields().filter((f) => !secretField(f) && f.kind !== "checkbox" && !siteChrome(elOf(f)))
    if ([...document.querySelectorAll('input[type="password"]')].some(shown) && list.length < 4) return false
    const contact = list.some((f) => f.kind === "file" || /\b(name|naam|e-?mail|phone|telefoon|mobile|cv|resume|curriculum|linkedin)\b/i.test(f.label))
    return (list.length >= 3 && contact) || Boolean(atsFrame()) || Boolean(blankFrameForm())
  }
  function showCopilotButton() {
    if (copilotHost?.isConnected || !document.body) return
    copilotHost = document.createElement("div")
    copilotHost.className = "odds-fill-host"
    copilotHost.setAttribute("data-odds-bar", "")
    copilotHost.style.cssText = "position:fixed;right:20px;bottom:88px;z-index:2147483646;display:flex;align-items:center;gap:6px"
    const root = copilotHost.attachShadow({ mode: "open" })
    const mark = globalThis.oddsMascot?.mark("#EE7A2A") || ""
    root.innerHTML = `<style>
      .go{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 20px 0 8px;font:800 16px/1 "odds Inter Tight",system-ui,-apple-system,Segoe UI,sans-serif;background:#EE7A2A;color:#1C1A18;border:0;border-radius:999px;cursor:pointer}
      .go:hover{background:#F28B45} .go:disabled{opacity:.7;cursor:default}
      .go i{display:block;width:28px;height:28px}
      .x{font:600 13px/1 system-ui,sans-serif;background:#fff;color:#4E4842;border:1.5px solid #E7E1D8;border-radius:999px;width:28px;height:28px;cursor:pointer}
    </style><button class="go" type="button"><i>${mark}</i><span>Fill with Odds</span></button><button class="x" type="button" aria-label="Hide Fill with Odds">✕</button>`
    const go = root.querySelector(".go")
    go.addEventListener("click", async () => {
      const label = go.querySelector("span")
      go.disabled = true
      label.textContent = "Filling…"
      if (!(await fillWithOdds())) { go.disabled = false; label.textContent = "Fill with Odds" }
    })
    root.querySelector(".x").addEventListener("click", () => { copilotHost?.remove(); copilotDismissed = true })
    document.body.appendChild(copilotHost)
  }
  /** Fill with Odds (the page's button or the toolbar's): this tab becomes the application and Odds fills it to the end. */
  async function fillWithOdds() {
    const ok = await ask({ type: "copilot-start", url: pageHref(), title: document.title }, 8000).catch(() => null)
    if (!ok?.ok) return false
    copilotHost?.remove()
    copilotIntentSeen = true
    launch(true)
    return true
  }
  // ---- What the page in front is, for the side panel's one button (like Simplify): a job's page (Start application), an account to
  // make (Create account & Autofill), a sign-in (Sign in & Autofill), a captcha (tick it), or the application form (Autofill).
  const ACCOUNT_CREATE = /\b(create (an |your )?account|register|sign[\s-]?up|account aanmaken|registreren|konto erstellen|registrieren|créer un compte)\b/i
  const ACCOUNT_SIGNIN = /\b(sign[\s-]?in|log[\s-]?in|inloggen|anmelden|se connecter)\b/i
  const passwordBoxes = () => [...document.querySelectorAll("input[type=password]")].filter(shown)
  function accountKind() {
    const pw = passwordBoxes()
    if (!pw.length) return null
    if (pw.length >= 2) return "create_account"
    const heads = [...document.querySelectorAll("h1, h2, h3, legend, [role=heading]")].filter(shown).map((h) => textOf(h)).join(" ").slice(0, 400)
    const buttons = [...document.querySelectorAll("button, input[type=submit], [role=button]")].filter(shown).map((b) => controlLabel(b)).join(" | ")
    if (ACCOUNT_CREATE.test(heads) && !ACCOUNT_SIGNIN.test(heads)) return "create_account"
    if (ACCOUNT_SIGNIN.test(heads) || ACCOUNT_SIGNIN.test(buttons)) return "sign_in"
    return ACCOUNT_CREATE.test(buttons) ? "create_account" : "sign_in"
  }
  function pageKind() {
    if (window !== top) return null
    if (blockingCaptcha()) return "captcha"
    const account = accountKind()
    if (account) return account
    if (applicationFormHere()) return "form"
    if (applyButton()) return "job"
    return null
  }
  let lastKind = undefined
  function reportKind() {
    if (window !== top) return
    const kind = pageKind()
    if (kind === lastKind) return
    lastKind = kind
    // A form, an account step or a sign-in on screen: an earlier "this job is closed" (read while the page was still drawing) was wrong.
    if (["form", "create_account", "sign_in"].includes(kind) && bar && /no longer takes applications/i.test(bar.dataset.raw || "")) {
      globalThis.oddsMascot.clear()
      bar = null
      void ask({ type: "drop-closed" }).catch(() => null)
    }
    void ask({ type: "page-kind", kind }).catch(() => null)
  }
  /** The account's email box: an email input, or the one labelled email / username next to the password. */
  function accountEmailBox() {
    const boxes = [...document.querySelectorAll("input")].filter((el) => shown(el) && !el.disabled && !el.readOnly && !["password", "hidden", "checkbox", "radio", "submit", "button"].includes(el.type))
    return boxes.find((el) => el.type === "email" || /email|username/i.test(el.autocomplete || ""))
      || boxes.find((el) => /e-?mail|user\s*name|gebruikersnaam/i.test(`${labelOf(el)} ${el.name || ""} ${el.id || ""} ${el.getAttribute("data-automation-id") || ""}`))
      || null
  }
  /**
   * Create account & Autofill / Sign in & Autofill, pressed by the person in the side panel: their email, the password Odds made for this
   * site (kept in this Chrome only), the site's required agreement box on an account form, then the site's own Create account / Sign in.
   */
  async function fillAccount({ email, password, create, press = true }) {
    const box = accountEmailBox()
    if (box && email && box.value !== email) { type(box, email); if (box.value !== email) await realTypeEl(box, email) }
    for (const pw of passwordBoxes()) {
      if (pw.value === password) continue
      type(pw, password)
      if (pw.value !== password) await realTypeEl(pw, password)
    }
    if (create) {
      for (const c of [...document.querySelectorAll("input[type=checkbox]")].filter((c) => !c.checked && (c.required || c.getAttribute("aria-required") === "true" || /\b(agree|accept|terms|akkoord)\b/i.test(labelOf(c))))) {
        if (shown(c)) c.click()
        else c.closest("label")?.click()
      }
    }
    await sleep(300)
    const want = create ? ACCOUNT_CREATE : ACCOUNT_SIGNIN
    const pick = (list) => list.find((b) => shown(b) && !b.disabled && want.test(controlLabel(b)) && controlLabel(b).length < 40)
    const scope = passwordBoxes()[0]?.closest("form, [role=dialog], section, main") || document
    const go = password && press ? pick([...scope.querySelectorAll("button, input[type=submit], [role=button]")]) || pick([...document.querySelectorAll("button, input[type=submit], [role=button]")]) : null
    if (go && !(await realClickEl(go))) go.click()
    // The real click can land on something over the button (Odds' own panel opens by itself on an application): if the step is still
    // exactly there two seconds later, the button is pressed from the page too.
    else if (go) { await sleep(2000); if (!acceptPrivacyStatement() && go.isConnected && shown(go) && passwordBoxes().length && !document.querySelector("[role=dialog], [aria-modal=true], dialog[open]")) go.click() }
    if (go) for (let i = 0; i < 12; i++) { await sleep(500); if (acceptPrivacyStatement()) break }
    // A register form that also holds the rest of the application (SuccessFactors: Upload a Resume, then email and password on one page): the
    // account boxes are not the whole page, so the application is filled here too, now, not only after the account step is gone.
    if (create && fields().some((f) => f.kind === "file")) {
      const { intent } = (await ask({ type: "apply-intent" }).catch(() => null)) || {}
      if (intent) launch(true)
    }
    void carryOnAfterAccount()
    return { ok: true, pressed: Boolean(go) }
  }
  /** Whether this is the Decline / Reject of a privacy statement that belongs to the application (its text names no cookies). */
  function isPrivacyDecline(el) {
    if (!/^(decline|reject|disagree|weiger\w*|niet akkoord|refuse\w*)$/i.test(controlLabel(el).trim())) return false
    for (let e = el.parentElement, depth = 0; e && depth < 8; e = e.parentElement, depth++) {
      const text = textOf(e)
      if (text.length > 40000) break
      if (/\bcookies?\b/i.test(text.slice(0, 300))) return false
      if (/\b(privacy|data protection|gegevensbescherming|datenschutz)\b/i.test(text.slice(0, 600)) && /\b(statement|verklaring|erkl[aä]rung|policy)\b/i.test(text.slice(0, 600))) return true
    }
    return false
  }
  /**
   * A privacy / consent statement some sites open after Create account (Yamaha: "Data Privacy Consent Statement", Accept / Decline / Print): Odds
   * takes the consent the same way it ticks consent boxes (the person chose consent yes). Only a box whose text is about privacy or consent and
   * whose button reads plainly Accept / Agree; never "Accept all" on a cookie banner, never Decline.
   */
  function acceptPrivacyStatement() {
    const BTN = /^(i )?(accept|agree)$|^(ik )?(ga )?akkoord$|^accepteren$|^akzeptieren$|^j'accepte$/i
    for (const b of deepAll("button, input[type=button], input[type=submit], a[role=button], [role=button], a.btn")) {
      if (!shown(b) || b.disabled || !BTN.test(controlLabel(b).trim())) continue
      for (let e = b.parentElement, depth = 0; e && depth < 8; e = e.parentElement, depth++) {
        const text = textOf(e)
        if (text.length > 40000) break
        if (!/\b(privacy|data protection|consent|gegevensbescherming|datenschutz|toestemming)\b/i.test(text.slice(0, 600))) continue
        if (/\bcookies?\b/i.test(text.slice(0, 300))) break
        if (!e.querySelector("button, input[type=button], input[type=submit], a[role=button], [role=button], a.btn") || ![...e.querySelectorAll("button, input[type=button], input[type=submit], a[role=button], [role=button], a.btn")].some((o) => /^(decline|reject|disagree|weiger\w*|niet akkoord)$/i.test(controlLabel(o).trim()))) continue
        b.click()
        return true
      }
    }
    return false
  }
  /** Once the account step is gone (the site moved on, often without a page load: Workday), Odds fills what follows in this tab. */
  async function carryOnAfterAccount() {
    const end = Date.now() + 5 * 60_000
    while (Date.now() < end) {
      await sleep(1000)
      if (acceptPrivacyStatement()) continue
      if (passwordBoxes().length) continue
      await sleep(1500)
      if (passwordBoxes().length) continue
      const { intent } = (await ask({ type: "apply-intent" }).catch(() => null)) || {}
      if (intent) launch(true)
      return
    }
  }
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (window !== top) return
    if (message?.type === "odds-page-kind") { lastKind = pageKind(); reply({ kind: lastKind }); return }
    if (message?.type === "odds-account" && typeof message.password === "string") {
      void fillAccount({ email: String(message.email || ""), password: message.password, create: message.create === true, press: message.press !== false }).then(reply).catch(() => reply({ ok: false }))
      return true
    }
  })
  async function copilotCheck() {
    reportKind()
    if (copilotDismissed || copilotIntentSeen || window !== top || copilotHost?.isConnected || !applicationFormHere()) return
    const { intent } = (await ask({ type: "apply-intent" }).catch(() => null)) || {}
    // Odds is already applying in this tab (Apply with Odds, or Fill with Odds before): its bar is there, nothing more to offer.
    if (intent) { copilotIntentSeen = true; return }
    // The toolbar icon pulses "Fill": one click there fills this form (no button over the site's page).
    void ask({ type: "form-here", on: true }).catch(() => null)
    copilotHost = { isConnected: true, remove() { this.isConnected = false; void ask({ type: "form-here", on: false }).catch(() => null) } }
  }
  let copilotTimer = 0
  new MutationObserver(() => { window.clearTimeout(copilotTimer); copilotTimer = window.setTimeout(() => void copilotCheck(), 1200) })
    .observe(document.documentElement, { childList: true, subtree: true })
  window.setTimeout(() => void copilotCheck(), 1500)
  // The person's own Next on a page Odds filled: the same run fills the page that follows.
  document.addEventListener("click", (event) => {
    if (!event.isTrusted || !driveCopilot) return
    const b = event.target instanceof Element ? event.target.closest("button, a, input[type=button], input[type=submit], [role='button']") : null
    if (b && FORWARD_LABEL.test(controlLabel(b))) copilotNextAt = Date.now()
  }, true)
})()
