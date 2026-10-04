#!/bin/sh
# Deploys the Shoo Google sign-in bridge (supabase/functions/verify-shoo). The token comes from the environment, never from a file here:
#   set -a; . ./.env.secrets; set +a; sh scripts/deploy-shoo-bridge.sh
# The bridge's origin list is an Edge Function secret (SHOO_APP_ORIGINS, comma-separated site origins), set once like:
#   supabase secrets set SHOO_APP_ORIGINS=https://odds.example --project-ref ukpmpyfcnbhngkgbnkxi
# The value is never stored in the repo.
set -e
cd "$(dirname "$0")/.."
: "${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN}"
supabase functions deploy verify-shoo --project-ref ukpmpyfcnbhngkgbnkxi --use-api
