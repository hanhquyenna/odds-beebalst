# Handoff: finish the apply forms, then build the new Odds panel

Branch `broods-drive`. Read first: docs/HANDOFF-APPLY-LOOP.md, docs/PLAN-APPLY-FIX.md (section 5), and the memory files in `~/.claude/projects/-Users-kien-Documents-Files-odds-beebalst/memory/`.

## Rules (from the owner)
- Never press Submit. Never type a password or create an account yourself. Never solve a captcha.
- Never print or save secrets. The service key only goes through `REAL_SR_KEY="$(sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p' .env.secrets | tr -d "\"'")"`.
- Do not use any password the owner pasted in chat earlier.
- Check `git status` first. Ask before committing, deploying the web app (merge to main deploys it) or merging. Commit by hunk; the tree has uncommitted work from other sessions.
- Answers favour the person for skills, tools, years and willingness. Only identity and legal facts (right to work, visa, degree, university, grades, languages) come strictly from the profile. Name order does not matter.
- The owner designs by screenshot, writes in capitals, and wants plain words, no jargon.

## 1. Forms first (the owner's priority: "form perfect")
- A full 49-job round (round 13) was started on 2026-10-18 08:51:49Z: log `research-data/jobcheck/loop/round13.log`, start marker `research-data/jobcheck/loop/round13.start`. It may still be running (`pgrep -fl "playwright test e2e/extension.spec.ts"`). Do not edit `extension/` files while it runs; it loads them.
- Command used: `REAL_FILL_MS=300000 REAL_SR_KEY=… REAL_BROODS=1 REAL_JOBS_FILE=research-data/jobcheck/set3.json CI=1 bunx playwright test e2e/extension.spec.ts --project=desktop -g "REAL: Broods drives" --workers=3 --retries=0 --reporter=line` (kill any stale vite on :4319 first).
- Score it: `REAL_SR_KEY=… python3 research-data/jobcheck/score_rest.py research-data/jobcheck/loop/round13.start`. Report a table by platform: ended right, reached review, failures. Previous full round: 83% ended right, 37% review. No full round has been verified since the fixes (Workday multi-select, Greenhouse city, Ashby yes/no, closed guard, IMC stall).
- Still open: PwC month/year date boxes and university search; Picnic portfolio/GitHub (only the owner has them); CrowdLED/IMC recheck; LinkedIn Easy Apply panel status; sponsorship / right-to-work as a hard fact from the profile (unanswered question to the owner: as a non-EU student, does an NL internship need employer sponsorship or does the university agreement cover it?).
- Uncommitted but not yet synced: `extension/apply-any.js` now shows one line for a closed job ("This job is closed: it no longer takes applications.", no repeated sentence). Syntax-checked only.

## 2. The new design (Claude Design canvas, private to the owner)
https://claude.ai/artifact/VNHhhM4ipmgFJXyeBNCgKy — source files in the earlier session's scratchpad (`design/project/*.dc.html`, `canvas.json`); read the artifact with the Artifact tool (`action: read`) to get them. Boards:
1. Job page (panel) 2. Filling 3. Needs you + Saved to Autofill 4. Ready to send (with Job insights) 5. Other websites 6. Badge on the job page 7. Badge while Odds works 8. Job closed 9. Where the three on-page buttons lead 10. Notifications.

