import { describe, expect, test } from "bun:test"
import { canAcceptDriveResult, humanStopAllowed, jobIdentityMismatch } from "../../supabase/functions/_shared/drive-ownership"

describe("canAcceptDriveResult", () => {
  test("accepts taken command on a running run", () => {
    expect(canAcceptDriveResult({ runStatus: "running", cmdStatus: "taken", runDocGen: 1, cmdDocGen: 1 })).toEqual({ ok: true })
  })

  test("rejects after Stuck / review / needs_you", () => {
    for (const runStatus of ["stuck", "review", "needs_you", "stopped", "failed"]) {
      expect(canAcceptDriveResult({ runStatus, cmdStatus: "taken" })).toEqual({
        ok: false,
        stale: true,
        reason: "run_ended",
      })
    }
  })

  test("rejects already done or queued", () => {
    expect(canAcceptDriveResult({ runStatus: "running", cmdStatus: "done" }).reason).toBe("already_done")
    expect(canAcceptDriveResult({ runStatus: "running", cmdStatus: "queued" }).reason).toBe("not_taken")
    expect(canAcceptDriveResult({ runStatus: "running", cmdStatus: "cancelled" }).reason).toBe("not_taken")
  })

  test("rejects wrong document generation", () => {
    expect(canAcceptDriveResult({ runStatus: "running", cmdStatus: "taken", runDocGen: 2, cmdDocGen: 1 })).toEqual({
      ok: false,
      stale: true,
      reason: "document_changed",
    })
  })
})

describe("jobIdentityMismatch", () => {
  test("flags a different employer host that is not an ATS handoff", () => {
    const r = jobIdentityMismatch({
      intendedUrl: "https://careers.yamaha.com/jobs/intern",
      pageUrl: "https://careers.wesco.com/jobs/other",
      intendedTitle: "Yamaha Intern Corporate Communications",
      pageTitle: "Wesco Intern",
      intendedEmployer: "Yamaha",
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("wrong_job")
  })

  test("allows LinkedIn → Greenhouse handoff", () => {
    expect(jobIdentityMismatch({
      intendedUrl: "https://www.linkedin.com/jobs/view/1",
      pageUrl: "https://job-boards.greenhouse.io/dept/jobs/8105170",
    }).ok).toBe(true)
  })
})

describe("humanStopAllowed", () => {
  test("captcha and account need evidence; cookies are not human stops", () => {
    expect(humanStopAllowed({ reason: "captcha", captcha: true }).ok).toBe(true)
    expect(humanStopAllowed({ reason: "captcha" }).ok).toBe(false)
    expect(humanStopAllowed({ reason: "account", signInWall: true }).ok).toBe(true)
    expect(humanStopAllowed({ reason: "other", unansweredQuestions: ["Please dismiss the cookie notice"] }).ok).toBe(false)
  })

  test("questions need at least one unanswered label", () => {
    expect(humanStopAllowed({ reason: "questions" }).ok).toBe(false)
    expect(humanStopAllowed({ reason: "questions", unansweredQuestions: ["Visa status?"] }).ok).toBe(true)
  })
})

describe("jobIdentityMismatch closed vs wrong-job", () => {
  test("Oracle→Wesco class is wrong_job not closed", () => {
    const r = jobIdentityMismatch({
      intendedUrl: "https://eklm.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/35404",
      pageUrl: "https://careers.wesco.com/us/en/job/123",
      intendedTitle: "Intern Corporate Communications",
      pageTitle: "Warehouse Associate",
      intendedEmployer: "Yamaha",
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("wrong_job")
  })
})
