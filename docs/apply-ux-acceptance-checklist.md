# Odds Apply — strict UX contract and stress-test checklist

Handoff to Cursor · 16 October 2026

## Objective

From a real job in Odds, one click opens its real application in a background Chrome tab, fills verified profile information and the chosen CV, and progresses until review or a genuine human decision. The user can keep working elsewhere, inspect the exact application at any time, and resume the same application after interruption.

Do not claim every employer works. Report coverage by platform and observed case. A green test runner or a status label is not proof of a filled form.

## Non-negotiable boundaries

- Never submit an application, type a password, create an account, solve captcha, complete identity verification, or agree to terms/data-retention consent.
- Reject optional cookies where possible. Never use Accept all as a shortcut.
- Never invent visa/work authorization, education, experience, availability or motivation. Use confirmed profile values; ask when material information is missing.
- Testing uses a synthetic applicant and blocks final submission. Never mass-test by sending real applications.
- No focus stealing. Visible test windows require the user's explicit request.
- Do not silently change saved profile answers. Save reusable answers only after the person confirms them; preserve country/employer/time scope.

## Proposed release targets

These are acceptance targets, not measured current performance. Measure them from actual UI clicks and disclose environmental failures. Do not loosen them to make the report green.

| Event | Target |
|---|---|
| Apply click gives visible feedback | Within 300 ms |
| Real application tab created, in background | Within 2 seconds when connected |
| Open application tab selects the exact existing tab | Within 1 second when Chrome is responsive |
| No observable browser/agent progress | At 15 seconds show a truthful waiting/recovery state; never pretend activity |
| Browser command loses its response | Within 30 seconds reconcile or show a specific connection/recovery state |
| Stop acknowledged | Within 1 second in UI; no new action starts after acknowledgement |
| Simple supported single-page form | Target under 60 seconds to verified fill or evidenced human blocker |

Slow employer/network responses may exceed the fill target. The UI must say what is actually waiting. Never use invented completion percentages, fake activity, or a single long test timeout to hide a stalled step.

## Click-by-click UX contract

### 1. Apply with Odds

Starting condition: signed in to Odds; extension connected; a valid job and CV available.

1. User clicks Apply with Odds once.
2. Button responds immediately and shows Applying… with a subtle activity indicator.
3. Odds creates one application tab in the background. The user's active tab/window stays active.
4. The tab navigates to the correct vacancy and actual application. Prefer the employer site when the job board points offsite; use LinkedIn Easy Apply when that is the available route.
5. Odds checks employer/job identity before entering personal data.
6. Odds fills known fields and selected CV, verifies the results, handles ordinary Next/Back/widgets and rejects optional cookies.
7. UI shows actual recent activity, for example Uploading your CV, only after that action begins. Otherwise show the real waiting/recovery state.
8. The run ends at verified Review & send or a specific human blocker. Apply must not silently save the job as Applied or submit it.

Double-clicking or retrying a pending click must not create another run/tab. Separate jobs may run independently; no demand to finish/cancel job A before starting B.

If disconnected: show Reconnect with a useful explanation/action. Do not leave Applying indefinitely, open random homepages or instruct the user to reload chrome://extensions as the product's recovery flow.

### 2. Open application tab

1. Show this button only when a real, owned application tab exists.
2. Clicking selects the exact tab Odds is currently using, including any legitimate redirect/new employer tab.
3. Preserve its form, current page, selected CV and entered answers.
4. Do not create a duplicate, navigate back to a listing, open about:blank or open the Odds landing page.
5. This explicit click may bring Chrome forward. Background fill, polling, extension startup and reload may not.
6. If the tab was closed, replace the action with truthful recovery; never leave a dead Open button. Reopening must be explicit and labelled accurately.

### 3. Your answers

1. Show the exact unanswered question and its real choices in the job side panel where supported.
2. Prefill a confirmed profile answer when its meaning and scope match.
3. User edits/answers and clicks Continue application.
4. Confirm the answer was accepted by the actual form, then advance in the same tab.
5. Offer to remember reusable answers in Profile → Personal information. Show saved values there and allow edit/removal.
6. Employer-specific motivation stays specific. Do not reuse country-specific sponsorship answers globally or turn a dated enrollment answer into a permanent fact.
7. If a widget cannot be represented safely in the panel, explain the exact action and offer Open application tab. Never fake a successful answer.

### 4. Account, captcha, security or consent

1. Show Sign in, Captcha, Security check or Your consent with one short instruction and Open application tab.
2. Preserve the application and pause browser mutations.
3. The person completes the action in Chrome.
4. Continue application re-observes the same tab and resumes once the blocker is actually gone.
5. If the blocker remains, show it honestly; do not start another run or repeatedly click it.

### 5. Review & send

