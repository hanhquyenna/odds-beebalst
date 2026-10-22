# Handoff: one-click applying (odds)

Written 15 October 2026 for the next agent (or person) to pick this up cold. Everything here is in this repository unless it says otherwise.
No secret value is written in this file; it says where each one lives.

## 1. The goal

A student presses **Apply with Odds** once. The employer's own application opens in a new tab right beside the current one, and odds fills it in
(details, CV, the questions every form asks), goes through the steps, and **stops for the person** at what only they can do:

- a **captcha**, **logging in**, **choosing a password / creating an account**,
- **ticking terms and consent boxes** and pressing **Submit**. Odds never presses Submit and never types a password.

The ideal end state the owner wants: **AI agents in the loop, working with the script.** The script (deterministic code) does the clicking and
verifying; an AI layer decides what an unknown question or an unknown widget is and writes new recipes. See section 9.

Rules of thumb the owner gave: maximum convenience; plain words in the interface (no jargon, no explanatory captions); questions that do not change
a chance may be answered by default; only motivation-type questions need the person; the product targets the Netherlands; prefer the employer's own
site over LinkedIn.

## 2. Where things are

| What | Where |
| --- | --- |
| Web app (React, Tailwind, Vite, Bun) | `src/` (components in `src/components`, logic in `src/lib`) |
| Chrome extension (Manifest V3) | `extension/` (manifest version 0.14.0 at the time of writing) |
| Rules for filling forms (pure, tested) | `supabase/functions/_shared/apply-form.ts` |
| Facts read from the profile/CV | `supabase/functions/_shared/application-personal.ts` |
| The standard answers (the field list) | `supabase/functions/_shared/application-answers.ts` and `src/lib/application-answers.ts` (two lists, a test fails when they differ) |
| Server (edge functions) | `supabase/functions/{account,drive,jobs,mcp,profile}`; the extension and Claude talk to `mcp/server.ts` |
| Database | Supabase (Postgres), migrations in `supabase/migrations/` |
| Browser tests | `e2e/` (Playwright, loads the real extension) |
| Unit tests | `src/**/*.test.ts` (`bun test src`) |
| Real-form research | `scripts/mine-ats-questions.ts` and the live audit test in `e2e/extension.spec.ts` |

The extension's rules file `extension/job-sites.js` is **built**, not edited: run `sh scripts/build-extension.sh` after changing
`supabase/functions/_shared/job-sites.ts`, `apply-form.ts` or `scripts/extension-sites.ts`. A unit test fails when the built copy is stale.

### Extension files
- `background.js`: service worker. `openApplication()` opens the application tab beside the asking tab; `kitFor()` asks the server for the person's details
  the moment Apply is pressed (so they are ready when the form is); intents (which tab is applying to which job, and its last status) are kept in
  `chrome.storage.local` key `oddsApplyIntents`; phone-queued runs are polled from `application_runs`.
