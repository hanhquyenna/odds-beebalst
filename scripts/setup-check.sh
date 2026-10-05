#!/usr/bin/env bash
# One command that switches the hourly "is it still open?" check on:
#   SUPABASE_ACCESS_TOKEN=... bash scripts/setup-check.sh
# It adds three columns to postings, deploys the jobs function (its /jobs/check route), sets its secret (generated here, never printed
# or saved to a file) and schedules it every hour, in four slices a few minutes apart, with pg_cron.
set -euo pipefail
REF="ukpmpyfcnbhngkgbnkxi"
cd "$(dirname "$0")/.."
: "${SUPABASE_ACCESS_TOKEN:?Set SUPABASE_ACCESS_TOKEN in this command (a personal access token). It is used once and not stored.}"
set -a; . ./.env.local; set +a

sql() {
  python3 -c 'import json,sys; print(json.dumps({"query": sys.stdin.read()}))' | curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" --data-binary @-
}

echo "1/4 columns..."
sql < supabase/migrations/20261002120100_posting_checks.sql
echo

SECRET="$(openssl rand -hex 24)"
echo "2/4 secret..."
supabase secrets set "CHECK_SECRET=$SECRET" --project-ref "$REF"

echo "3/4 deploying jobs..."
supabase functions deploy jobs --project-ref "$REF" --use-api

echo "4/4 schedule (every hour, four slices at :00 :05 :10 :15)..."
{
  echo "create extension if not exists pg_cron; create extension if not exists pg_net;"
  echo "select cron.unschedule(jobid) from cron.job where jobname like 'check-postings-%';"
  for i in 0 1 2 3; do
    echo "select cron.schedule('check-postings-$i', '$((i * 5)) * * * *', \$cmd\$select net.http_post(url := '$VITE_SUPABASE_URL/functions/v1/jobs/check?slice=$i&of=4', headers := jsonb_build_object('x-check-secret', '$SECRET', 'Content-Type', 'application/json'), timeout_milliseconds := 150000)\$cmd\$);"
  done
} | sql
echo
echo "Done. First run is at the next :00, :05, :10 or :15. To run one slice now:"
echo "  curl -X POST -H 'x-check-secret: <the secret>' '$VITE_SUPABASE_URL/functions/v1/jobs/check?slice=0&of=4'"
