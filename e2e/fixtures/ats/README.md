# ATS fixtures for Apply @accept

Reproduce live Apply misses here as HTML before patching. One fixture per widget kind:

- `lever-karl-custom.html` — Lever card questions (`application-label` + Type your response)
- `lever-location.html` — Lever Current location typeahead (`#selected-location`)
- `ashby-yesno.html` — Ashby button Yes/No
- `greenhouse-basic.html` — Greenhouse label/for
- `workday-delayed.html` — Workday delayed fields + `data-automation-id` listbox

Rule: new production bug → add/extend a fixture + `@accept` test → then patch.
Prefer extending a widget handler over a one-off employer regex.
