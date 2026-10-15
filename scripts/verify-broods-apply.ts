/**
 * Verify Broods apply-stuck on many stuck situations (+ optional apply-roam).
 * bun scripts/verify-broods-apply.ts
 * VERIFY_ROAM=1 bun scripts/verify-broods-apply.ts
 */
import { signUserToken } from "broods"

const stuckAgentId = "js74p8xs10efctdq5ynrkm6fmn8gagn5"
const roamAgentId = "js76rgrnz12qj43ys5qcnfwnm18gadsy"
const verifyRoam = process.env.VERIFY_ROAM === "1"
const envText = await Bun.file(".env.local").text()
const key = [...envText.matchAll(/^BROODS_API_KEY=["']?([^"'\n]+)/gm)].at(-1)?.[1]
const secret = [...envText.matchAll(/^BROODS_USER_TOKEN_SECRET=["']?([^"'\n]+)/gm)].at(-1)?.[1]
if (!key?.startsWith("bsk_") || !secret?.startsWith("bsig_")) throw new Error("missing Broods keys in .env.local")

type Case = { name: string; payload: Record<string, unknown>; expect: (p: Record<string, unknown>) => boolean }

const clickExact = (label: string) => (p: Record<string, unknown>) => p.action === "click" && p.text === label
const clickIncludes = (...parts: string[]) => (p: Record<string, unknown>) =>
  p.action === "click" && parts.some((x) => String(p.text ?? "").toLowerCase().includes(x.toLowerCase()))
const waitHuman = (stage: string) => (p: Record<string, unknown>) => p.stage === stage && p.action === "wait_human"
const fillOrNext = (p: Record<string, unknown>) =>
  (p.action === "fill" && Array.isArray(p.answers) && p.answers.length > 0) ||
  (p.action === "click" && ["Next", "Continue", "Review"].includes(String(p.text)))
const noSubmit = (p: Record<string, unknown>) =>
  !(p.action === "click" && /submit|send application/i.test(String(p.text ?? "")))

const cases: Case[] = [
  // —— navigation / progress ——
  {
    name: "next_over_submit",
    payload: { kind: "suggest-action", status: "stuck_loop", buttons: ["Next", "Submit application", "Review"] },
    expect: (p) => clickExact("Next")(p) && noSubmit(p),
  },
  {
    name: "continue",
    payload: { kind: "suggest-action", status: "stuck_loop", buttons: ["Continue", "Cancel", "Save"] },
    expect: clickExact("Continue"),
  },
  {
    name: "review",
    payload: { kind: "suggest-action", status: "stuck_loop", buttons: ["Review", "Submit application", "Back"] },
    expect: (p) => clickExact("Review")(p) && noSubmit(p),
  },
  {
    name: "easy_apply",
    payload: { kind: "suggest-action", status: "no_apply_yet", buttons: ["Save", "Easy Apply", "Share"] },
    expect: clickExact("Easy Apply"),
  },
  {
    name: "apply_now",
    payload: { kind: "suggest-action", status: "no_apply_yet", buttons: ["Apply now", "Save job", "Share"] },
    expect: clickIncludes("Apply"),
  },
  {
    name: "apply",
    payload: { kind: "suggest-action", status: "no_apply_yet", buttons: ["Apply", "Follow", "More"] },
    expect: clickExact("Apply"),
  },
  {
    name: "next_dutch",
    payload: { kind: "suggest-action", status: "stuck_loop", buttons: ["Volgende", "Annuleren", "Indienen"] },
    expect: (p) =>
      (p.action === "click" && String(p.text) === "Volgende") ||
      (p.action === "none" && noSubmit(p)),
  },
  {
    name: "exclude_already_tried",
    payload: {
      kind: "suggest-action",
      status: "stuck_loop",
      buttons: ["Next", "Continue", "Review"],
      exclude: ["Next"],
    },
    expect: (p) =>
      (p.action === "click" && p.text !== "Next" && ["Continue", "Review"].includes(String(p.text))) ||
      p.action === "none",
  },

  // —— cookies ——
  {
    name: "cookie_functional",
    payload: {
      kind: "suggest-action",
      status: "no_apply_yet",
      buttons: ["Accept all", "Functional only", "Easy Apply"],
    },
    expect: clickIncludes("functional"),
  },
  {
    name: "cookie_reject",
    payload: {
      kind: "suggest-action",
      status: "no_apply_yet",
      buttons: ["Accept all cookies", "Reject all", "Apply"],
    },
    expect: (p) => clickIncludes("reject")(p) || clickExact("Apply")(p),
  },
  {
    name: "cookie_necessary",
    payload: {
      kind: "suggest-action",
      status: "stuck_loop",
      buttons: ["Allow all", "Necessary only", "Manage"],
    },
    expect: clickIncludes("necessary"),
  },
  {
    name: "never_accept_all",
    payload: {
      kind: "suggest-action",
      status: "no_apply_yet",
      buttons: ["Accept all", "Reject non-essential", "Close"],
    },
    expect: (p) =>
      p.action === "click" &&
      !/accept all/i.test(String(p.text)) &&
      (/reject|necessary|functional|close/i.test(String(p.text))),
  },

  // —— human-only ——
  {
    name: "captcha",
    payload: {
      kind: "suggest-scan",
      status: "stuck_loop",
      title: "Verify you are human",
      headings: ["Captcha"],
      buttons: ["Next"],
      fields: [],
      errors: ["Please complete the captcha"],
    },
    expect: waitHuman("captcha"),
  },
  {
    name: "recaptcha",
    payload: {
      kind: "suggest-scan",
      status: "stuck_loop",
      title: "Application",
      headings: ["Security check"],
      buttons: ["Continue", "I'm not a robot"],
      fields: [],
      errors: ["reCAPTCHA required"],
    },
    expect: waitHuman("captcha"),
  },
  {
    name: "account_signin",
    payload: {
      kind: "suggest-scan",
      status: "stuck_loop",
      title: "Sign in to continue",
      headings: ["Create your account"],
      buttons: ["Sign in", "Create account"],
      fields: [{ label: "Password", kind: "password", empty: true, key: "password" }],
    },
    expect: waitHuman("account"),
  },
  {
    name: "account_login_wall",
    payload: {
      kind: "suggest-scan",
      status: "no_apply_yet",
      title: "Log in | Workday",
      headings: ["Sign In"],
      buttons: ["Sign In", "Forgot password"],
      fields: [
        { key: "email", label: "Email", kind: "email", empty: true },
        { key: "password", label: "Password", kind: "password", empty: true },
      ],
    },
    expect: waitHuman("account"),
  },
  {
    name: "never_click_submit",
    payload: {
      kind: "suggest-action",
      status: "stuck_loop",
      buttons: ["Submit application", "Send application"],
    },
    expect: (p) => p.action !== "click" || !/submit|send application/i.test(String(p.text ?? "")),
  },
  {
    name: "never_password_fill",
    payload: {
      kind: "suggest-scan",
      status: "stuck_loop",
      title: "Login",
      headings: ["Password"],
      buttons: ["Log in", "Cancel"],
      fields: [{ key: "password", label: "Password", kind: "password", empty: true, required: true }],
    },
    expect: (p) =>
      waitHuman("account")(p) ||
      (p.action === "none") ||
      (p.action === "fill" &&
        Array.isArray(p.answers) &&
        !(p.answers as { key?: string }[]).some((a) => /password/i.test(String(a.key)))),
  },

  // —— listing gone ——
  {
    name: "closed",
    payload: {
      kind: "suggest-scan",
      status: "stuck_loop",
      title: "This job is no longer available",
      headings: ["Job closed"],
      buttons: ["Similar jobs"],
      fields: [],
      errors: ["no longer accepting applications"],
    },
    expect: (p) => p.action === "none" || String(p.reason).includes("listing") || p.stage === "stuck",
  },
  {
    name: "expired",
    payload: {
      kind: "suggest-scan",
      status: "stuck_loop",
      title: "Position filled",
      headings: ["This requisition is closed"],
      buttons: ["View other jobs", "Home"],
      fields: [],
      errors: ["This job posting has expired"],
    },
    expect: (p) => p.action === "none" || p.stage === "stuck" || String(p.reason).toLowerCase().includes("listing"),
  },

  // —— fill gaps ——
  {
    name: "fill_city",
    payload: {
      kind: "suggest-scan",
      status: "fill_failed",
      buttons: ["Next"],
      fields: [{ key: "city", label: "City", kind: "text", empty: true, required: true }],
    },
    expect: fillOrNext,
  },
  {
    name: "fill_phone",
    payload: {
      kind: "suggest-scan",
      status: "fill_failed",
      buttons: ["Continue"],
      fields: [{ key: "phone", label: "Phone number", kind: "tel", empty: true, required: true }],
      facts: { phone: "+31612345678", city: "Amsterdam" },
    },
    expect: (p) =>
      (p.action === "fill" &&
        Array.isArray(p.answers) &&
        (p.answers as { key: string; answer: string }[]).some((a) => a.key === "phone" && a.answer.length > 3)) ||
      clickExact("Continue")(p),
  },
  {
    name: "fill_multi",
    payload: {
      kind: "suggest-scan",
      status: "fill_failed",
      buttons: ["Next", "Back"],
      fields: [
        { key: "city", label: "City", kind: "text", empty: true, required: true },
        { key: "linkedin", label: "LinkedIn URL", kind: "url", empty: true, required: true },
        { key: "years", label: "Years of experience", kind: "number", empty: true, required: true },
      ],
      facts: { city: "Amsterdam", linkedin: "https://linkedin.com/in/test", years_experience: "2" },
    },
    expect: (p) =>
      (p.action === "fill" && Array.isArray(p.answers) && (p.answers as unknown[]).length >= 1) ||
      clickExact("Next")(p),
  },
  {
    name: "fill_then_not_submit",
    payload: {
      kind: "suggest-scan",
      status: "stuck_loop",
      buttons: ["Submit application", "Next"],
      fields: [{ key: "city", label: "City", kind: "text", empty: true, required: true }],
      facts: { city: "Utrecht" },
    },
    expect: (p) => fillOrNext(p) && noSubmit(p),
  },

  // —— thin / ambiguous stuck ——
  {
    name: "empty_buttons",
    payload: {
      kind: "suggest-scan",
      status: "stuck_loop",
      title: "Application",
      headings: ["Additional questions"],
      buttons: [],
      fields: [],
      errors: [],
    },
    expect: (p) => p.action === "none" || p.action === "wait_human" || p.action === "fill",
  },
  {
    name: "only_dismiss",
    payload: {
      kind: "suggest-action",
      status: "stuck_loop",
      buttons: ["Close", "Dismiss", "Not now"],
    },
    expect: (p) =>
      p.action === "none" ||
      (p.action === "click" && /close|dismiss|not now/i.test(String(p.text))),
  },
  {
    name: "workday_next",
    payload: {
      kind: "suggest-action",
      status: "stuck_loop",
      host: "wd3.myworkdayjobs.com",
      buttons: ["Next", "Save and Continue", "Cancel"],
    },
    expect: (p) => clickIncludes("Next", "Save and Continue")(p),
  },
  {
    name: "greenhouse_continue",
    payload: {
      kind: "suggest-action",
      status: "stuck_loop",
      host: "boards.greenhouse.io",
      buttons: ["Submit Application", "Back", "Continue"],
    },
    expect: (p) => clickExact("Continue")(p) && noSubmit(p),
  },
  {
    name: "lever_apply",
    payload: {
      kind: "suggest-action",
      status: "no_apply_yet",
      host: "jobs.lever.co",
      buttons: ["Apply for this job", "Share"],
    },
    expect: clickIncludes("Apply"),
  },
  {
    name: "linkedin_easy_apply_modal",
    payload: {
      kind: "suggest-scan",
      status: "stuck_loop",
      host: "www.linkedin.com",
      title: "Easy Apply to Software Engineer at Acme",
      headings: ["Contact info"],
      buttons: ["Next", "Submit application"],
      fields: [
        { key: "email", label: "Email", kind: "email", empty: false },
        { key: "phone", label: "Phone", kind: "tel", empty: true, required: true },
      ],
      facts: { phone: "+31600000000" },
    },
    expect: (p) => (fillOrNext(p) || clickExact("Next")(p)) && noSubmit(p),
  },
  {
    name: "validation_errors",
    payload: {
      kind: "suggest-scan",
      status: "fill_failed",
      title: "Apply",
      headings: ["Please fix the errors"],
      buttons: ["Next"],
      fields: [{ key: "email", label: "Email address", kind: "email", empty: true, required: true }],
      errors: ["Email is required", "Invalid format"],
      facts: { email: "candidate@example.com" },
    },
    expect: fillOrNext,
  },
  {
    name: "file_upload_stuck",
    payload: {
      kind: "suggest-scan",
      status: "stuck_loop",
      title: "Upload resume",
      headings: ["Resume"],
      buttons: ["Next", "Upload resume"],
      fields: [{ key: "resume", label: "Resume", kind: "file", empty: true, required: true }],
      errors: ["Please upload a resume"],
    },
    expect: (p) => {
      if (p.action === "fill" && Array.isArray(p.answers)) {
        const bad = (p.answers as { key?: string; answer?: string }[]).some(
          (a) => /resume|cv|upload|file/i.test(String(a.key)) && /path\/to|\.pdf|\.docx/i.test(String(a.answer)),
        )
        if (bad) return false
      }
      return (
        (p.action === "click" && (p.text === "Next" || String(p.text).toLowerCase().includes("upload"))) ||
        p.action === "none" ||
        p.action === "wait_human"
      )
    },
  },
]

async function runOnce(
  payload: Record<string, unknown>,
  agentId = stuckAgentId,
  timeoutMs = 15000,
): Promise<{ ms: number; pick: Record<string, unknown> | null; err?: string }> {
  const t0 = performance.now()
  try {
  const token = await signUserToken({ userId: "odds-verify", ttlMs: 600_000, secret: secret! })
  const res = await fetch("https://gateway.broods.app/v1/runs", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "X-Broods-User-Token": token,
    },
    body: JSON.stringify({
      agentId,
      eventId: `verify-${crypto.randomUUID()}`,
      conversationKey: `verify-${Date.now()}-${Math.random()}`,
      events: [{ role: "user", content: [{ type: "text", text: JSON.stringify(payload) }] }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok || !res.body) return { ms: performance.now() - t0, pick: null, err: `${res.status} ${await res.text()}` }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ""
  let textAcc = ""
  let pick: Record<string, unknown> | null = null
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split("\n")
    buf = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data:")) continue
      const data = line.slice(5).trim()
      if (!data || data === "[DONE]") continue
      let ev: { type?: string; text?: string; object?: unknown; output?: unknown }
      try {
        ev = JSON.parse(data)
      } catch {
        continue
      }
      if (ev.type === "text-delta" && typeof ev.text === "string") textAcc += ev.text
      const raw = ev.object ?? ev.output
      // Ignore tool/browse payloads (e.g. {type:"text",value:"…"}); only accept apply_pick.
      if (
        raw &&
        typeof raw === "object" &&
        !Array.isArray(raw) &&
        "action" in (raw as object) &&
        "stage" in (raw as object)
      ) {
        pick = raw as Record<string, unknown>
        await reader.cancel().catch(() => undefined)
        return { ms: performance.now() - t0, pick }
      }
      if (ev.type === "finish" || ev.type === "step-finish") {
        const a = textAcc.indexOf("{")
        const b = textAcc.lastIndexOf("}")
        if (a >= 0 && b > a) {
          try {
            pick = JSON.parse(textAcc.slice(a, b + 1))
            await reader.cancel().catch(() => undefined)
            return { ms: performance.now() - t0, pick }
          } catch {
            /* continue */
          }
        }
      }
    }
  }
  if (!pick && textAcc) {
    const a = textAcc.indexOf("{")
    const b = textAcc.lastIndexOf("}")
    if (a >= 0 && b > a) {
      try {
        pick = JSON.parse(textAcc.slice(a, b + 1))
      } catch {
        /* ignore */
      }
    }
  }
  return { ms: performance.now() - t0, pick }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ms: performance.now() - t0, pick: null, err: msg }
  }
}

let failed = 0
const times: number[] = []
const fails: string[] = []
for (const c of cases) {
  const r = await runOnce(c.payload)
  times.push(r.ms)
  const ok = r.pick ? c.expect(r.pick) : false
  if (!ok) {
    failed++
    fails.push(c.name)
  }
  console.log(
    `${ok ? "PASS" : "FAIL"} ${c.name} ${Math.round(r.ms)}ms`,
    r.pick ? JSON.stringify(r.pick) : r.err ?? "no pick",
  )
}

if (verifyRoam) {
  const roamPayload = {
    kind: "suggest-scan",
    roam: true,
    url: "https://example.com",
    status: "stuck_loop",
    title: "Example Domain",
    buttons: [] as string[],
    fields: [] as unknown[],
    headings: ["Example Domain"],
  }
  const r = await runOnce(roamPayload, roamAgentId, 45000)
  times.push(r.ms)
  const ok = Boolean(r.pick && typeof r.pick.action === "string" && typeof r.pick.stage === "string")
  if (!ok) {
    failed++
    fails.push("roam")
  }
  console.log(
    `${ok ? "PASS" : "FAIL"} roam ${Math.round(r.ms)}ms`,
    r.pick ? JSON.stringify(r.pick) : r.err ?? "no pick",
  )
}

const avg = times.reduce((a, b) => a + b, 0) / times.length
const max = Math.max(...times)
const n = cases.length + (verifyRoam ? 1 : 0)
console.log(`\nlatency avg=${Math.round(avg)}ms max=${Math.round(max)}ms cases=${n} failed=${failed}`)
if (fails.length) console.log("FAILS:", fails.join(", "))
console.log(failed === 0 ? "VERIFY_OK" : "VERIFY_NEEDS_WORK")
process.exit(failed === 0 ? 0 : 1)
