/**
 * Odds Apply agents on Broods:
 * - apply-stuck: fast structured pick from extension snapshot (script hands)
 * - apply-roam: free-roam browse (obscura) for page context, then same pick schema
 *
 * Product: Broods understands the page; Odds Chrome extension executes clicks/fills
 * under the person's login. Never Submit / password / captcha.
 */
import { defineAgent, defineBroods, defineSandbox, env } from "broods"

export default defineBroods({
  project: "odds-apply",
  stages: { dev: "development", deploy: "production" },
})

const applyPickSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    stage: {
      type: "string",
      description: "account | captcha | form | review | stuck",
    },
    action: {
      type: "string",
      description: "click | fill | wait_human | none",
    },
    text: {
      type: ["string", "null"],
      description: "Exact button label from the buttons list, or null",
    },
    answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: { type: "string" },
          answer: { type: "string" },
        },
        required: ["key", "answer"],
      },
    },
    reason: { type: "string" },
  },
  required: ["stage", "action", "text", "answers", "reason"],
} as const

const PICK_RULES = `Return one apply_pick:
- stage=account or captcha → action=wait_human (person only).
- Cookie banners FIRST when present: Functional only / Necessary only / Reject / Reject non-essential / Reject all — even if Easy Apply is also listed. Never Accept all.
- Then progress: Easy Apply / Apply / Apply now / Apply for this job → Next → Continue → Save and Continue → Review.
- If buttons[] contains Next OR Continue OR Review OR any Apply* (and not only Submit), you MUST action=click with that EXACT buttons[] string. stage=form. Do not return action=none when those exist.
- action=click → text must be an EXACT string from buttons[] when a button list is provided.
- action=fill → answers[{key,answer}] for empty required fields. facts = the person's Autofill plus their profile (nationality_group, work_permit, lives_in, education, experience, skills, cv_excerpt). REASON from them, do not wait for an exact field: nationality_group Non-EU → "Non-EU"; an education ending in the future → enrolled / still studying, its degree → the education type option; lives_in a Dutch city → based in the Netherlands; hours_per_week 40 → 5 days; English used in experience/CV → English fluent. Never state anything the facts contradict. Never invent file paths for resume/CV/upload fields — leave those to the extension (prefer click Next if present, else action=none).
- kind=suggest-answers (questions[] + facts, no buttons) → stage=form, action=fill, text=null, one answer per question the facts can answer; skip the rest.
- Choice question with options → answer is an EXACT option string. Dates → YYYY-MM-DD. Yes/No → "Yes" or "No".
- Open questions (why this role, motivation, reasons, what you bring) → 1–3 plain sentences in the first person from role_values, notes, experience, education and cv_excerpt, tied to the employer/job title. Always answer these when there is a profile.
- Never answer gender, age, ethnicity, disability, religion, family, salary history, legal declarations, consent, passwords or captchas — skip them (the person answers those).
- Never Submit, Send application, Submit Application, login, sign up, Accept all cookies, or password fields.
- Job closed / no longer available / expired / position filled → stage=stuck, action=none, reason=listing_gone.
- Only action=none when NO safe Apply/Next/Continue/Review/cookie control exists in buttons[].`

/** Fast path: extension sends snapshot; Broods picks; script clicks in the person's tab. */
export const applyStuck = defineAgent({
  name: "apply-stuck",
  description: "Fast Apply unblock from a page snapshot. Odds extension executes.",
  provider: { openai: { apiKey: env("OPENAI_API_KEY") } },
  model: {
    provider: "openai",
    modelId: "gpt-6-luna",
    reasoning: "none",
    temperature: 0,
    maxOutputTokens: 400,
    output: {
      type: "object",
      name: "apply_pick",
      schema: applyPickSchema,
    },
  },
  agent: {
    maxTurn: 8,
    system: `You are the Odds Apply stuck agent. The Chrome extension sends a JSON page snapshot (title, headings, errors, fields with keys/empty, buttons).

${PICK_RULES}

Examples (follow exactly when buttons match):
- buttons=["Review","Submit application","Back"] → {"stage":"form","action":"click","text":"Review","answers":[],"reason":"progress"}
- buttons=["Continue","Submit Application","Back"] → {"stage":"form","action":"click","text":"Continue","answers":[],"reason":"progress"}
- buttons=["Allow all","Necessary only","Manage"] → {"stage":"form","action":"click","text":"Necessary only","answers":[],"reason":"cookies"}
- buttons=["Accept all","Reject non-essential","Close"] → {"stage":"form","action":"click","text":"Reject non-essential","answers":[],"reason":"cookies"}
- title has captcha → stage=captcha action=wait_human
- password field or Sign in wall → stage=account action=wait_human
- job closed/expired → stage=stuck action=none reason=listing_gone
- NEVER use reason=listing_gone unless title/headings/errors say the job is closed, expired, filled, or no longer available.

The extension clicks/types in the person's logged-in tab. You only choose.`,
  },
  publicAccess: true,
})

/** Free-roam: Broods opens the URL with obscura browse, understands context, returns the same pick for the script. */
export const applyWeb = defineSandbox({
  name: "apply-web",
  provider: "lambda",
  image: "obscura",
  persistent: true,
  network: { mode: "allow-all" },
  permissionMode: "bypass",
  timeout: 90,
})

export const applyRoam = defineAgent({
  name: "apply-roam",
  description: "Free-roam browse of an apply URL, then structured pick for the Odds script.",
  provider: { openai: { apiKey: env("OPENAI_API_KEY") } },
  model: {
    provider: "openai",
    modelId: "gpt-6-luna",
    reasoning: "none",
    temperature: 0,
    maxOutputTokens: 500,
    output: {
      type: "object",
      name: "apply_pick",
      schema: applyPickSchema,
    },
  },
  sandboxes: [applyWeb],
  browser: { enabled: true },
  agent: {
    maxTurn: 12,
    system: `You are Odds Apply free-roam. The user message has a job application URL, optional snapshot (buttons/fields), and candidate facts.

1) Optionally browse the URL (markdown) when the snapshot is thin.
2) Your FINAL output must be apply_pick only — never end on browse markdown.
3) If the page is a docs placeholder (example.com) with no Apply controls → stage=stuck action=none.

${PICK_RULES}

If browse shows a login or captcha wall, wait_human. Do not invent button labels not visible in browse or the snapshot.
Keep turns short — Odds needs an answer in a few seconds.`
  },
  publicAccess: true,
})
