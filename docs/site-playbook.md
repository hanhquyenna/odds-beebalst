# Application site playbook

The extension fills exact contact fields and the selected CV before Broods starts. Existing answers are preserved. Snapshots mark deterministic fills `by: "odds"`. Action results include the current page; a navigation queues an internal page read without another model decision. Screenshots are at most 1280 pixels wide; sight coordinates are converted from that image to CSS coordinates.

Shared memory accepts a closed vocabulary: canonical Apply/Skip/cookie button labels, contact field keys, and typing/choosing/upload methods. Arbitrary labels, selectors, answers, names, emails, phone numbers and URL queries are rejected or stripped. Applicant values remain in the existing per-run context, not the shared playbook. Source run IDs stay private to service-role access and are removed from hints sent to agents and extensions.

Host and ATS scopes are combined without double-counting. Three independent successful runs activate a hint. Five successes, at least 0.6 confidence and no failure within 14 days permit a safe click recipe. Confidence has a 60-day half-life; three failures retire a lesson. A mismatching recipe returns control to Broods. The first two runs alone cannot legitimately promote a new recipe; do not fabricate five successes to demonstrate speed.

Both tables have RLS enabled and no user grants or policies. The advisory about RLS without policies is intentional: service-only storage. The recording RPC uses SECURITY INVOKER and is executable only by service_role. Its row lock prevents lost evidence and its unique run/host/fingerprint prevents repeated calls from increasing evidence.

For rollback, inspect site_lessons by run_id and fingerprint, retire the affected playbook item, and rebuild its evidence from the remaining site_lessons. Deleting a run alone does not rebuild the aggregate. General agent rule changes are reviewed code changes, never learned automatically.

## Verification

- Transactional live SQL check: five independent runs create one recipe; recording each run twice creates only five evidence rows. Rolled back all synthetic records.
- Verified anon/authenticated have no SELECT grant; service_role has access; both tables have RLS.
- Unit tests cover privacy, independent promotion, confidence decay, retirement, host/ATS deduplication and navigation returning a fresh page.
- Browser fixtures exercise deterministic prefill, fresh action pages, promoted recipe use, fallback, consent left human, and job-page 404 handling.

Real-site results and timing belong in the validation report. A browser fixture is not a real employer-site pass. The existing full unit/lint baseline has failures, which are compared separately from new failures.