Show only after verifying that the application exists, chosen CV is attached where required, known required fields are filled, no unresolved validation errors remain, and the final review/submission step is reached. Any remaining human terms/signature must be clearly called out; don't imply all requirements are complete.

Open application tab takes the person to that exact form. The person submits manually. Do not label Applied merely because the form is filled or a Submit button exists. Record Applied only from reliable submission evidence or explicit user confirmation.

### 6. Stop and Continue

Stop stops new agent/browser actions and keeps the open form. A completed in-flight action may already have occurred; acknowledge this honestly and reconcile its result. Never perform further delayed/retried mutations after stop acknowledgement.

Continue reuses the same run context/tab, observes current state, keeps user edits and resumes safely. Reloading Odds, Chrome or the extension must not silently restart old runs or focus old tabs. A lost/closed tab needs an explicit recovery action, not pretend continuation.

### 7. Closed, wrong link and technical failure

- Genuine job-specific 404/expired vacancy: show Job closed once, stop activity, retain the saved job at the bottom of the tracker. No repeated notification on reload.
- Wrong employer/job after redirect: stop before filling; say The link opens a different job. Do not mark the intended job closed.
- Network error, generic server error, captcha or denied access: do not classify as Closed without job-specific evidence.
- Automation failure: attempt bounded recovery, then name the actual problem. Stuck must not mean a single script timeout without recovery/agent inspection.

## Strict state assertions

| Displayed state | Required evidence |
|---|---|
| Applying… | Live run, owned tab, recent action/heartbeat or explicitly described recovery |
| Your answers | Specific unresolved questions, not a generic script error |
| Sign in / Account | Observed authentication/account screen |
| Captcha / Security check | Observed challenge; no attempt to solve |
| Your consent | Actual consent/terms requiring human choice |
| Review & send | Verified form/review state and required-field/CV checks |
| Reconnect | Extension/transport unavailable, not mislabelled form failure |
| Stuck | Recovery tried and logged; actionable reason shown |
| Closed | Job-specific closed/404 evidence |
| Applied | Submission confirmed by reliable evidence or the user |

## Stress tests — run through the actual UI

Each test starts by clicking the real button in localhost:5173 using the reloaded installed extension. Fixture tests support these cases but cannot replace the real UI run. Record whether a case used the real backend or mocked transport.

### A. Entry and tab ownership

- [ ] A01 Single Apply: one background application tab, immediate feedback, correct job.
- [ ] A02 Double-click Apply rapidly: one run and one tab.
- [ ] A03 Click Apply again during slow startup: no duplicate work.
- [ ] A04 Apply to three different jobs: independent tabs/statuses; no finish/cancel gate.
- [ ] A05 Open tab during opening, filling and human pause: exact current tab every time.
- [ ] A06 Employer opens a new tab/redirect chain: ownership follows the real application.
- [ ] A07 Work in another Chrome tab/window during fill: no focus steal.
- [ ] A08 No extension connection: clear Reconnect, no dead Applying or random website.
- [ ] A09 User closes the application tab: Open becomes accurate recovery; no dead button.

### B. Fields and documents

- [ ] B01 First/given names, family name, email, phone and location match confirmed profile.
- [ ] B02 Native select, ReactSelect, searchable dropdown, radio and checkbox widgets verify selected values.
- [ ] B03 Long country list includes Netherlands; choices are not truncated incorrectly.
- [ ] B04 New conditional fields appear/reorder: old field IDs cannot target another question.
- [ ] B05 Same labels in multiple sections: correct field receives the answer.
- [ ] B06 CV attaches, upload finishes, actual filename verified; upload errors remain visible.
- [ ] B07 User-selected job CV overrides default; changing CV does not attach the wrong file.
- [ ] B08 User edits a filled value: automation keeps the edit and does not fight typing.
- [ ] B09 Validation rejects phone/date/typeahead: recover or ask specifically; no false Review.
- [ ] B10 Missing material profile fact: ask; never invent an answer.

### C. Navigation and recovery

- [ ] C01 Single page, multi-page Next, SPA change and full document navigation all continue.
- [ ] C02 Delayed action/result: reconcile once; no duplicate click or late fill after terminal state.
- [ ] C03 Duplicate poll/result delivery: exactly one action and one recorded result.
- [ ] C04 Temporary network loss: truthful recovery, same tab/run after connection returns.
- [ ] C05 Reload Odds mid-fill: restore truthful status, no new tab/run or focus change.
- [ ] C06 Reload extension mid-fill: reconnect safely to same tab; no homepage popup.
- [ ] C07 Stop during upload/navigation/agent thinking: no new mutation after acknowledgement.
- [ ] C08 Continue after Stop: re-observe same tab; preserve user work.
- [ ] C09 Background screenshot unavailable: structured fallback; no repeated screenshot loop/focus steal.
- [ ] C10 Unchanged page loop: bounded alternate strategy then specific failure; never endless Checking/Filling.
- [ ] C11 Stale command from previous document/run: reject safely, no wrong-field mutation.

