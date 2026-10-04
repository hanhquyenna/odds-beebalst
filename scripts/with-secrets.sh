#!/bin/sh
# Shows which secrets are set (never prints a value). Load them first with:  set -a; . ./.env.secrets; set +a
for name in SUPABASE_ACCESS_TOKEN APIFY_TOKEN TYPESAFE_API_KEY; do
  eval "value=\${$name:-}"
  if [ -n "$value" ]; then echo "$name: set"; else echo "$name: MISSING (ask the owner to add it to .env.secrets)"; fi
done