- `content-site.js`: bridge on the odds site (`https://odds.beeblast.co/*` and `http://localhost:5173/*`): "prepare-application", "application-status", the key handshake.
- `content-job.js` + `content-job.css`: the percentage badges and the button on job sites (drawn like the app's chips).
- `apply.js`: LinkedIn (Easy Apply dialog; for jobs applied for on the employer's site it reads LinkedIn's own apply address and opens that in the same tab).
- `apply-any.js`: the engine for every other site (employer forms, Greenhouse, Lever, Ashby, Workday-style dropdowns). Fills, reads values back to check,
  goes through Next/Continue/Review while a step is complete, stops at questions it cannot answer, at passwords, at terms.
- `application-handoff.js`: declines cookie banners (never accepts) and publishes unanswered questions to the app so the person can answer them there.
- `panel.html`, `panel-frame.js`, `panel.js`: the side panel / in-page panel framing the odds app.

## 3. Data and database

Project ref: `ukpmpyfcnbhngkgbnkxi` (public; also in `docs/DEPLOY.md`). The app's public URL and anon key are in `.env.local`.

Tables used by applying (all rows are per user, protected by row-level security):
- `application_answers`: one row, `data` jsonb of the standard answers (the keys in `ANSWER_KEYS`).
- `application_questions`: the person's own earlier answers to other questions (`question_key`, `answer`); some keys are job-specific by design.
- `application_prompts`: questions an application stopped at, shown in the app to answer (`posting_id`, `questions` jsonb).
- `application_runs`, `application_desktops`: the phone-to-desktop queue (request, claim by a connected extension, status, cancel, continue, resume).
- `documents`, `job_documents`: the CV (main CV, and a CV put on one job); the file is fetched by the extension through `/ext/file`.
- `postings` (the jobs; base table is not in the migrations), `applications` (stage per job: applied, interview, offer, hired, rejected, no_reply, withdrawn),
  `chance_snapshots` (applied date and outcome date, used for "days to a first reply"), `job_people` (people at employers).

Server routes the extension uses (all in `supabase/functions/mcp/server.ts`, authorised by the person's extension key): `apply-kit` (the facts and the CV
for a job), `application-questions`, `answers` (GET and POST), `applied`, `peek`/`add`/`analyze` (percentages), `file`, `session`, application-poll/report/resume.

The facts the server sends (`apply-kit`) are built as `personalFromProfile` + `educationFromProfile` + `workFromProfile` + the saved answers (saved wins),
plus `job_source`, `applied_before`, `adult`, `never_worked_here`. School, degree, field, graduation, year of study, student status, current job title and company
are **derived from the CV's parsed profile**, so the person is not asked for them.

### Migrations that matter and may not be applied in production
Check with `supabase migration list --project-ref ukpmpyfcnbhngkgbnkxi` before assuming:
`20261014100000_application_questions`, `20261014114440_remote_application_queue`, `20261014213316_claude_desktop_application`,
`20261014223000_parallel_application_tabs`, `20261014234000_application_question_handoff`, `20261014235247_application_continue`.
`20261015064739_outreach_relationship_evidence` belongs to another workstream (people), see section 10.
Without them the phone queue and the question handoff show errors or empty states in production.

## 4. Environment and secrets (names only)

- `.env.local` (gitignored): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public), `VITE_BETA_GROUP_URL`. Load with `set -a; . ./.env.local; set +a`.
- `.env.secrets` (gitignored; template `.env.secrets.example`): `SUPABASE_ACCESS_TOKEN` (CLI deploys and migrations), `SUPABASE_SERVICE_ROLE_KEY`, `APIFY_TOKEN`.
  **Never print, log or commit these.** The owner once pasted an Apify token into a chat: it should be rotated.
- Planned for the AI layer (do not exist yet): `ODDS_AGENT_URL` and `ODDS_AGENT_KEY`, set as Supabase function secrets
  (`supabase secrets set ... --project-ref ukpmpyfcnbhngkgbnkxi`), never in the extension or the repository.

## 5. Deploy

- **Web app**: pushing to `main` runs `.github/workflows/deploy-odds.yaml` (S3 + CloudFront) when `src/`, `public/`, `index.html` or build files change. CI is `ci.yml`, CodeQL runs too.
- **Edge functions**: not part of that workflow. `supabase functions deploy <name> --project-ref ukpmpyfcnbhngkgbnkxi --use-api` (see `docs/DEPLOY.md`).
- **Migrations**: `supabase db push` (14-digit versions; two files with one version break it).
- **Extension**: not published. The owner loads it unpacked from `~/Downloads/odds-extension`. After changing `extension/`, run
  `rsync -a --delete extension/ ~/Downloads/odds-extension/` and the owner presses reload on the card in `chrome://extensions`, then reloads the tabs.
- Nothing has been pushed to `main` since commit `7246c76` unless a later commit says so. Order when pushing: apply migrations, deploy functions, then push.

## 6. How to test