### D. Human decisions and memory

- [ ] D01 Cookie banner: reject optional cookies; don't ask the person unnecessarily.
- [ ] D02 Sign-in/account wall: explicit instruction, no password typing; resume after manual sign-in.
- [ ] D03 Captcha/security check: pause safely; resume after manual completion.
- [ ] D04 Consent/terms: remain unchecked by automation and clearly assigned to the person.
- [ ] D05 Answer question in side panel: real form updates and continues in same tab.
- [ ] D06 Remember confirmed reusable answer: visible/editable in Personal information; reused on compatible next job.
- [ ] D07 Correct saved answer: subsequent fill uses new value; removal prevents reuse.
- [ ] D08 Visa/enrollment question with different country/date: no unsafe reuse.
- [ ] D09 Motivation question: ask person; never invent or silently reuse another employer's text.

### E. Truthful status and tracker

- [ ] E01 Same vacancy imported twice/trailing slash/company case: one tracker row and latest live status.
- [ ] E02 Agent active: Applying; no premature Stuck/Review.
- [ ] E03 Required field blank/upload failed: Review forbidden.
- [ ] E04 Genuine vacancy 404/closed: Closed once, saved at bottom, no toast replay on reload.
- [ ] E05 Wrong vacancy redirect: wrong-link warning before personal data entry; not Closed.
- [ ] E06 Network/server failure: recover/error, not Closed.
- [ ] E07 Filled application: not Applied until manual submission is confirmed.
- [ ] E08 Terminal state followed by late result: no resurrection or silent mutation.
- [ ] E09 Notification flood/reload: no repeated historical alerts or UI freeze.

### F. Platform coverage

For EACH platform below, record a fresh real vacancy, exact URL, signed-in state and supported route. Test Apply → observed end → Open exact tab → reload/Continue where applicable. Repeat twice after the final fix set.

- [ ] F01 Greenhouse: country/phone dropdowns, CV, required questions.
- [ ] F02 Lever: reject cookies, application navigation, CV and human consent.
- [ ] F03 Ashby: dynamic questions, education/experience and CV.
- [ ] F04 Workday: existing account/sign-in, multi-page form after manual authentication.
- [ ] F05 Oracle: verify correct employer/requisition first; multi-step form.
- [ ] F06 LinkedIn Easy Apply: signed out and manually signed in; modal pages, CV and review.
- [ ] F07 LinkedIn offsite: follow actual employer application, preserve exact tab ownership.
- [ ] F08 Indeed: signed out and manually signed in; direct and employer routes where available.
- [ ] F09 Glassdoor: reject cookies; security challenge handled as human; employer route after access.
- [ ] F10 Genuine closed vacancy and genuine job-specific 404.

## Evidence required for every real case

| Field | Record |
|---|---|
| Test ID / build | Commit/build marker, extension runtime version, test time |
| Job | Employer, title, exact starting and final URL |
| Environment | Actual localhost/installed extension or fixture; backend; signed-in state |
| Entry | Screenshot/video of actual Apply click and tab creation |
| Run | Run ID, owned tab/document IDs, agent/model steps from database |
| Timing | Click→tab, click→fill/human blocker, Open latency, total test duration |
| Verified result | Actual field values checked using synthetic data; CV attached; remaining questions/errors |
| Terminal evidence | Screenshot + why this status is justified |
| Recovery | Open/Stop/reload/Continue results, focus checks |
| Safety | No final-submit attempt, no password/captcha/consent automation |
| Verdict | PASS, FAIL, HUMAN BLOCKER VERIFIED, or NOT TESTED; issue and trace link |

A HUMAN BLOCKER VERIFIED means detection passed; it does not prove later pages or the whole platform pass. A case with a bad URL is an identity/discovery failure, not a fill success. Never count a skipped/interrupted test as passing. Log entry counts are not agent steps. Do not mix test teardown/UI wait time with fill latency.

## User's quick checklist

Run with one supported, open vacancy and your confirmed profile/CV:

- [ ] Reload Odds extension once after installation/update; refresh Odds and existing job tabs.
- [ ] Click Apply: immediate feedback and exactly one background application tab.
- [ ] Keep working: no window/tab jumps forward.
- [ ] Click Open application tab: correct job/form, known details filled, selected CV attached.
- [ ] If asked: a real question/sign-in/captcha/consent is clearly identified.
- [ ] Answer or complete the human step; Continue uses the same tab.
- [ ] Reload Odds: status remains correct; no duplicate tab or notification flood.
- [ ] Stop then Continue: no unwanted actions; entered information survives.
- [ ] Start another job: works independently.
- [ ] Review label matches the actual form; nothing is submitted automatically.

