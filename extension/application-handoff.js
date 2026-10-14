// Private form questions travel through Odds; only explicit answers come back. No submit action exists here.
;(() => {
  const cookieAttempts = new WeakSet()
  globalThis.oddsDismissCookies = () => {
    const shown = e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden"
    for (const box of document.querySelectorAll('[role="dialog"], [id*="cookie" i], [class*="cookie-banner" i], #onetrust-banner-sdk, #CybotCookiebotDialog')) {
      if (!shown(box) || !/cookie/i.test(box.textContent)) continue
      const button = [...box.querySelectorAll("button, a[role='button']")].find(b => shown(b) && !b.disabled && !cookieAttempts.has(b) && /^(reject all|reject optional cookies|reject optional|only necessary|necessary only|use necessary cookies only|deny all|alles afwijzen|alleen noodzakelijke cookies|alleen noodzakelijk)$/i.test((b.textContent || b.getAttribute("aria-label") || "").trim()))
      if (button) { cookieAttempts.add(button); button.click(); return true }
    }
    return false
  }
  globalThis.oddsApplicationHandoff = (url, ask, jobId) => {
    const A = globalThis.oddsApply
    let published = null
    let checkedAt = 0
    let writing = Promise.resolve()
    chrome.runtime.onMessage.addListener(message => { if (message?.type === "application-continue") checkedAt = 0 })
    return {
      async publish(questions) {
        const seen = new Set()
        const safe = questions.filter(q => q && ["text", "textarea", "number", "radio", "select", "choice", "combobox"].includes(q.kind) && !/password|captcha|verification code|security code|social security|\bbsn\b|credit card/i.test(q.label)).map(q => ({ key: A.applicationQuestionKey(q.label, jobId), label: A.questionText(q.label), kind: q.kind === "choice" ? "radio" : q.kind === "combobox" ? "text" : q.kind, ...(q.options ? { options: q.options.filter(o => o && !/^(please\s+)?(select|choose|selecteer|kies)\b/i.test(o)).slice(0, 100).map(o => o.slice(0, 200)) } : {}) })).filter(q => q.key.length >= 2 && !seen.has(q.key) && seen.add(q.key)).slice(0, 30)
        const signature = JSON.stringify(safe)
        if (signature === published || (published === null && !safe.length)) return
        published = signature
        writing = writing.catch(() => undefined).then(async () => {
          const result = await ask({ type: "application-questions", url, questions: safe })
          if (result?.status !== "ok" && published === signature) published = null
        })
      },
      async refresh(facts) {
        if (Date.now() - checkedAt < 3000) return false
        checkedAt = Date.now()
        const result = await ask({ type: "application-refresh-answers" })
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