```
bun run check                       # tsc, oxlint, knip, unit tests (do not chain a commit after it with ';': it can fail and you commit anyway)
bun run e2e:accept                  # USER-ACCEPTANCE gate: syncs extension → ~/Downloads/odds-extension, then Playwright @accept
                                    # (Apply with Odds / Open application tab only — no applyFrom intent injection)
bunx playwright test                # all browser tests (builds the app and serves it on port 4319)
bunx playwright test e2e/extension.spec.ts --project=desktop -g "Workday application in French"
```
- **Acceptance rule**: a fix for Apply is not done until `bun run e2e:accept` is green. Those tests press the same Odds buttons the person presses. Do not claim “bulletproof” from `applyFrom` / worker.evaluate-only paths — those skip the real handoff races.
- **Never silent Filling**: if the script cannot move, Broods must confirm (suggest-answers / suggest-action / suggest-scan) before any Stuck chip. Heartbeats keep the Odds button on Applying… while Broods works. Stuck only after assist.
- After `extension:sync`, the owner still reloads the unpacked card on `chrome://extensions` once (Playwright loads `extension/` from the repo; Chrome loads `~/Downloads/odds-extension`).
- A stale preview server on port 4319 serves an OLD build and makes tests lie. Check `lsof -i :4319` and kill it before trusting a result.
- Some extension tests are flaky under load (they pass alone). Two older tests hit the live production site.
- Fixtures worth knowing: the Kraft Heinz French Workday-style form (dropdown buttons, Oui/Non, terms to tick), a Booking.com-style form (unlabelled privacy
  choice, residence country, province, address, a password), Greenhouse/Lever/Ashby markup, six cookie-banner styles, a multi-step form, a thank-you page that
  marks the job applied, cookie consent boxes inside a form that must be left alone.
- **Live audit of real forms**: `set -a; . ./.env.local; set +a; REAL_FORMS=1 REAL_FORMS_N=24 bunx playwright test e2e/extension.spec.ts --project=desktop -g "live audit"`
  loads real Greenhouse application pages from the jobs database one at a time, with the extension and made-up details, never presses anything, and prints which
  required fields are still empty. `REAL_FORMS_URL=<page>` (or `REAL_FORMS_URLS=a,b`) audits chosen pages and prints the extension's bar.
- **Question research**: `bun scripts/mine-ats-questions.ts` lists the application questions of the Greenhouse jobs in the database, how many the rules answer,
  and which common ones they do not. This is the loop: pick the most common unanswered question, write the rule, add a unit test, rerun the audit.

## 7. What has been built (commits on top of 053b526)

`2db7e36`, `7246c76`: panel button follows the application's tab; student answers; thank-you page marks a job applied.
`5eb36df`, `e12cd2b`, `ab9d54e`, `f67d577`: Autofill tab, finish-setup panel, job page with Overview/Company/People/Documents tabs, Tracker/People/Companies as their own
pages, Home as the dashboard with Insights, the in-app Apply button following the application like the panel's, setup trust screen.
`4fba56e`: rules mined from real Greenhouse questions; false answers fixed; French/Dutch/German wording; Workday-style dropdown buttons; safe defaults for
background and preference questions; animated apply card; tab opens beside; details and CV prefetched at click.
`58a4d25`: facts read from the CV; apply on the employer's own site before LinkedIn; a form that needs a password is **not** "ready"; extension also on `localhost:5173`.
Uncommitted work of this workstream at the time of writing is listed in section 10.

## 8. Findings you should not rediscover

- Greenhouse's job-board dropdowns (react-select) open only on the **full pointer sequence on the control box** (pointerdown, mousedown, pointerup, mouseup, click on the
  element whose class contains `control`); a lone mousedown on the input opens nothing. The chosen value sits in a sibling `single-value` box, so "is it filled?" must look
  there. Some lists (city, school, discipline) fill their options from typing: type the answer and take the suggestion.
- Rules must prefer precision: a question put as a question ("Have you...", "Are you...") is never answered with a URL, hours or a city; "without visa sponsorship"
  and "valid visa" mean the opposite of "need sponsorship"; "if not listed, please specify" follow-ups are left empty; "when did you graduate" (past) is not the future date.
