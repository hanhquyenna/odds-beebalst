#!/bin/sh
# Builds extension/job-sites.js from supabase/functions/_shared/job-sites.ts, so the extension and the server read job pages by the same rules.
# src/lib/job-sites.test.ts fails when the built copy is older than the sources (job-sites.ts, apply-form.ts).
set -e
cd "$(dirname "$0")/.."
bun build scripts/extension-sites.ts --format=iife --target=browser --outfile extension/job-sites.js >/dev/null
printf '%s\n%s\n' "// Built by scripts/build-extension.sh from supabase/functions/_shared/job-sites.ts and apply-form.ts. Do not edit." "$(cat extension/job-sites.js)" > extension/job-sites.js
