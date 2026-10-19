#!/usr/bin/env bash
# Push Broods apply-stuck credentials into Supabase Edge secrets.
# Requires a valid SUPABASE_ACCESS_TOKEN in the environment or .env.secrets.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_LOCAL=.env.local
SECRETS=.env.secrets
last() { python3 -c "import re,sys; t=open(sys.argv[1]).read(); vals=re.findall(r'^%s=[\"\\']?([^\"\\'\\n]+)'%sys.argv[2], t, re.M); print(vals[-1] if vals else '')" "$1" "$2"; }

# Prefer an already-exported SUPABASE_ACCESS_TOKEN. Only fall back to .env.secrets
# when unset (stale tokens there often 401).
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" && -f "$SECRETS" ]]; then
  tok="$(last "$SECRETS" SUPABASE_ACCESS_TOKEN)"
  [[ -n "$tok" ]] && export SUPABASE_ACCESS_TOKEN="$tok"
fi

API="$(last "$ENV_LOCAL" BROODS_API_KEY)"
SIG="$(last "$ENV_LOCAL" BROODS_USER_TOKEN_SECRET)"
AGENT_ID="${APPLY_AGENT_BROODS_AGENT_ID:-js74p8xs10efctdq5ynrkm6fmn8gagn5}"
ROAM_ID="${APPLY_AGENT_BROODS_ROAM_AGENT_ID:-js76rgrnz12qj43ys5qcnfwnm18gadsy}"
PROJECT_REF="${SUPABASE_PROJECT_REF:-ukpmpyfcnbhngkgbnkxi}"

[[ "$API" == bsk_* ]] || { echo "missing BROODS_API_KEY in .env.local"; exit 1; }
[[ "$SIG" == bsig_* ]] || { echo "missing BROODS_USER_TOKEN_SECRET in .env.local"; exit 1; }
[[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]] || { echo "missing SUPABASE_ACCESS_TOKEN — run: supabase login"; exit 1; }

ARGS=(
  "APPLY_AGENT_BROODS_API_KEY=$API"
  "APPLY_AGENT_BROODS_AGENT_ID=$AGENT_ID"
  "APPLY_AGENT_BROODS_USER_TOKEN_SECRET=$SIG"
  "APPLY_AGENT_BROODS_BASE_URL=https://gateway.broods.app"
)
[[ -n "$ROAM_ID" ]] && ARGS+=("APPLY_AGENT_BROODS_ROAM_AGENT_ID=$ROAM_ID")

bunx supabase secrets set "${ARGS[@]}" --project-ref "$PROJECT_REF"

bunx supabase functions deploy apply-agent --project-ref "$PROJECT_REF" --use-api
echo "Done: Broods secrets + apply-agent deployed."