- In the database (3,526 open jobs): LinkedIn about 1,640, Magnet.me 559, Workday 337, Greenhouse 239, Ashby 76, SmartRecruiters 51, Indeed 118, Glassdoor 154.
  Only Greenhouse (and partly Ashby/SmartRecruiters) expose their questions without logging in. Workday and LinkedIn Easy Apply cannot be mined without applying.
- The Workday dropdown handling (`button[aria-haspopup="listbox"]`) is built from the markup of a fixture and the owner's pasted page text; it has **not** been
  verified against a real Workday page (applying there needs an account). The owner's Chrome with the extension is the place to verify (the `claude-in-chrome` tools, if available).
- Greenhouse mining result: 136 jobs, 13 employers, 299 distinct questions; rules answer about half of all question instances. Live audit of 23 real forms: about half have
  nothing left but checkboxes, files and the terms; the rest were short on Education start/end dates (now handled), "how did you hear" lists without LinkedIn (now
  falls back to the nearest honest option), and some forms that did not start in a long run (not yet explained: they start when run alone; suspect tab intent
  matching in `applyFrom`, which falls back to the last tab because `tab.url` is hidden for sites without host permission).

## 9. The AI layer (cloud agent webhooks — built)

The AI **plans and checks; the script clicks**. Shared helper: `supabase/functions/_shared/apply-agent.ts`. Secrets on the `mcp` Edge Function.

| Secret | Role |
| --- | --- |
| `APPLY_AGENT_WEBHOOK_URL` | Point at **`…/functions/v1/apply-agent`** (sync). Empty = off. Do **not** point at Broods (async-only). |
| `APPLY_AGENT_WEBHOOK_SECRET` | Bearer Odds → apply-agent (required on the function). |
| `APPLY_AGENT_BACKEND` | `webhook` when URL set, or force `none`. |
| `OPENAI_API_KEY` | Preferred on **apply-agent** (`gpt-4o-mini`). Shared across users; rules + `apply_agent_action_patterns` absorb repeats. |
| `APPLY_AGENT_MODEL` | Default `gpt-4o-mini`. Keep cheap — do not set a flagship model. |
| `ANTHROPIC_API_KEY` | Fallback if no OpenAI key (haiku). |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Optional on **apply-agent** for gaps beyond rules. |
| `APPLY_AGENT_FORWARD_URL` | Optional Broods async URL; apply-agent fans out lifecycle pings. |
| `APPLY_AGENT_BROODS_API_KEY` | Broods runtime key (`bsk_…`) for Apply agents. |
| `ODDS_DRIVE_AGENT_ID` | The one Broods agent, `odds-apply` (see `broods/index.ts`): it drives runs and answers `apply-agent` picks. |
| `APPLY_AGENT_BROODS_BASE_URL` | Default `https://gateway.broods.app`. |

Edge Function `apply-agent` (`supabase/functions/apply-agent`): bearer auth; lifecycle → `200`; `suggest-answers` → rules first (`apply-form`, zoekjaar → no sponsor), then optional LLM; returns `{ answers: [...] }` in the same request.

Lifecycle (fire-and-forget, 3s timeout): after successful `apply-kit` → `apply.started`; after `application-questions` → `apply.questions`; after `application-report` with `needs_input` / `ready` / `failed` → `apply.status`. Payload includes host, ats, posting_id; never the extension key, full CV, or passwords.

Suggest path: extension publishes questions, then once calls `ext/suggest-answers`. Server POSTs `{ type: "suggest-answers", questions, facts }` (4s timeout), validates `{ key, answer, confidence, evidence }` (option match, deny-list, length, confidence ≥ 0.55), writes accepted rows to `application_questions`, logs `apply_agent_events` (daily cap 50 suggests/user). Extension refreshes remembered answers and refills. On timeout/off, the person sees the outlined questions as before.

