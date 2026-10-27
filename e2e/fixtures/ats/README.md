# ATS fixtures for Apply @accept

Reproduce live Apply misses here as HTML before patching. One fixture per widget kind:

- `lever-karl-custom.html` — Lever card questions (`application-label` + Type your response)
- `lever-location.html` — Lever Current location typeahead (`#selected-location`)
- `ashby-yesno.html` — Ashby button Yes/No
- `ashby-yesno-drive.html` — Ashby Yes/No as one choice for Broods fill (aria-pressed + active class)
- `typeahead-school.html` — search select that lists options only for a short prefix
- `react-select-unkept.html` — dropdown whose input takes text but whose single-value never commits
- `aria-invalid-date.html` — date box that marks a bad shape aria-invalid
- `next-below-fold.html` — Next (aria-label only) appears after a scroll to the bottom
- `greenhouse-basic.html` — Greenhouse label/for, ReactSelect-style country, CV, privacy consent, conditional field
- `workday-delayed.html` — Workday delayed fields + `data-automation-id` listbox

Rule: new production bug → add/extend a fixture + `@accept` test → then patch.
Prefer extending a widget handler over a one-off employer regex.
