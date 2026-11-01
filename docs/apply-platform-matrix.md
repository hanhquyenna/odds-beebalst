# Apply platform coverage matrix

Release gate for Apply reliability (Oct 2026 repair). Platforms ship only after **two** like-for-like button-driven passes with artifacts.

## Order

1. Greenhouse  
2. Lever  
3. Ashby  
4. Workday  
5. LinkedIn / Indeed / Glassdoor (signed-out and signed-in where available)

## Per platform

| Platform | Fixture `@accept` | Real job (REAL_BROODS=1 + REAL_UI_BUTTONS=1) | Pass 1 | Pass 2 | Notes |
|----------|-------------------|-----------------------------------------------|--------|--------|-------|
| Greenhouse | `greenhouse-basic.html` | `job-boards.greenhouse.io/dept/…` | | | Prefer fill/options/upload_cv; cookie reject |
| Lever | `lever-location.html`, `lever-karl-custom.html` | `jobs.eu.lever.co/tomtom/…` | | | Location typeahead + custom cards |
| Ashby | `ashby-yesno.html` | `jobs.ashbyhq.com/prosus/…` | | | Yes/No buttons |
| Workday | `workday-delayed.html` | Signify Workday URL | | | Delayed fields + listbox |
| LinkedIn | Easy Apply path | board signed-out + signed-in | | | Never automate security checks |
| Indeed | board signed-out | | | | Sign-in wall = human stop |
| Glassdoor | board signed-out | | | | Sign-in wall = human stop |

## One pass checklist

- [ ] Fresh URL check (listing still open; not a wrong-job redirect)  
- [ ] Synthetic applicant only; `submits === 0`  
- [ ] Artifacts: screenshot, drive-trace, run id, `drive_runs.steps`, `fill_ms`, `ui_ms`, blocker  
- [ ] Chain: Apply → fill → truthful status → Open exact tab → reload → Continue  
- [ ] Strict oracle (not terminal label alone): field values / CV file name / remaining required **or** evidenced human stop  
- [ ] Installed extension version matches build; localhost path verified separately from fixture transport  

## Commands

```bash
# Fixture ownership + ATS widgets
bunx playwright test e2e/extension.spec.ts --grep '@accept'

# Real Broods (costs model calls); UI chain with Open tab
REAL_BROODS=1 REAL_UI_BUTTONS=1 REAL_SR_KEY_FILE=… bunx playwright test e2e/extension.spec.ts --grep 'REAL: Broods drives greenhouse'

# Trace a run (no PII values)
bun scripts/drive-trace.ts <run-id>
```

## Release rule

Do not claim universal one-click apply. Ship only rows with two full passes. Unsupported forms must show a clear actionable state (`needs_you` / `stuck` with evidence).