Audit table: `apply_agent_events` (+ RPC `apply_agent_suggest_count_today`). Recipe PRs for `apply-form.ts` stay out of band; Odds only stores audit rows.

Still true: page text is data, never system instructions; agent returns answers only, never click actions; captcha / account / Submit stay human-only. Claude MCP tools (`answer_application_questions`, etc.) remain available without the webhook.

## 10. Working tree warning: two workstreams share this folder

Another session is changing the **people / outreach** code in the same working tree and sometimes edits the same files. Their files at the time of writing
(do not commit them with yours): `src/components/People.tsx`, `PersonAvatar.tsx`, `icons.tsx`, `src/lib/suggest.ts`, `people-function.test.ts`, `people-groups.test.ts`,
`supabase/functions/jobs/people.ts`, `supabase/functions/_shared/outreach-contact.ts`, `supabase/migrations/20261015064739_outreach_relationship_evidence.sql`,
`scripts/audit-outreach-data.ts`, `scripts/find-people.ts`, `e2e/smoke.spec.ts`. They also touched setup/insights files (`SetupCard.tsx`, `SetupPanel.tsx`, `SetupGraphic.tsx`,
`Autofill.tsx`, `Insights.tsx`, `Documents.tsx`, `setup.ts`, `setup-questions.ts`, `types.ts`, `ProfileReview.tsx`, `insights-period.ts`): read their diff before editing.

Commit hygiene that worked: **never `git add -A`**; stage by path; when a file holds both workstreams, stage only your hunks by writing your version to a blob
(`git hash-object -w` then `git update-index --cacheinfo`); verify the exact staged tree in a separate copy (`git checkout-index -a --prefix=/tmp/verify/`,
link `node_modules`, run `bunx tsc -b`, `bun test src`, `bunx playwright test` there) before committing. Co-author line on commits:
`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Push only when the owner says so.

## 11. Next steps, in order

1. Explain and fix the forms that do not start in a long audit run; make `applyFrom` in the tests match the tab by page, not "last tab".
2. Verify the Workday listbox handling against a real Workday page in the owner's Chrome (up to the password/account step, never past it).
3. Cover letter upload (a cover letter attached to the job is not uploaded yet), and the Greenhouse "Acknowledge/Confirm" style acknowledgements (these stay the person's).
4. Deploy `apply-agent` + set secrets: `APPLY_AGENT_WEBHOOK_SECRET`, point `mcp`'s `APPLY_AGENT_WEBHOOK_URL` at `…/functions/v1/apply-agent`, optional `ANTHROPIC_API_KEY` / Broods `APPLY_AGENT_FORWARD_URL`.
5. Apply migrations (`apply_agent_events`), deploy `mcp` + `apply-agent`, push when asked (section 5). Then run the live audit again and record the numbers here.

## 12. Prompt to give an agent

> You are continuing the one-click applying work in the odds repository (`/Users/kien/Documents/Files/odds-beebalst`). Read `docs/HANDOFF-APPLY.md` first, then
> `docs/DEPLOY.md`. The goal is that Apply with Odds opens the employer's application in a tab beside the current one and fills it in until only a captcha, login or
> password, the terms, and Submit are left: those are the person's, and you must never press Submit, type a password, or solve a captcha. Work in this loop: run
> `bun scripts/mine-ats-questions.ts` and the live audit (`REAL_FORMS=1 bunx playwright test e2e/extension.spec.ts --project=desktop -g "live audit"`), pick the most common
> thing that is still not filled, fix it in `supabase/functions/_shared/apply-form.ts` (rules, with a unit test) or `extension/apply-any.js` (mechanics, with a fixture test),
> rebuild with `sh scripts/build-extension.sh`, rerun the tests, and commit only your own files by path. Keep precision above coverage: a wrong answer on a real
> application is worse than a question left for the person. Never print or commit anything from `.env.secrets`. Plain words in the interface, no explanatory captions.
> Two sessions share this working tree (section 10): do not stage or revert the other workstream's files. Cloud-agent webhooks are in (section 9); wire Broods via Supabase secrets when ready.
