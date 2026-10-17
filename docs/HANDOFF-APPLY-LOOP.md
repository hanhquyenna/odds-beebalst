# Handoff: the apply stress-test loop (17 October 2026)

For the next agent. Goal from the owner: **Apply with Odds should work on every job**: fill the employer's form all the way until only
Submit is left, or stop at once, correctly, at what only the person can do (captcha, sign-in, closed job, email-only). As few model calls
as possible: the owner runs Broods on their own ChatGPT plan through 9router, and the plan's quota is the real limit.

No secret values are in this file. Never print, save or commit keys. The owner once pasted a service-role key and an Apify token in chat:
do not use those values. Tests read the service key from `.env.secrets` into an environment variable only (`REAL_SR_KEY`), never into a file.

## 1. How applying works now

```
Page opens (the employer's own form when Odds knows it: posting_apply_links)
 ├─ 0. Pre-checks (code): captcha wall / closed / sign-in / email-only → correct stop at once
 ├─ 1. Script (extension, code): contacts, CV, consent, required choices, rule answers (drivePrefill + prefillByRules)
 ├─ 2. Broods (agent) checks the script's work and does what is left (task.odds_filled; never trusts the script's "done")
 │      guided by task.route (route template for the platform/site) and site_playbook
 └─ 3. finish: review | needs_you (captcha, account, questions, letter, email) | stuck (other, closed)
```

- Agent: Broods project `odds-apply`, file `broods/index.ts` (DRIVE_RULES). Model **cx/gpt-6-luna** through 9router
  (`modelId: process.env.ODDS_APPLY_MODEL || "cx/gpt-6-luna"`). Deploy: `bunx broods deploy --project odds-apply`.
- Hands: MCP server `supabase/functions/mcp/drive.ts` (tools, finish rules, guards). Deploy:
  `supabase functions deploy mcp --project-ref ukpmpyfcnbhngkgbnkxi --use-api`. **Check it parses first**: `bun build --no-bundle supabase/functions/mcp/drive.ts`
  (a quote inside a tool description once broke a deploy silently).
