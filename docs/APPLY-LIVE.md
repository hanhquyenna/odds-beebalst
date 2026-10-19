# Live Apply golden set

`bun run apply:live` checks the checked-in job list in `fixtures/apply-live/golden-set.json`. It fetches each posting and scores whether the page opened, whether a closed verdict is allowed, and whether Odds would navigate somewhere that was not on the page or in the job record. It never presses Submit, and it does not launch Chrome.

On the Mac, where Broods and 9router are running, the same command is the fast check before a deploy. A full extension dry-run is a separate Chrome session with the unpacked `extension/` folder, model `cx/gpt-6-luna` through the local 9router tunnel. That session must not press Submit.

```bash
bun run apply:live
bun scripts/apply-score-gate.ts
```

The scorecard is `docs/apply-live-scorecard.md` and `fixtures/apply-live/latest.json`. `fixtures/apply-live/baseline.json` is the last accepted score. The tunnel helper and `scripts/set-apply-broods-secrets.sh` refuse their deploy step when the new score is lower. Neither command is run by CI.

To turn a real `drive_runs` id into a fixture:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun scripts/drive-run-fixture.ts <run-id>
```

To list job-closed events whose page URL does not match the stored posting, without changing any row:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun scripts/list-false-job-closures.ts
```

Events saved before `page_url` existed cannot be classified by that script.
