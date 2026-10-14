#!/bin/sh
# Builds extension/job-sites.js from supabase/functions/_shared/job-sites.ts and apply-form.ts, so the extension and the server read job pages and
# fill in forms by the same rules. The first line carries a fingerprint of those sources: src/lib/job-sites.test.ts fails when the built copy is
# older than them (a fingerprint, not the built text: another Bun version lays the same code out differently).
set -e
cd "$(dirname "$0")/.."
bun build scripts/extension-sites.ts --format=iife --target=browser --outfile extension/job-sites.js >/dev/null
sum=$(cat supabase/functions/_shared/job-sites.ts supabase/functions/_shared/apply-form.ts scripts/extension-sites.ts | shasum -a 256 | cut -c1-16)
printf '%s\n%s\n' "// Built by scripts/build-extension.sh from supabase/functions/_shared/job-sites.ts and apply-form.ts (sources ${sum}). Do not edit." "$(cat extension/job-sites.js)" > extension/job-sites.js
