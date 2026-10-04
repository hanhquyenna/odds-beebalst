#!/bin/sh
# Bundles the app's job filters (src/lib/filters.ts) for the morning-jobs edge function, so the morning message
# counts jobs exactly as the app does. Run after changing the filters, then deploy morning-jobs.
set -e
cd "$(dirname "$0")/.."
bun build supabase/functions/morning-jobs/match.src.ts --target=browser --format=esm --outfile supabase/functions/morning-jobs/match.js
