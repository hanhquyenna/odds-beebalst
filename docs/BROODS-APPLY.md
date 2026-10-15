# Broods Apply (script + agents)

Odds Chrome extension = hands (clicks/fills in your logged-in tab). Broods = brain (structured `apply_pick`). Never Submit / password / captcha — those stay human.

## Agents

| Agent | Role | Id (production) |
| --- | --- | --- |
| `apply-stuck` | Fast pick from extension snapshot (`gpt-6-luna`, reasoning none) | `js74p8xs10efctdq5ynrkm6fmn8gagn5` |
| `apply-roam` | Free-roam browse (obscura) when snapshot pick is empty (`gpt-6-luna`) | `js76rgrnz12qj43ys5qcnfwnm18gadsy` |
| Sandbox `apply-web` | Obscura browser for roam | `m97d9856v8btgvawps2gkhp9jh8gbtag` |

Ladder: rules → gpt-4o-mini → Broods stuck → Broods roam → human (account/captcha/submit).

## Status

| Piece | Value |
| --- | --- |
| Broods project | `odds-apply` / production |
| Verify stuck (`bun scripts/verify-broods-apply.ts`) | Next / cookie / captcha / account / closed / fill |
| Edge | `apply-agent` uses `broodsBestPick` (stuck, then roam) |

**Honest “perfect”:** Broods unblocks Apply/Next/cookies/fill and hands Captcha/Account to you. Status chips stay on the Odds script. Broods does not auto-Submit. Free-roam uses a cloud browser (no your LinkedIn cookies) for context; the extension still executes under your login.

## Deploy / refresh

```bash
cd /Users/kien/Documents/Files/odds-beebalst
bunx broods login
# OPENAI_API_KEY in .env.local
bunx broods deploy --project odds-apply

bunx supabase login
sh scripts/set-apply-broods-secrets.sh
bunx supabase functions deploy apply-agent --project-ref ukpmpyfcnbhngkgbnkxi --use-api
```

Definitions: [`broods/index.ts`](../broods/index.ts).  
Edge: [`apply-agent/index.ts`](../supabase/functions/apply-agent/index.ts).

Do **not** point `APPLY_AGENT_WEBHOOK_URL` at Broods.
