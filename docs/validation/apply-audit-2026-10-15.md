# Apply validation — 15 October 2026

## Scope and result

This is a bounded audit, not certification of every employer or every job in the database.
No application was submitted. Passwords, CAPTCHA, security checks and legal consent were not completed.

## Changes made during this audit

- Employer popup links stay in the application's background tab without temporarily activating it.
- The website receives success only after Chrome confirms opening or recovering a tab; errors no longer disappear behind a permanent Filling state.
- Stopped and older runs retain their existing application tab. Recovery can find the same application path while preserving identifying query parameters.
- Resuming one vacancy retires duplicate activity records without closing the other page.
- Consent and terms checkboxes remain the person's choice. Agent clicks cannot treat a form consent block as a cookie banner.
- Reinjection replaces an old progress bar. Embedded LinkedIn profile widgets do not run the LinkedIn application controller.

## Evidence

- Final browser fixture suite: **28 passed**, approximately 1.3 minutes. Real unpacked extension plus mocked employer pages/backend; includes user-facing Odds buttons.
- Additional consent and expired/missing-intent recovery regression: **2 passed**.
- Final recovery/focus/reload rerun: **3 passed**.
- Live-discovered Lever AJAX upload regression plus missing-form and known-gap checks: **3 passed**.
- Live deployed Broods synthetic decision checks: **32 passed**, no failed cases. This verifies decisions against supplied cases, not 32 live employer sites.
- Focused activity/view/source units: **14 passed**.
- Full unit run: **1,115 passed; 2 failures and 1 error reported**. Outstanding suite issues include a stale five-function backend-shape assertion and an incomplete document mock when loading Sonner.
- Production build succeeded during browser-test startup. Full check is not green: lint also reports existing hook issues in App, Account and Connections.

## Live Chrome observations

The Karl Lagerfeld Lever application had the CV and contact fields filled. The original Open application tab action created a duplicate; after the fix, the actual button selected the existing Lever tab without another blank or duplicate tab. Extension reload retained the page and entered values. The stopped-run Open button also selected the same tab.

Live testing also exposed conflicting progress from duplicate runs and a LinkedIn embedded profile widget, addressed above. This remains a reason to test real pages in addition to fixtures. Lever's visible location input was blank despite a nonempty hidden location selection; that widget should be reviewed before claiming complete field coverage.

## Covered fixture families and outcomes

LinkedIn Easy Apply and offsite handoff, Lever location/custom questions, Ashby choice buttons, Greenhouse labels, Workday delayed controls and French resume step; LinkedIn/Indeed/Glassdoor login walls; security walls; stalled/no-op Apply; empty pages; cookie decline; form consent exclusion; reload/Continue; background focus; exact Open tab; known-answer gaps and Broods escalation.

## Remaining validation

- Every database job has not been opened and tested against its live employer form.
- CAPTCHA, account/password and security verification remain explicit human steps.
- Live employer pages can change independently of fixtures and agent decisions can fail. An agent response is not proof the DOM changed.
- Full-repository checks above need separate repair before an all-green release claim.

## Localhost UX click run

With the installed extension reloaded, clicked the actual localhost Finance Intern Apply with Odds button. Chrome opened LinkedIn job 4460294747 in a background tab and followed its real Apply link to Karl Lagerfeld Lever application 3c44d986-8067-439c-a877-5b89b9856278. Contact details and CV were filled. Clicking Open application tab selected that exact tab (2048400645); no second Finance application tab appeared.

This live run found an additional bug: Lever clears its native file input after a successful AJAX upload. The completion check now requires the visible success indicator and named attachment rather than repeatedly treating that as a missing CV. The installed extension was updated/reloaded and the same application resumed through localhost.

## Location fix follow-up

Read Lever's public retrieveLocations.js implementation: its debounced search is scheduled by keydown, while input only opens the dropdown. Odds now sends keydown and waits up to four seconds for actual suggestions instead of erasing the query after 900 ms. The fixture now searches on keydown and delays results 1.6 seconds.

The live Finance Intern form selected Amsterdam, NLD after clicking Open application tab on localhost with the extension reloaded. Clicking the page heading moved focus away and the selected city remained visible. No manual suggestion selection was used for this pass; diagnostic typing was cleared before the extension retry.

Updated the controller's loaded-build guard to allow the new code to replace a previous injected build. Optional empty social links no longer trigger unnecessary agent answer searches after all required and known fields are completed.

The live form ultimately reached "Filled in by odds. Check everything, then send it yourself." with Amsterdam, NLD retained. Four targeted follow-up browser regressions passed (delayed keydown location, AJAX CV upload, reload recovery and known-gap Broods escalation). Screenshot: output/apply-audit/04-location-fixed-live.png. The localhost status was observed lagging behind the employer form during these runs; this report does not certify all cross-tab status synchronization.

## Final passing UI check

The completion loop previously kept running after Ready and later triggered the stall watchdog. Successful claimReady now exits the loop. The AJAX-upload regression holds the Done state for 3.5 seconds to catch this regression. Four final targeted browser tests passed (33.1 seconds).

With the installed extension reloaded, the actual localhost Open stuck tab button resumed the existing Finance application. Both the employer bar and localhost reached Ready to review. Clicking the actual Open tab: review and send button selected existing Chrome tab 2048400645, not a duplicate. The city remained Amsterdam, NLD. Final screenshots: 04-location-fixed-live.png and 05-localhost-ready.png. Nothing was submitted. Earlier observed status oscillation was fixed in this follow-up.
