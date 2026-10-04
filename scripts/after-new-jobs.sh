#!/bin/sh
# Run after ANY new jobs arrive (a search pull, Magnet.me, a pasted link, an upload): fills what is missing and then checks that everything shown is right.
#   set -a; . ./.env.local; set +a; SUPABASE_ACCESS_TOKEN=sbp_... sh scripts/after-new-jobs.sh [family.json] [industry.json]
# 1. field and industry for postings that lack them (the counting model and the employer map first; anything it cannot place is listed for a person to name)
# 2. a logo for every employer shown
# 3. the audit: the layout of every posting, the words kept, a logo, an industry and a field on every job in the list. It fails loudly if one is not.
set -e
cd "$(dirname "$0")/.."
: "${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN}"
T=$(mktemp -d)
bun scripts/classify-new.ts > "$T/plan.json"
python3 scripts/apply_classification.py "$T/plan.json" ${1:+--family "$1"} ${2:+--industry "$2"}
sh scripts/fix-missing-logos.sh
bun scripts/audit-display.ts
