# Application reliability repair plan

16 October 2026. Inspection-based plan; acceptance criteria below are not claims of completed fixes.

## Findings

- Greenhouse latest run ed50a0a8-f625-4bc1-a350-da9abb2f2b01: type_text rejected because no active field; background screenshot unavailable; options/read calls later lacked timely results; a fill result arrived after Stuck. This proves coordination failure. It does not yet isolate the exact cause of the dropped response.
- MCP waits 25 seconds for a command, then navigation can wait another 25 seconds. Content script next-request timeout is 35 seconds and result delivery retries four times. These independent clocks have no shared command deadline/document generation. A late mutation/result can outlive the agent's conclusion.
- Background screenshots deliberately refuse to switch the person's active tab. The agent must have a reliable structured fallback; screenshot availability cannot be assumed.
- Custom dropdown selected-value detection and field IDs had bugs. Source fixes exist, but the latest full real-site rerun has not validated them consistently.
- TomTom latest agent reached filled details/CV and human consent. The browser case subsequently timed out at 16.2 minutes. That duration is not application-fill latency. Inspect trace to locate UI wait; do not assume product success.
- Earlier test oracle accepts review/needs_you/signin without validating actual field values or a valid reason. It can pass a cookie-handling failure. Log.length counts results as well as commands and must not be called model steps.
- Oracle test URL resolves to a different employer/job; discovery/identity validation failed. A wrong job is not evidence the intended job is closed.
- Real tests replace app/backend transport with fixtures and synthetic identity. They test real employer pages and real Broods, but do not prove the personal localhost/installed-extension path.

## 1. Make one application run dependable

Instrument run ID, command ID, tab ID, document generation, accepted/start/complete timestamps, agent finish and UI update. Distinguish model time, queue time, browser time and post-fill UI time. Never log personal field values in the report.

Use an explicit command lifecycle. Navigation transfers ownership to the resulting document; only one consumer may take a command. A timeout must report whether action never started, document changed, or result was lost. Reconcile before retrying a mutation. Cancel obsolete queued work when a run ends; reject late results from older document generations. Resume the exact tab.

Acceptance: delayed result, navigation, reload, disconnected extension and duplicate poll tests each yield one action, one truthful outcome, no late mutation after Stop and no focus change. Restore the connection and continue the same tab.

## 2. Verify the browser action actually worked

Implement/test focused ATS adapters starting with Greenhouse and Lever, then Ashby and Workday. Verify selected values, uploaded file names and required-field validation after each batch. Prefer typed field tools over unanchored type_text. Detect repeated unchanged page/field state and change strategy once; surface a specific failure if recovery fails. Use structured observation when background screenshots cannot be captured safely.

Acceptance: Greenhouse country/phone ReactSelect, conditional field insertion, CV upload, multi-step navigation and consent all have direct DOM assertions. No empty required field may produce Review. Terms, captcha, credentials and final submission stay human.

## 3. Make job identity and human stops accurate

Check employer/title/requisition identity after redirects before entering personal data. Follow legitimate employer application links. Treat genuine job-specific 404/expired notices as Closed; classify wrong-job links, network failures and security checks separately.

Allow human stops only with observed evidence: sign-in/account, captcha/security, consent, or a specific unanswered personal/motivation question. Cookie reject and ordinary widgets are automation tasks. Store confirmed reusable answers in profile; do not infer visa/work authorization or invent motivation.

Acceptance: Oracle wrong-job case stops before filling; real 404 closes; network error does not close; login resumes same tab after person signs in.

## 4. Repair the UI test oracle before more broad runs

First fix application UI setup and the exact Open tab locator/state transition. Bound individual UI waits so a missing button fails promptly, not after 16 minutes. Separate fill completion timestamp from subsequent UI assertions.

Tests must assert actual field values, CV attachment, remaining required fields, evidence for human stop, exact tab identity, no focus steal, no final submission and reload/resume. A terminal label alone never passes a test. Read model steps from drive_runs, not command/result log length.

Acceptance: one complete Apply → real form → truthful result → Open exact tab → reload → Continue case passes twice on the same supported employer before expanding.

## 5. Expand with a coverage matrix

Run Greenhouse and Lever first until repeatable. Then Ashby and Workday. Finally LinkedIn, Indeed and Glassdoor in signed-out and signed-in states where available; never automate security checks. Test one real supported job per platform plus targeted fixtures for widgets/navigation/failures. Freshly validate each job URL before running.

Use synthetic applicants and prevent final submit. Keep tests hidden unless the person explicitly requests a visible demonstration. Preserve per-case screenshots, trace, run ID, actual model steps, fill duration, total UI duration and exact remaining blocker. Run twice after the final fix set; compare like-for-like stages and profile data.

## Release gate

Do not call this universal one-click apply. Release only the platforms whose complete button-driven flow passes twice, with unsupported forms showing a clear actionable state. Synchronize installed extension files and verify its running version after reload. Verify actual localhost UI/installed extension separately from fixture transport when browser access is available. Backend and agent deployment alone are not evidence the installed extension is current.

## Optimization order

Remove browser/queue failures first; deterministic verified prefill second; eliminate redundant model reads third; learned site recipes only after independently verified successes. Do not promote a lesson merely because an agent said it succeeded. No speed claim until equivalent successful runs are compared.
