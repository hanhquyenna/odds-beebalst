# odds browser extension

Browse jobs with your Odds interview chance beside each visible job and beside the open job's own Save button, on:

- LinkedIn (worldwide), Indeed (every country site), Glassdoor, Magnet.me and AcademicTransfer: job pages and search lists;
- employers' job boards (Greenhouse, Lever, Ashby, SmartRecruiters, Workday, Personio, Recruitee, Teamtailor, Workable, JOIN): job pages and their lists;
- any other page that says it is a job for search engines (schema.org JobPosting), such as a company's own career site.

Click a percentage to save and open that exact job in the Chrome side panel (with an in-page panel fallback). Saved jobs open
without being added again. Once connected, the toolbar icon opens the app directly in the side panel. Scrolling and in-page navigation update the badges, including recycled job cards.

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

Try it now (Chrome): `chrome://extensions` → Developer mode → Load unpacked → pick this folder. Click the odds icon → Connect odds.
After an update, press the reload arrow on the extension's card there, then reload the job sites' tabs.

Tests: `bun run e2e` (e2e/extension.spec.ts loads it into Chromium, with pages built like each site's) and, against the real backend with a throwaway account,
`LIVE_MCP=1 bun test scripts/check-mcp.live.test.ts`. Indeed and Glassdoor turn automated browsers away, so their real pages are checked by hand in Chrome.

Chrome Web Store: zip this folder's contents (not the folder), upload at https://chrome.google.com/webstore/devconsole (a 5 USD developer account of
the owner is needed). The store asks for a privacy policy: it must describe automatic lookup of visible job URLs, reading a job's details from the page
when odds does not hold it, saving a job when its percentage is clicked, and storing a connection key. The extension runs on all https pages (to find job
pages anywhere), which the store reviews more closely.