- Extension: `extension/` (apply-any.js = employer forms, background.js, apply.js = LinkedIn Easy Apply). Version 0.15.61.
  Sync for the owner: `rsync -a --delete extension/ ~/Downloads/odds-extension/` (they press reload in chrome://extensions).
- 9router: local on the owner's Mac (`~/.odds-9router`, Cloudflare tunnel). Logs with tokens per call: `~/.odds-9router/logs/9router.log`
  (`DONE … IN n (CACHE ↻n) · OUT n`). A 429 "usage limit has been reached" there = plan quota out; Broods runs then take 0 steps.

## 2. What was built today (all deployed unless noted; working tree NOT committed)

Server (`mcp/drive.ts`, `mcp/server.ts`, `_shared/*`):
- Facts Broods never had: `dutch_level`, `job_source`, `worked_at_this_employer_before` (jobFacts).
- `write_letter` tool: a required cover letter is written, saved as PDF on the job, attached with `upload_letter`.
- Route templates `_shared/site-routes.ts` + table `site_routes` (learned from the FIRST success, dropped when failing more than working);
  per platform or per employer site (`host:…`). `task.route` sent to Broods.
- `posting_apply_links` table (+ migration `20261017140000`): employer's own form for board jobs (source run/apify/match/board).
  Seeded: 234 Magnet.me (from Magnet's applyExternally page), 73 matched direct postings. apply-kit returns `apply_url`; extension opens it.
- Guards: captcha wall with no fields → needs_you captcha at once; "apply by email" → reason `email`; questions the rules answer
  (experience yes/no, located, sponsorship, consent…) sent back once; quiet Broods nudged after 30 s, up to 3 times.
- `odds_filled` passed to Broods (what the script filled / left).

Extension (`apply-any.js`, `background.js`):
- Phone-queued runs open in the Odds window; hidden-tab sleeps go through the service worker (`odds-sleep`).
- Never treats Odds/Broods pages as an application (applicationPage / NOT_APPLICATION).
- Board → employer hand-off: Magnet.me added to the boards list (wrong-job guard); `back` handles same-document steps.
- Widgets: intl-tel flag picker; react-phone-number-input (`.PhoneInput`, full +31); `pattern=` phone boxes (TNO); country-code picker
  showing "+31"; multi-select chips; place search ("Amsterdam, Netherlands" → "Amsterdam, North Holland, Netherlands");
  Ashby location (`<input aria-haspopup=listbox>` is typed, value read from the input); checkbox groups get `group` (their question);
  long option lists cut (`options_total`); CV upload trusts Broods' chosen box and accepts sites that clear the input (Homerun, Picnic).
- Forms in blank frames (HubSpot embeds): top page injects into frames (`apply-frames`) and steps aside; late ATS iframes take over mid-run.
- `siteChrome` ignores html/body classes (TNO's `footer-has-layout-footer`). Captcha frames: DataDome, Cloudflare, Arkose, PerimeterX.
- Email-only pages: `read_page.apply_email`.

App: chip "Apply by email" (`src/lib/apply-activity.ts`, `drive-run-state.ts`).

## 3. The test loop and its metrics

Real sites, real Broods, made-up applicant, never submits (Playwright, `e2e/extension.spec.ts`, test "REAL: Broods drives …"):

```bash
REAL_FILL_MS=300000 REAL_SR_KEY="$(sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p' .env.secrets | tr -d "\"'")" REAL_BROODS=1 \
REAL_JOBS_FILE=research-data/jobcheck/set2.json bunx playwright test e2e/extension.spec.ts --project=desktop -g "REAL: Broods drives" --workers=4 --reporter=line
```

- Job sets (git-ignored, `research-data/jobcheck/`): `set2.json` = the 17 tuned jobs (14 employer sites + 3 Magnet.me);
  `set3.json` = 49 fresh jobs across 11 platforms (never tuned on). `job_check.csv` = link check of all 1,650 active English intern/entry jobs.
- Score a round: `python3 research-data/jobcheck/report.py "<round start UTC>" "2030-01-01"` (reads drive_runs; start times in `loop/<round>.start`).
  - **Reached review** = status review (only Submit left).
  - **Ended right** = review, or a correct stop: needs_you captcha/account/email, or reason closed.
  - Also: avg steps, avg time, screenshots, per board, and every non-review run with its message.
- Traces: `drive_commands` (every tool call, args, result, timings). `scripts/drive-site-metrics.sql`; the step-route query used today groups
  runs by host and tool sequence (Greenhouse went from 25 runs/25 routes to "read → fill → done").
- Tokens: sum `IN/OUT` from 9router.log for the round's time window.
- Probes without a model (fake Broods, real page): `REAL_FILL_URL=<form> bunx playwright test e2e/extension.spec.ts -g "REAL_FILL_URL"`
  (fills dropdowns, `REAL_UPLOAD=1` tries the CV upload) — the fastest way to debug a widget.
- Extension regression suite: `bunx playwright test e2e/extension.spec.ts --project=desktop --workers=4` (about 3 failures under load
  are flaky; rerun them with `--workers=1`).

## 4. Numbers

| Round (17 tuned jobs) | Reached review | Ended right | Avg steps | Avg time |
|---|---|---|---|---|
| 1 (morning) | 0% | 0% | 10.2 | 102 s |
| 7 | 56% | 62% | 4.6 | 58 s |
| 10 | 68% | 75% | 3.4 | 34 s |
| 11 | 68% | 100% of finished (12/12) | 2.8 | 24 s (successes) |

Fresh 49 jobs: run 1 ended right 62% (27/43); run 2 (after CV/phone/Ashby fixes) at 22/49: 72%. A third run with the test-side nudge
is the next one to do. Successful runs: ~3 steps, ~25–30 s, ~40k tokens (≈12k in per call, ~70% cached).

## 5. Open issues (in order)

1. "Tab stopped answering" (Henkel, EU JRC, SmartRecruiters before): the Broods ↔ server ↔ DB ↔ extension relay. Real fix: run the loop
   inside the extension, server only proxies model calls.
2. gpt-6-luna sometimes ends a turn without a tool call → nudges (30 s, ×3) now; watch whether it is enough.
3. Glassdoor/Indeed: captcha before any form → need employer links (owner's Apify run; input files `research-data/jobcheck/apify_*.json`)
   loaded into `posting_apply_links` (source apify).
4. Small: Greenhouse pronouns required without "prefer not to say"; Ashby sponsorship toggle; Indeed captcha sometimes tagged stuck.
5. Not done yet: the maintenance loop (daily per-site report + alert on drops + nightly 30-job canary, `scripts/launchd`), and committing.

## 6. Working with the owner

- Short, direct answers; they ask "report" often: give the table first.
- They do not want static scripts alone: script first, **agent always checks** (never trust the script's "done"), agent by hand when needed.
- Never invent the real person's grades/skills; the made-up test applicant may have them.
- Someone else edits the same files: their Cursor agent committed `b0c37f2`, and `prefillByRules`, `onlySubmitLeft` and the `ready` path
  appeared from Cursor or a forked Claude session. Check `git status`/`git log` before editing; never overwrite their work.
- A file `research-data/simplify/simplify-ats-rules.zip` (Simplify Copilot's internal ATS rules) was declined: proprietary, not to be copied.
