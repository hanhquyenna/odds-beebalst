# Handoff: the apply loop, Fill with Odds and the side panel (17 October 2026, evening)

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
- Extension: `extension/` (apply-any.js = employer forms, background.js, apply.js = LinkedIn Easy Apply). Version 0.15.76.
  Sync for the owner: `rsync -a --delete extension/ ~/Downloads/odds-extension/` (they press reload in chrome://extensions).
- 9router: local on the owner's Mac (`~/.odds-9router`, Cloudflare tunnel). Logs with tokens per call: `~/.odds-9router/logs/9router.log`
  (`DONE … IN n (CACHE ↻n) · OUT n`). A 429 "usage limit has been reached" there = plan quota out; Broods runs then take 0 steps.

## 2. What was built on 17 Oct, morning (most of it is now in commit `cd176f6`)

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

## 2b. What was built on 17 Oct, evening (NOT committed; server + DB deployed, web app NOT deployed)

Two ways to apply, same engine (script fills, Broods checks, never Submit):
- **Apply with Odds** (auto): Odds opens the employer's form in a tab and fills it. Chrome notification when ready / needs you; click opens the tab.
- **Fill with Odds** (copilot, `drive_runs.mode = 'copilot'`): the person is on a form, presses the odds button (side panel, popup, toolbar).
  Broods fills every page, presses Next itself, stops before Submit. The person's own Next after a page ended resumes the same run.

Fixes and features (extension 0.15.76, `mcp` deployed as v144+):
- `background.js` dropped `odds_filled` on drive start (Broods never got the script's work) → forwarded. Ready-path copilot runs keep `mode`.
- Review check (`requiredEmpty` in drive.ts) treated a lost re-read as "nothing empty" (IMC consent went to review unticked) → falls back to the last page seen.
- A CV the site shows by name after swapping its file input (Teamtailor/Gisou) counts as filled (`cvShownAt` in apply-any.js).
- Commitment "Yes" (`COMMIT_Q`) is a default Broods may correct; saved answers and consent/decline stay locked.
- Shared rules rebuilt into `extension/job-sites.js` (`scripts/build-extension.sh`) — a unit test fails when they drift.
- **Autofill sources**: `application_questions.source` ('person' | 'odds', migration `20261017180000`, applied). Broods/rules answers are
  saved as 'odds' and never overwrite the person's; only 'person' answers go out as `saved_answers` (word for word, locked). Autofill page
  shows "Written by Odds" until edited. Legacy rows are null (unknown, never locked).
- **Save to Autofill?**: at review the content script lists the form's new answers (`newAnswersHere`, message `odds-new-answers`); the
  side panel shows them editable with ticks; `panel-keep-answers` saves only the ticked ones as 'person'.
- Notifications: `notifications` permission, `notifyApplication` in background.js (once per change, not when the tab is in front).

**Side panel redesign (Simplify-like, drawn by the web app)**: `src/components/ApplyPanel.tsx`, mounted in `src/App.tsx` when `embedded`.
Layout the owner approved by screenshot, top to bottom: status line → job card (CompanyLogo, title, company · age, pay, Track bookmark,
"See who you know here" → opens the People tab below and scrolls to it) → ONE big orange **Apply with Odds** button with the odds mark
(on a form: fills that page via `panel-fill`; on a job page: app message `apply` → employer form opens in a new tab and fills; unknown
page: Track this job) → Save to Autofill (review only) → interview-chance card (ring with %, "See recommendations" opens the
`Recommendations` ticks, Tailor my CV → Documents tab) → CV + Cover letter rows → the job's full sections (`JobDetail` with `bare` +
`showTab`: Overview/Company/People/Documents, `#job-tabs`) → "My jobs" (hides the panel for that page until the page changes).
Data bridge: `extension/panel-frame.js` posts `panel-info` every 2 s (`src/lib/embed.ts` `onPanelInfo`/`toExtension`); presses come back as
`panel-fill`, `panel-add-job`, `panel-keep-answers`, `apply`. A job opened from a page's % (viewJob) shows the app's job page instead,
until the tab's page changes (`jobViewUrl`). Owner's style: Simplify's features and order, Odds graphics (orange, odds logo, real logos,
app components/font), no grey explainer text.
- **Not live**: the web app deploys only on push to `main` (`.github/workflows/deploy-odds.yaml`). Until then production shows the old app.
- **Owner's local preview**: `~/Downloads/odds-extension` (the owner's unpacked copy) was edited after sync to frame `http://localhost:5173`
  (`ODDS` in panel-frame.js, iframe src in panel.html). That dev server belongs to another chat. **The next `rsync` undoes this** — redo the
  two `sed` lines if the owner still wants the local preview, and never commit it.
- Not verified on screen: the chance ring + ticks (test account has no CV). Owner's real profile should show them; ask for a screenshot.

Open product questions for the owner: hide the job card's own "Apply with Odds" inside the panel? Commit + merge to deploy?
Known noise: `panel-apply-info` calls `kitFor` (cached 2 min), which logs `apply.started` for every page viewed with the panel open.

Form-level fill quality (last 24 h, ~300 runs): runs at review had 99.1% of required fields filled (the 13 gaps = 12 CV false negatives,
now fixed, + 1 IMC consent, now guarded). First-try fill success 83.5% (top causes: field redrawn 140, dropdown value not kept 125,
out of time 27, phone reformatted 8). Of 707 runs in 48 h, 43% never reached a form (sign-in, captcha, closed, board) — why Fill with Odds exists.

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
- Extension regression suite: `bunx playwright test e2e/extension.spec.ts --project=desktop --workers=4` (174 tests; 1–3 fail under load
  and pass alone: phone requests, isTrusted, stuck listing, toolbar). Unit: `bun test src` (1,165). App e2e: `bunx playwright test e2e
  --project=desktop --grep-invert extension` (smoke "manual entry keeps the CSV uploader" fails on an un-mocked `drive_runs` call, not ours).
- Panel test: `-g "side panel on a job page"` serves the built app as odds.beeblast.co inside the extension and screenshots `test-results/ext-apply-panel.png`.

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
6. Dropdowns whose value is not kept (125 first-try failures/day) are the biggest lever for runs that stall on a form.
7. `report.py` does not split copilot vs auto runs yet; no real-site round of Fill with Odds has been run.

## 6. Working with the owner

- Short, direct answers; they ask "report" often: give the table first. They design by screenshot (Simplify as reference): show a
  screenshot of what you built, minimal UI, real logos, the app's own components and font, no grey explainer text.
- They do not want static scripts alone: script first, **agent always checks** (never trust the script's "done"), agent by hand when needed.
- Never invent the real person's grades/skills; the made-up test applicant may have them.
- Someone else edits the same files: their Cursor agent committed `b0c37f2`, and `prefillByRules`, `onlySubmitLeft` and the `ready` path
  appeared from Cursor or a forked Claude session. Check `git status`/`git log` before editing; never overwrite their work.
- A file `research-data/simplify/simplify-ats-rules.zip` (Simplify Copilot's internal ATS rules) was declined: proprietary, not to be copied.
