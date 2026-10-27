#!/bin/sh
# Bundles the app's job filters and "Jobs that fit you" rule (src/lib/filters.ts, src/lib/fit-filters.ts) for the jobs edge function (/jobs/morning), so the morning message
# counts jobs exactly as the app does. Run after changing the filters, then deploy jobs.
set -e
cd "$(dirname "$0")/.."
bun build supabase/functions/jobs/match.src.ts --target=browser --format=esm --outfile supabase/functions/jobs/match.js