If any box fails, record the job URL, screenshot, time and what you clicked. Do not mark the platform complete.

## Cursor delivery instructions

1. Inspect docs/apply-repair-plan.md and existing traces before editing. Reproduce the Greenhouse late-result failure and TomTom post-fill UI timeout separately.
2. Fix coordination and strict test assertions before expanding automation. Do not solve failures by increasing global timeouts or relaxing expected outcomes.
3. Keep regression tests for every fixed failure. Do not bypass the UI by injecting apply intents for the acceptance runs.
4. Run local checks, sync extension files, verify the running installed extension version, then execute the real button-driven matrix. Keep visible windows hidden unless requested.
5. Provide a report with per-case evidence, two consecutive final-build runs for each claimed supported flow, remaining failures and explicitly untested states. No universal perfection claim.
6. Never publish/send real applications as a test. Preserve user data and unrelated working-tree changes. Obtain any deployment approval required by repository instructions.

---

## Fixture / unit coverage map (not a release claim)

Updated 16 October 2026. **Fixture PASS ≠ real UI PASS.** Real localhost + installed extension + real vacancy matrix remains NOT TESTED until you run the quick checklist / F-series with evidence.

| Stress ID | Local coverage | Verdict |
|-----------|----------------|---------|
| A01 | `@accept` Apply with Odds desktop + Open tab | FIXTURE PASS |
| A02–A03 | `one click opens one tab; repeated clicks focus…` | FIXTURE PASS |
| A04 | STRESS six applications at once | FIXTURE PASS |
| A05 | Open tab edge cases `@accept` | FIXTURE PASS |
| A07 | OWNERSHIP no focus steal `@accept` | FIXTURE PASS |
| A08 | Reconnect label / Connect gate (unit + UI copy) | PARTIAL |
| A09 | Continue after reload `@accept`; reopen after close in edge cases | FIXTURE PASS |
| B01–B02 | Greenhouse/Lever/Ashby/Workday `@accept` + autofill compatibility | FIXTURE PASS |
| B04 | Broods field IDs stay attached… | FIXTURE PASS |
| B06 | Greenhouse CV filename assert `@accept` | FIXTURE PASS |
| B08 | person hold / You're filling in | FIXTURE / UNIT |
| B09–B10 | Review forbidden with empty required (drive fill + finish gate) | FIXTURE / UNIT |
| C02–C03, C11 | OWNERSHIP delayed/stale/duplicate `@accept` | FIXTURE PASS |
| C04 | driveDown 503 recovery e2e | FIXTURE PASS |
| C05–C06 | Continue after reload `@accept` | FIXTURE PASS |
| C07 | finish/stop cancels open commands (MCP + fake) | UNIT / FIXTURE |
| C10 | unchanged fill signature → strategy error in extension | CODE |
| D01 | cookie reject path; cookie≠human stop (humanStopAllowed) | UNIT / PARTIAL |
| D02–D04 | Account/Captcha/consent chips + never submit | FIXTURE / UNIT |
| D05 | ApplicationQuestions + Continue | PARTIAL (needs real UI) |
| E01 | tracker merges duplicate employer links | FIXTURE PASS |
| E03–E05 | Review gate; 404 Closed; wrong-job `@accept` | FIXTURE PASS |
| E07–E08 | submits===0; late result rejected | FIXTURE PASS |
| F01–F10 | REAL_BROODS matrix + `docs/apply-platform-matrix.md` | **NOT TESTED** on this build (needs credentials + two real passes) |

## Evidence report (this build)

| Field | Value |
|---|---|
| Build / extension | branch `broods-drive`; extension manifest **0.15.45** |
| Coordination fix | Migration `20261016160000_drive_command_ownership.sql`; gated `drive-result`; cancel on finish; typed abandon (`never_started` / `result_lost` / `document_changed`) |
| Strict oracle | REAL path asserts fields/CV/required/human evidence + `fill_ms`/`ui_ms`/`drive_runs.steps` (not log.length) |
| UX contract deltas | 15s quiet waiting; Wrong job / Your consent chips; tab-closed → **Reopen application tab**; wrong-job copy |
| Local checks run | Unit ownership/status PASS; **`bun run e2e:accept` → 34 passed**; **`bun run e2e:stress` → 7 passed**; extension synced to `~/Downloads/odds-extension` as **0.15.45** |
| REAL_BROODS / F01–F10 | **NOT TESTED** here — no `REAL_SR_KEY_FILE` in this environment (cannot drive live Broods against production DB from this agent) |
| Platforms claimed supported | **None** (fixture/stress green ≠ real employer matrix) |
| Remaining | Apply ownership migration on the project; you reload extension 0.15.45 once; optional one personal smoke. Real F01×2 still needs the service-role key path for REAL_BROODS |

**Do not treat this section as product sign-off.** No universal one-click claim.