Decisions made:
- Orange (#EE7A2A) big button carries the status. Sand panel background (#F1EBE2), white cards, flat colours, no glows or gradients, no black notification backgrounds.
- Interview chance: a clean ring with the number and "interview chance" under it. No Low/Strong label, no "See how to raise it", no "N of M keywords". Keywords: green solid pills (in your CV), white dashed-orange pills with + (missing), small (about 26–28px).
- Tailor my CV with AI under the CV card and the same under the cover letter (same design). In v1 it only scrolls to the documents section; no AI rewrite tool exists yet.
- Job card: real company logo, bookmark button quiet until clicked, then orange, with a "Saved to your job list · Undo" bar (also shown at the ready stage).
- "See job insights" row shows overlapping photos of people you know. Job insights = three sections with one header format: Company (LinkedIn, Wikidata, company site; tiles employees, net worth, revenue, growth), Reviews (Glassdoor), People (LinkedIn; groups Hiring managers, Same team, Other; each person has an add-to-people-list button and Message). Each has "See all ›". Show source as small circle logos beside the source text.
- Similar jobs list under the cover letter (real jobs with real logos from `public/logos`), visible on scroll.
- Needs you: questions answered in the panel; answers then save to Autofill automatically ("Saved to Autofill", each with Edit, link to all answers). Ready screen: no report tiles.
- Page badge row on job sites: only **Auto apply** (orange pill with the odds mark); a card under the header with ring, keyword pills, Tailor my CV with AI, Open job insights. All of them open the panel (Auto apply starts the application; Tailor scrolls to Your CV; Insights scrolls to Job insights).
- Notifications: orange = filling (also "Filling your details from Autofill"), yellow = your turn, green = ready, white = saved, blue = sent, red = problem/closed. Wording is plain: "Odds is filling this page / Please leave the page as it is."
- Corner badge while Odds works has a small living mascot (eye that blinks, hopping orange dot) and a Stop button; red frame around the page.

## 3. What Broods/the extension can actually do
Agent tools: read_page, click, click_at, fill, options, type_text, press_key, scroll, back, screenshot, upload_cv, upload_letter, write_letter, open_job, note_site, finish (review / needs_you / stuck). It cannot press Submit, type passwords, solve captchas or tailor a CV. Does not exist yet: a Stop filling command from the panel, AI tailoring, the Edit button on saved answers, people-hired-before data, company/people/reviews for every job, read job title/company/logo from page JSON-LD when Odds has no posting. The extension already detects the site's thank-you text and marks the job applied (apply-any.js `SENT`).

## 4. Build order
1. Panel in `src/components/ApplyPanel.tsx` (+ `src/lib/embed.ts`, `extension/panel-frame.js/css`): boards 1–5 and 8. Then run `bun test src`, `bunx tsc -b`, panel e2e (`-g "panel"`) and look at `test-results/ext-apply-panel*.png`.
2. On-page badge row/card and notifications in the extension (`apply-any.js`, `apply.js` for LinkedIn).
3. Stop filling (cancel command), Edit for saved answers, people-list button, then Tailor.
Extension release: bump `extension/manifest.json` (now 0.15.87), `bash scripts/build-extension.sh`, `rsync -a --delete extension/ ~/Downloads/odds-extension/` and re-apply the three localhost:5173 dev-preview edits (panel-frame.js ODDS const, panel.html iframe src, manifest content_scripts match for `http://localhost:5173/*`).
Deploy MCP: `bunx supabase functions deploy mcp --project-ref gdavxkaioqlfvfunmtxd --use-api` (check `bun build --no-bundle supabase/functions/mcp/drive.ts` first). Broods: `bun ./node_modules/.bin/broods deploy --project odds-apply`.

## Build progress (updated)
- Round 13 (49 jobs) finished: 44 scored, ended right 79% (was 83%), reached review 36% (was 37%): no gain. Failures: PwC date/university boxes, Picnic graduation selector, IMC (two Greenhouse forms: market-news answer, study year), Eurofins (Indeed sign-in only), Homerun yes/no labels, Catawiki (test browser closed).
- Done in `src/components/ApplyPanel.tsx` (tsc clean; panel e2e passes; e2e text updated to "Your cover letter"): status-only button text, bookmark circle (orange when kept), interview chance ring with "N in 100" and keyword pills from the engine checklist, CV card + Tailor, cover letter card + Tailor (Tailor still scrolls to documents), "Saved to Autofill" (auto-keeps answers shown at review, each with Edit). Not yet committed.
- Not built: Job insights as three stacked sections (Company/Reviews/People with See all), Similar jobs list in the panel, people-hired-before row, Change picker sheet, page badge row + mascot + notification colours, Stop filling, web app screens (jobs list two-pane with top-5 match group and Preferences, job tabs, tracker, documents, autofill, people), Autofill setup ring with mascot.
- Design source: boards 1-20 in the Claude Design artifact; the generator scripts were in the earlier session's scratchpad `design/gen/*.py`.
- Removed from the design on purpose: hide-on-this-site switch; Follow up and Did you hear back cards on the tracker (they live on Home); applicants count; card grid jobs page.
