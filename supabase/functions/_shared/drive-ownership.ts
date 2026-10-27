/** Whether a late drive-result may still write the command row. */
export function canAcceptDriveResult(opts: {
  runStatus: string
  cmdStatus: string
  runDocGen?: number
  cmdDocGen?: number
}): { ok: true } | { ok: false; stale: true; reason: string } {
  if (opts.runStatus !== "running") return { ok: false, stale: true, reason: "run_ended" }
  if (opts.cmdStatus !== "taken") return { ok: false, stale: true, reason: opts.cmdStatus === "done" ? "already_done" : "not_taken" }
  if (typeof opts.runDocGen === "number" && typeof opts.cmdDocGen === "number" && opts.runDocGen !== opts.cmdDocGen) {
    return { ok: false, stale: true, reason: "document_changed" }
  }
  return { ok: true }
}

/** Job page still matches the intended application (wrong-link / redirect guard). */
export function jobIdentityMismatch(opts: {
  intendedUrl: string
  pageUrl: string
  intendedTitle?: string
  pageTitle?: string
  intendedEmployer?: string
}): { ok: true } | { ok: false; reason: "wrong_job"; message: string } {
  let intended: URL
  let page: URL
  try {
    intended = new URL(opts.intendedUrl)
    page = new URL(opts.pageUrl)
  } catch {
    return { ok: true }
  }
  // Same host family (subdomains of the ATS/employer) is fine; a totally different registrable host is not.
  const hostOf = (h: string) => h.replace(/^www\./i, "").toLowerCase()
  const ih = hostOf(intended.hostname)
  const ph = hostOf(page.hostname)
  if (ih && ph && ih !== ph && !ph.endsWith(`.${ih}`) && !ih.endsWith(`.${ph}`)) {
    // Aggregator → employer ATS is a legitimate handoff (linkedin → greenhouse).
    const boards = /(greenhouse|lever\.co|ashbyhq|myworkdayjobs|workday|smartrecruiters|csod|cornerstoneondemand|eightfold|phenompeople|avature|pageuppeople|jobs\.sap|brassring|ukg|ultipro|recruitee|teamtailor|personio|indeed|glassdoor|linkedin|academictransfer|stepstone|monsterboard|nationalevacaturebank|werkzoeken|jobbird|workable|homerun|bamboohr|successfactors|oraclecloud|taleo|icims|jobvite|softgarden|join)\.|(^|\.)magnet\.me$/i
    // The employer's own ATS carries its name on another domain (henkel.com → henkel.csod.com): the same employer's handoff.
    const brand = ih.split(".").slice(-2, -1)[0] ?? ""
    const sameEmployer = brand.length >= 4 && ph.split(".").some((label) => label === brand)
    if (!(boards.test(ih) || boards.test(ph) || sameEmployer)) {
      return {
        ok: false,
        reason: "wrong_job",
        message: `The link opens a different job (${ph} instead of ${ih}). Not filling personal details.`,
      }
    }
  }
  const title = (opts.pageTitle || "").replace(/\s+/g, " ").trim()
  const want = (opts.intendedTitle || "").replace(/\s+/g, " ").trim()
  const employer = (opts.intendedEmployer || "").replace(/\s+/g, " ").trim()
  if (want.length >= 8 && title.length >= 8) {
    const needle = want.slice(0, 40).toLowerCase()
    if (!title.toLowerCase().includes(needle.split(/\s+/).slice(0, 4).join(" ")) && employer && !title.toLowerCase().includes(employer.toLowerCase().slice(0, 24))) {
      // Soft: only when employer also missing from title.
      if (employer.length >= 3 && !title.toLowerCase().includes(employer.toLowerCase().slice(0, 12))) {
        return {
          ok: false,
          reason: "wrong_job",
          message: `The link opens a different job (“${title.slice(0, 80)}” instead of “${want.slice(0, 80)}”). Not filling personal details.`,
        }
      }
    }
  }
  return { ok: true }
}

/** Human-stop reasons need observed evidence on the page snapshot. */
export function humanStopAllowed(opts: {
  reason: string | null | undefined
  captcha?: boolean
  passwordField?: boolean
  signInWall?: boolean
  consentUnanswered?: boolean
  unansweredQuestions?: string[]
}): { ok: true } | { ok: false; reason: string } {
  const r = opts.reason || "other"
  if (r === "captcha") return opts.captcha ? { ok: true } : { ok: false, reason: "no_captcha_evidence" }
  if (r === "account") return opts.passwordField || opts.signInWall ? { ok: true } : { ok: false, reason: "no_account_evidence" }
  if (r === "questions") return (opts.unansweredQuestions?.length ?? 0) > 0 ? { ok: true } : { ok: false, reason: "no_question_evidence" }
  if (r === "letter") return { ok: true }
  if (r === "closed") return { ok: true }
  // Cookie banners are automation, not needs_you.
  if (/cookie/i.test(String(opts.unansweredQuestions?.[0] || ""))) return { ok: false, reason: "cookie_is_automation" }
  if (r === "other" && opts.consentUnanswered) return { ok: true }
  if (r === "other") return { ok: true }
  return { ok: true }
}
