// Private form questions travel through Odds; only explicit answers come back. No submit action exists here.
;(() => {
  const cookieAttempts = new WeakSet()
  // The least a banner needs: never "accept", never "settings". Reject wordings in the languages of the sites odds meets, then a close button.
  // Minimal / reject only — never "Accept all". Includes Magnet.me "Functional only" (word order reversed).
  const REJECT = /^(reject( all| optional| non[- ]?essential| everything| additional)?( cookies)?|decline( all| optional| non[- ]?essential)?( cookies)?|deny( all)?( cookies)?|refuse( all)?( cookies)?|disagree|no,? thanks|no thank you|necessary( cookies)? only|functional( cookies)? only|only (necessary|essential|required|functional|strictly necessary)( cookies)?|(necessary|essential|required|functional|strictly necessary)( cookies)? only|(accept|allow|use|continue with) (only )?(necessary|essential|required|functional)( cookies)?( only)?|use necessary( cookies)?( only)?|continue without (accepting|agreeing|consent)|essential( cookies)? only|(alles|alle( cookies)?|optionele( cookies)?) (afwijzen|weigeren)|weiger(en)?( alles| alle cookies| optionele cookies)?|afwijzen|niet akkoord|alleen (noodzakelijke|essenti[eë]le|functionele|vereiste)( cookies)?|nur (notwendige|erforderliche|essenzielle)( cookies)?|alle ablehnen|ablehnen|tout refuser|refuser|continuer sans accepter|rechazar( todo| todas)?|solo (necesarias|esenciales))$/i
  const CLOSE = /^(close|dismiss|sluiten|sluit|schlie(ß|ss)en|fermer|cerrar|×|x|✕)$/i
  const BANNER = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], [id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [id*="gdpr" i], [class*="gdpr" i], [class*="privacy-banner" i], #onetrust-banner-sdk, #CybotCookiebotDialog, #usercentrics-root, #cmpwrapper, #truste-consent-track'
  const WORDS = /cookie|consent|gdpr|privacy|toestemming|datenschutz|confidentialit|privacidad/i
  const shown = e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden"
  const labelOf = b => (b.getAttribute("aria-label") || b.innerText || b.textContent || b.value || "").replace(/\s+/g, " ").replace(/[.!…]+$/, "").trim()
  /** Every element matching in the page and inside open shadow roots (some consent tools draw their banner there). */
  function deep(selector, root = document, out = []) {
    for (const e of root.querySelectorAll(selector)) out.push(e)
    for (const host of root.querySelectorAll("*")) if (host.shadowRoot) deep(selector, host.shadowRoot, out)
    return out
  }
  /** A banner is a dialog, something fixed over the page, or named for cookies, and it asks nothing in a field: a consent box inside an application form is not one. */
  function bannerLike(box) {
    if (box.closest("form") && !/cookie/i.test(`${box.id} ${box.className} ${box.textContent || ""}`)) return false
    if (box.querySelector('input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea, select')) return false
    if (box.matches('[role="dialog"], [role="alertdialog"], [aria-modal="true"], #onetrust-banner-sdk, #CybotCookiebotDialog, #usercentrics-root, #cmpwrapper, #truste-consent-track') || /cookie/i.test(`${box.id} ${box.className}`)) return true
    for (let e = box, depth = 0; e && depth < 4; e = e.parentElement, depth++) if (/^(fixed|sticky)$/.test(getComputedStyle(e).position)) return true
    return false
  }
  globalThis.oddsDismissCookies = () => {
    for (const box of deep(BANNER)) {
      const root = box.shadowRoot || box
      if (!shown(box) && !box.shadowRoot) continue
      if (!WORDS.test(box.textContent || root.textContent || "")) continue
      // A privacy STATEMENT a site shows (Yamaha: "Data Privacy Consent Statement", Accept / Decline / Print) is not a cookie banner: Declining it
      // ends the registration. It is the person's, or the account step's (apply-any.js acceptPrivacyStatement), never rejected here.
      const bannerText = String(box.textContent || root.textContent || "")
      // (Judged by how the box opens: its title and first lines. A long privacy statement mentions cookies somewhere further down.)
      const bannerHead = bannerText.slice(0, 300)
      if (!/cookie/i.test(bannerHead) && /\b(statement|verklaring|erkl[aä]rung|d[ée]claration)\b/i.test(bannerHead)) continue
      if (!box.shadowRoot && !bannerLike(box)) continue
      const buttons = deep("button, a[role='button'], [role='button'], input[type='button'], input[type='submit']", root).filter(b => shown(b) && !b.disabled && b.getAttribute("aria-disabled") !== "true" && !cookieAttempts.has(b))
      const button = buttons.find(b => REJECT.test(labelOf(b))) || buttons.find(b => CLOSE.test(labelOf(b)))
      if (button) { cookieAttempts.add(button); button.click(); return true }
    }
    // A banner with no cookie-named id or class (a plain bar fixed to the screen): found by its reject button, and only inside a fixed box that talks of cookies.
    for (const b of deep("button, a[role='button'], [role='button'], input[type='button']")) {
      if (!shown(b) || b.disabled || cookieAttempts.has(b) || !REJECT.test(labelOf(b))) continue
      for (let e = b.parentElement, depth = 0; e && depth < 6; e = e.parentElement, depth++) {
        const text = e.textContent || ""
        if (text.length > 3000 || !WORDS.test(text)) continue
        // A privacy STATEMENT (see above) is not a cookie banner here either.
        if (!/cookie/i.test(text.slice(0, 300)) && /\b(statement|verklaring|erkl[aä]rung|d[ée]claration)\b/i.test(text.slice(0, 300))) continue
        if (/^(fixed|sticky)$/.test(getComputedStyle(e).position) && bannerLike(e)) { cookieAttempts.add(b); b.click(); return true }
      }
    }
    return false
  }
  /**
   * Broods answers every question: the built-in answer rules stay in the code but are switched off. The extension only types and clicks
   * what Broods answered (from Autofill, profile and CV). Never passwords, captchas, consent or Submit. Set to false to bring the rules back.
   */
  globalThis.oddsBroodsOnly = true
  /** Gender copied from the person's own Autofill answer (never a guess, never Broods). */
  globalThis.oddsSavedGender = (label, facts) => /\b(gender|geslacht|geschlecht|genre)\b/i.test(label || "") && !/\b(identity|identit|transgender|pronoun|orientation)/i.test(label || "") && typeof facts?.answers?.gender === "string" && facts.answers.gender.trim() ? facts.answers.gender.trim() : null
  globalThis.oddsApplicationHandoff = (url, ask, jobId) => {
    const A = globalThis.oddsApply
    let published = null
    let checkedAt = 0
    /** Race SW replies — a hung suggest-answers used to freeze Easy Apply with no Odds questions and no bar update. */
    const askTimed = (message, ms) => Promise.race([
      Promise.resolve(ask(message)).catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), ms)),
    ])
    chrome.runtime.onMessage.addListener(message => { if (message?.type === "application-continue") checkedAt = 0 })
    return {
      async publish(questions, facts) {
        const seen = new Set()
        // Never publish questions Odds can already answer (country code, Pays, Prefer not to answer, visa, 18+…).
        // Never publish honeypots ("Leave this field empty if you're human").
        const unknown = questions.filter(q => q && !(typeof A.isTrapQuestion === "function" && A.isTrapQuestion(q.label)) && !(typeof A.agentCanAnswer === "function" && facts && A.agentCanAnswer(q.label, facts, q.options || [])))
        const safe = unknown.filter(q => q && ["text", "textarea", "number", "radio", "select", "choice", "combobox", "listbox"].includes(q.kind) && !/password|captcha|verification code|security code|social security|\bbsn\b|credit card/i.test(q.label)).map(q => ({ key: A.applicationQuestionKey(q.label, jobId), label: A.questionText(q.label), kind: q.kind === "choice" ? "radio" : q.kind === "combobox" || q.kind === "listbox" ? (q.options?.length ? "select" : "text") : q.kind, ...(q.options ? { options: q.options.filter(o => o && !/^(please\s+)?(select|choose|selecteer|kies)\b/i.test(o)).slice(0, 300).map(o => o.slice(0, 200)) } : {}) })).filter(q => q.key.length >= 2 && (q.label || "").trim().length >= 8 && !/^(type your (response|answer)|enter (your )?(answer|response)|your answer)\b/i.test(q.label) && !seen.has(q.key) && seen.add(q.key)).slice(0, 30)
        const signature = JSON.stringify(safe)
        if (signature === published || (published === null && !safe.length)) return
        published = signature
        // 1) Push questions to Odds immediately so the person sees them (never wait on Broods).
        const result = await askTimed({ type: "application-questions", url, questions: safe }, 8000)
        if (result?.status !== "ok" && published === signature) {
          published = null
          return
        }
        if (!safe.length) return
        // 2) Broods in the background — fill loop must not sit silent for 30s+.
        void (async () => {
          const suggested = await askTimed({ type: "suggest-answers", url, questions: safe, broods_only: globalThis.oddsBroodsOnly === true }, 35000)
          if (suggested?.status !== "ok" || !Array.isArray(suggested.accepted) || !suggested.accepted.length) return
          const refreshed = await askTimed({ type: "application-refresh-answers" }, 6000)
          if (!refreshed?.remembered || typeof refreshed.remembered !== "object") return
          for (const [key, answer] of Object.entries(refreshed.remembered)) {
            if (typeof answer !== "string" || !answer.trim() || answer.length > 1000) continue
            if (facts.remembered?.[key] !== answer) facts.remembered = { ...facts.remembered, [key]: answer }
          }
          checkedAt = 0
        })()
      },
      async refresh(facts) {
        if (Date.now() - checkedAt < 3000) return false
        checkedAt = Date.now()
        const result = await askTimed({ type: "application-refresh-answers" }, 6000)
        if (!result?.remembered || typeof result.remembered !== "object") return false
        let changed = false
        for (const [key, answer] of Object.entries(result.remembered)) {
          if (typeof answer !== "string" || !answer.trim() || answer.length > 1000) continue
          if (facts.remembered?.[key] !== answer) { facts.remembered = { ...facts.remembered, [key]: answer }; changed = true }
        }
        return changed
      },
    }
  }
})()
