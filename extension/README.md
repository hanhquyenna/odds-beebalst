# odds browser extension

Browse jobs with your Odds interview chance beside each visible job and beside the open job's own Save button, on:

- LinkedIn (worldwide), Indeed (every country site), Glassdoor, Magnet.me and AcademicTransfer: job pages and search lists;
- employers' job boards (Greenhouse, Lever, Ashby, SmartRecruiters, Workday, Personio, Recruitee, Teamtailor, Workable, JOIN): job pages and their lists;
- any other page that says it is a job for search engines (schema.org JobPosting), such as a company's own career site.

Click a percentage to view that exact job in the Chrome side panel (with an in-page panel fallback). Saved jobs open
without being saved automatically. Once connected, the toolbar icon opens the app directly in the side panel. Scrolling and in-page navigation update the badges, including recycled job cards.

odds takes the size and shape of the site's own button beside it (a 32px pill on LinkedIn, Indeed's 44px rounded square, Glassdoor's 40px
outlined square, a full-width row under Magnet.me's stacked buttons). In LinkedIn's lists it is the first of each card's round buttons (beside ✕), in Indeed's the first of each card's chips, on Glassdoor left of the card's Save.

A job odds does not hold yet is added to the shared list, so everyone sees it:

- LinkedIn: the extension reads the job from LinkedIn's public page of it (the one LinkedIn's guest job pages load, about 0.3 s, free) and sends that with
  the address. Where LinkedIn refuses that, odds reads the job itself (Apify, slow and paid), up to 30 such jobs per person per day.
- Everywhere else: the extension reads the job as the page shows it in your browser (its JobPosting, or the open job on Glassdoor, whose job
  pages stop scripts) and sends that with the address; odds reads the page itself instead where it can. Up to 300 such jobs per person per day.
  Jobs in every list are read as they come into view, three at a time (Glassdoor: ten to one request to its own /graph), so no job shows `?%` for long.
- The jobs in view are looked up in one request (up to 25), so a list fills in at once.

Badges contain only the percentage (`?%` for a job odds does not have yet); details and unavailable states appear on hover. A CV/profile is required for a percentage.
Closed jobs and failures display their status rather than an invented score.
Recent percentages are kept for 30 minutes across page reloads, so a list seen again fills in at once. Badge visibility uses IntersectionObserver, and unrelated page updates do not redraw settled badges.
On pages that are not jobs nothing is sent. The extension stores its own connection key in the browser.

Which addresses are jobs is decided by `supabase/functions/_shared/job-sites.ts`, the file the server uses too; `job-sites.js` here is built from it
by `scripts/build-extension.sh` (a test fails when it is out of date). What each site's pages look like is in `site-dom.js`.

Applying on LinkedIn (apply.js): press LinkedIn's Easy Apply as usual and odds fills the form in from what it knows (your odds profile, the standard
answers on your odds profile, your own earlier answers to other questions, the CV you put on this job in odds, chosen among LinkedIn's or uploaded),
goes on through the steps that are complete, and stops at the review: you check it and press Submit yourself. odds never presses Submit. A question
odds cannot answer is outlined in orange; what you answer is kept (table application_questions) and fills that question in on the next form. When
LinkedIn says the application was sent, the job is marked applied on your odds tracker. The rules for which answer fits which question are in
`supabase/functions/_shared/apply-form.ts`, built into `job-sites.js` with the job-site rules.

