# Plan: make Apply with Odds finish every job (17 October 2026)

Goal: every job **ends right**. That means it reaches review (only Submit left, never pressed) or stops correctly (captcha, sign-in,
closed, email-only, or a question only the person can answer). It should do this with as few model calls as possible: the owner's
ChatGPT plan through 9router is the limit.

Where we are (round 4, the 49 fresh jobs in set3): ended right 83%, reached review 32%, 3.2 steps, 26 s, 230 model calls / 1.94M tokens in
(80% cached). Correct stops take 1 step. Runs that fail waste 5–6 steps.

## 0. What is wrong, by cause (all evidence from drive_commands)

| # | Cause | Seen on | Layer |
|---|---|---|---|
| 1 | A widget does not take the value and nothing tries another way (toggle buttons, masked dates, search boxes) | Ashby ×2, PwC (Phenom) | extension |
| 2 | Odds' page reader misses a real control (Next gone after a step; earlier: chat or cookie pop-ups hid Apply) | Homerun; fixed for PwC/Homerun step 1 | extension |
| 3 | Broods stops for questions it can answer (worked at / applied before, how did you hear, open questions) | Greenhouse IMC, Ashby Snowflake | rules + server |
| 4 | Broods gives up after 1–2 tries; the server accepts the stop | Ashby Prosus, Homerun | server |
| 5 | Nothing learned from failures: the next run repeats them | all | server + DB |
| 6 | Correct stops reached slowly: 4–6 clicks to reach a sign-in page | Workday ×4, Unilever ×3, Robeco, Accenture, Magnet | rules + server |
| 7 | A verification check tagged "other" instead of captcha | Indeed | server |
| 8 | Relay gaps: "tab stopped answering" (the step loop runs Broods → server → DB → extension) | Henkel/JRC before the fix; any slow page | architecture |
| 9 | The model ends a turn without a tool call; 9router streams stall | seen in logs | server nudges |
| 10 | Glassdoor / Indeed show a captcha before any form | 6 of 49 | data (employer links) |
| 11 | Test runs saved under the owner's account; the scoring mixes test and real runs | all rounds | test harness |
| 12 | One regression test fails (phone-request tab close), from uncommitted Cursor work | e2e:2941 | extension (Cursor's) |
| 13 | Nothing committed since `b0c37f2`: Cursor's and my changes are mixed in the working tree | repo | process |

## 1. Phases (in order, each ends with the regression suite and a 49-job round)

### Phase 1: widgets take values (causes 1, 2)  ·  extension `apply-any.js`
1. **Fallback ladder in `fill`** (no model calls). For a field that did not keep the value, try in order:
   a. the box's own format (placeholder/pattern: dates, numbers). Done and tested offline.
   b. typed key by key (masks, search boxes). Done.
   c. for search boxes (`combobox`/typeahead): type a short prefix, wait for the list, pick the closest option ("Vrije Universiteit Amsterdam").
   d. for choices: click the visible option (button, label, toggle) and verify (`aria-pressed`, `aria-checked`, checked, selected class).
   e. keyboard: focus, arrow to the option, Enter.
   Each fill result says which step worked (`via`), for learning (Phase 3).
2. **Yes/No button groups as questions.** Ashby and others render a question with two `<button>`s (Yes / No) and no input. read_page shows
   them as one field `{kind: "choice", options: ["Yes","No"]}` tied to the question text. `fill` clicks the button and verifies the pressed state.
3. **The page reader never loses controls.**
   - Homerun: find why "Next" disappears after step 1. Suspects: an off-screen sticky footer, `inScope` with a stale dialog, a button labelled
     only by an icon or `aria-label`. Fix in the button collector.
   - Rule: a step with required fields filled and no forward or Submit button gets one scroll to the bottom and a re-read before anyone says
     "no Next".
4. Verify: offline fixtures for each widget (Ashby yes/no, Phenom date, a typeahead school, Homerun step 2), then the real jobs.

### Phase 2: Broods finishes instead of stopping (causes 3, 4, 6, 7)  ·  `broods/index.ts`, `mcp/drive.ts`
1. **Answerable questions are sent back** (done: any answerable or open question, not only when all are). Add "worked at / employed by /
   applied before" (facts `worked_at_this_employer_before`; "applied before" = No unless Odds has an earlier application to this employer).
   That needs a lookup of the person's tracker by employer. Never invented: unknown means ask.
2. **Attempt budget before a stop.** needs_you questions/other and stuck are accepted only when:
   - every field the facts answer is filled (server checks `freshFields` against the facts), and
   - each failing field had at least 2 different fill attempts (counted from drive_commands).
   Otherwise one send-back with the exact list. Captcha, account, closed and email stay instant.
3. **Fast correct stops.** Sign-in walls detected at the first page that shows them (done: `signInWall`). Add the platform rule: Workday
   "Apply" → "Apply manually / Sign in / Create account" means a sign-in stop after the first click (1–2 steps instead of 4–6), and the
   same for Unilever (Eightfold sign-in) and Magnet's sign-up modal.
4. **Captcha tags.** Cloudflare, "additional verification" and DataDome messages → reason captcha (server regex, from the message and
   `page.captcha`).
5. Verify: a unit test for each guard (src/lib/drive-ownership.test.ts style), then the real IMC, Snowflake, Prosus and Workday jobs.

### Phase 3: learn from every run (cause 5)  ·  table `site_tactics` + `_shared/site-tactics.ts`
1. **What is kept:** per platform (greenhouse, ashby, workday, phenom, homerun…) or per employer host, and per kind of field (date, yes/no,
   search, phone, file, choice). For each: the tactic that worked (`via` from Phase 1, e.g. "date: MM/JJJJ typed"), with success and failure
   counts. Structure only, never a value.
2. **How it is used:** the extension gets the platform's tactics with the apply kit and tries the winner first (no model call). Broods gets
   them in `task.route` as hints.
3. **How it is kept honest:** promoted after 2 successes, dropped when failing more than working (as site_routes), a failure is recorded with
   the field kind and error.
4. **Failure signatures:** every non-right end is grouped by (platform, cause): widget refused / control missing / question / relay /
   captcha. These feed Phase 5.
5. Verify: round N+1 on the same jobs shows the same tactic used at once (fewer fill retries) and no repeat failure.

### Phase 4: the relay (causes 8, 9)
1. Short term (done): a page reached by Broods' own click belongs to the run (no silent wrong-job guard); a silent tab ends the run after two
   missed steps; quiet Broods nudged (30 s × 3).
2. Real fix (the handoff's item 1): **run the step loop in the extension.** The extension calls the model through the server (one proxied
   request per step). The server only checks tool calls and records them. No DB queue between Broods and the tab: no "tab stopped
   answering", about 1–2 s less per step.
   Steps: design note → model proxy endpoint (`/mcp/step`) → extension loop behind a flag → A/B on set3 → switch.
3. 9router stalls: a per-call timeout (60 s) in the proxy with one retry; a log line with the call's run id.

### Phase 5: the maintenance loop (keeps it working)  ·  `scripts/launchd`, `research-data/jobcheck`
1. Nightly: 30 random active jobs (new each night) plus the 17 tuned ones, with the test applicant, scored by `report.py`.
2. Daily per-platform report: ended right %, reached review %, steps, tokens, new failure signatures.
3. Alert (notification to the owner) when a platform drops more than 15 points or a new signature appears more than twice.
4. New signatures become a fix task (reproduce offline with REAL_FILL_URL, fix, add a fixture, rerun).

### Phase 6: Glassdoor / Indeed (cause 10)
Load the owner's Apify results (`research-data/jobcheck/apify_*.json`) into `posting_apply_links` (source apify), so these jobs open the
employer's form directly. Measure: the 6 captcha stops on set3 become employer-form runs.

### Phase 7: test hygiene and the repo (causes 11–13)
1. A separate test user (its own `user_id`) for every REAL run; `report.py` filters on it; the owner's tracker never shows test runs.
2. The failing phone-request test (e2e:2941): ask the owner's Cursor agent, or fix it with them, since it is their uncommitted change.
3. Commits: with the owner's OK, commit by hunk: mine separately from Cursor's, one commit per phase, never `dist/` or other sessions' files.

## 2. How each round is judged

| Metric | Now | Target after Phases 1–3 |
|---|---|---|
| Ended right | 83% | ≥ 95% |
| Reached review (of jobs that have a form we can reach without an account) | 14/19 | ≥ 90% |
| Avg steps (review) | 3.1 | ≤ 3 |
| Steps on a correct stop | 1–6 | ≤ 2 |
| Tokens per round (49 jobs) | 1.94M in | ≤ 1.5M |

## 3. Needs from the owner
- OK to commit (by hunk), and how to handle the Cursor agent's uncommitted work.
- The Apify output for Glassdoor/Indeed (Phase 6).
- Whether test runs may use a new test account (Phase 7.1).

## 4. Risks
- Fallback typing could fill a wrong option in a search box: a pick happens only when an option matches the answer closely (same words);
  otherwise the field is reported failed.
- The attempt budget must not keep Broods looping: at most one send-back per run, the step limit stays.
- Learning must stay structure-only: a tactic never holds an applicant value (same sanitiser as site lessons).
- Moving the loop into the extension is the biggest change: behind a flag, A/B before switching.

## 5. The side panel and the form, made reliable (17 October, night; from the YETI Workday test)

What the owner's real run on YETI (Workday) showed, and the fix for each. ✅ = done and tested offline; ⏳ = next.

| # | Seen on YETI | Cause | Fix |
|---|---|---|---|
| 1 | Job card shows the address, no logo/company | The Workday form's address (`/en-US/…%2C…/apply/applyManually`) is not the posting's link | ✅ apply-kit `formJob`: the run's posting, an address seen before, or the page title at an employer named in the host; learned into `posting_apply_links` (source `match`). ⏳ no posting at all: read JobPosting JSON-LD / og tags from the page and add the job |
| 2 | Names "required" though the boxes show text | Odds sent `blur`; React/Workday commit on `focusout`, and the page has no focus while the person is in the side panel | ✅ `type()` sends focusin/focusout (apply-any, apply.js); fixture test |
| 3 | "Confirm the five unlabeled questions" | Workday dropdowns name themselves "Select One Required" | ✅ placeholder labels replaced by the field's own question; fixture test |
| 4 | "The form reports errors, correct them in the tab" | Broods handed a widget problem to the person | ✅ server sends it back to Broods (widget guard) |
| 5 | "Closed" on a live job | Read before Workday drew the page | ✅ server accepts closed only when the page says so; stale bubble dropped when a form shows |
| 6 | Panel said "No application form" | Tab opened before the extension update ran the old script | ✅ the panel puts Odds' script on the tab once |
| 7 | How did you hear (Workday two-level menu) | Search box treated as text | ✅ Workday multi-select: search, pick, chip check |
| 8 | Sponsorship answered "No" with permit `other_non_eu` | Hard fact guessed by the model | ⏳ rule: sponsorship / right to work only from `permit` (+ study status); unclear → asked once, remembered |
| 9 | Values checked only by what the box shows | — | ⏳ after each field, the site's own error / `aria-invalid` counts as "not kept" → real input retry |

### Order of work
1. Hard facts by code (#8): permit → sponsorship, right to work, relocation; never the model's guess.
2. Site-error check after every fill (#9), per platform tactic learned.
3. Panel parity with Simplify: "Stay on this page" while filling, missing-fields count + Complete profile, Saved answers (review), resume/chance ring, people.
4. Job from the page when Odds has no posting (#1 rest).
5. Golden set: ~30 real forms on 8 platforms (Workday, Greenhouse, Ashby, Lever, SmartRecruiters, SuccessFactors, Phenom, Homerun) with the test applicant, never submitted. Done = every field correct and zero site errors at Review, two runs in a row. Every fix adds a fixture.
6. Nightly run on new jobs; new failure signatures become fixtures.