"odds apply" (a button under Apply on a job in the odds panel) opens the job in your tab and starts its application there: on LinkedIn odds presses
Easy Apply (classic modal or the newer job page's dialog), or opens the employer's own form in the same tab (where LinkedIn says the employer takes
applications, read from LinkedIn's page data in your session; else their Apply is pressed and followed into the tab it opens); anywhere else apply-any.js fills in the employer's form by its labels
(name, email, phone, LinkedIn, website, city, your standard and earlier answers) and puts your CV in its CV upload. Only in a tab opened that way,
for an hour; it never sends a form. Each job gets its own tab (pressing again returns to it with the filled fields kept). The form is
filled, read back to check the site kept it, and gone through step by step (Next/Continue/Review) while every field in the step is complete; it
stops at a question it cannot answer (outlined, and offered in the odds panel to answer: the answer is filled in and it goes on), at a login or
verification (named, in the tab), and at the end, where Submit is yours. Dropdowns (including searchable ones), radio groups, Yes/No buttons and
file uploads are supported. The panel's button shows where the tab is (Filling, Continue application, Complete step in browser, Review
application, Try again), and the state survives reloading the extension (not restarting the browser).
Cookie banners on the employer's site are declined for you (a "reject" or "necessary only" button in English, Dutch, German, French or Spanish, inside
shadow roots too; else the banner's close button), never accepted; a consent box inside the application form is left alone. The badges and the button beside
Save are drawn like odds' own chips (white, a line, ink lettering, a vermilion dot before the chance) and say Connect, Retry, Add CV, Check or Closed
where there is no number.

Try it now (Chrome): `chrome://extensions` → Developer mode → Load unpacked → pick this folder. Click the odds icon → Connect odds.
After an update, press the reload arrow on the extension's card there, then reload the job sites' tabs.

Tests: `bun run e2e` (e2e/extension.spec.ts loads it into Chromium, with pages built like each site's) and, against the real backend with a throwaway account,
`LIVE_MCP=1 bun test scripts/check-mcp.live.test.ts`. Indeed and Glassdoor turn automated browsers away, so their real pages are checked by hand in Chrome.

Chrome Web Store: zip this folder's contents (not the folder), upload at https://chrome.google.com/webstore/devconsole (a 5 USD developer account of
the owner is needed). The store asks for a privacy policy: it must describe automatic lookup of visible job URLs, reading a job's details from the page
when odds does not hold it, storing shared job details without saving to a personal tracker, and storing a connection key. The extension runs on all https pages (to find job
pages anywhere), which the store reviews more closely.


## Prepare from your phone (0.7.0)

Connect the extension to the same Odds account used on your phone. In the desktop panel enable **Allow this desktop to fill applications from my phone**.
On a job in the Odds web app, press **Fill on my desktop**. One dedicated, visible desktop tab opens and fills the application. The phone shows progress and questions needing attention; cancel closes that preparation tab at the next desktop check. Existing browser tabs are preserved.

The computer must be awake with Chrome running. With the panel open it checks immediately and every five seconds; otherwise it checks approximately every 30 seconds (browser scheduling may delay this). Requests expire after fifteen minutes. Different jobs can be prepared at the same time, each in its own tab; double taps on the same job reuse its request. Only one desktop claims each request. Turning phone control off stops preparation tracking and preserves filled tabs. No application field values or CV files are stored in this queue.

**Review and Submit remain in the desktop application form.** Phone confirmation/submission is not implemented. A CAPTCHA, login screen, unknown required question, or site-specific problem needs attention on the desktop. General employer forms report preparation, not a confirmed submission; LinkedIn is marked submitted only after its confirmation appears. These changes do not bypass job sites' automation policies or detection.

This version requires the `remote_application_queue` migration, the updated `mcp` function, and the updated Odds web app. The extension alone does not add phone controls to an older deployed web app.

## View first (0.8.0)

Percentage clicks open the selected job immediately without adding it to Saved jobs. Reading/enrichment continues into the shared database. The web app switches jobs inside the panel without reloading, and fetches newly enriched jobs individually. Documents can be chosen on unsaved jobs. Desktop website application preparation talks directly to the installed extension; phones use the opt-in desktop queue and show when no desktop is connected. Employer application handling ignores search/newsletter fields and skips optional newsletter signup. These web UI changes require deploying the updated web app.

### Verification and limits

Autofill reads values back after changing them, checks native validation and `aria-invalid`, verifies that a CV remains selected, and requires two clean checks before reporting a general employer form ready. A discarded value is retried once. Rejected uploads, unanswered required fields, required custom widgets and visible validation alerts pause preparation. LinkedIn checks filled questions and CV selection before advancing; phone country codes come from the saved international number.

The browser suite covers native field markup representative of Greenhouse, Lever, Ashby, Workday, Personio, Recruitee, Teamtailor and SmartRecruiters, plus LinkedIn's classic and newer Easy Apply forms and the employer handoff. These are controlled compatibility tests, **not certification of every live site or account configuration**. The Buzz employer application was also filled in the real browser in this conversation. Cross-origin embedded forms, shadow-root widgets, account creation, CAPTCHA and unsupported custom controls may need manual completion. Odds never sends an application automatically.

## Independent applications (0.9.0)

Apply with Odds always opens a new tab. Existing applications remain open, including when starting another job. Phone requests are tracked per request and per tab; cancelling one does not affect the others. Profile → Personal information shows contact details extracted from the saved profile/CV and accepts overrides for given/family names, email, phone, LinkedIn, address, city, postcode and country. Structured LinkedIn names are preserved; display-name order is never guessed.

0.9.1 preserves the delivery alarm across worker wakes, checks immediately on wake/panel opening, activates application tabs, and reports closed LinkedIn jobs as failed with the reason. Codex’s embedded browser does not load Chrome extensions; it uses the remote queue, and the application opens in desktop Chrome.

### Application continuation (0.9.3)

Apply with Odds opens one application tab per job. Clicking it again focuses that tab. Completed employer form steps advance through Next/Continue/Review; Submit is never pressed. Trusted embedded ATS forms (including Greenhouse) run inside their own frame.

Unanswered fields appear in the job panel and Profile → Application answers. Save and continue writes only the signed-in applicant’s answers; the extension checks for them while waiting, fills them, verifies them, and resumes. Visa, study, enrolment, relocation and availability answers are scoped to the vacancy; a different job asks again. General exact questions can reuse confirmed answers. Profile lets the applicant edit or forget remembered answers.

Claude can prepare_application, application_status, answer_application_questions and continue_application through the same private queue. The desktop must be connected with phone control enabled for remote commands. Login and verification remain manual browser steps.
