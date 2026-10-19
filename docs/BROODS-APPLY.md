# Broods Apply (script + agents)

Odds Chrome extension = hands (clicks/fills in your logged-in tab). Broods = brain (structured `apply_pick`). Never Submit / password / captcha — those stay human.

## Agents

| Agent | Role | Id (production) |
| --- | --- | --- |
| `apply-stuck` | Fast pick from extension snapshot (`cx/gpt-6-luna` through 9router) | `js74p8xs10efctdq5ynrkm6fmn8gagn5` |
| `apply-roam` | Free-roam browse when the snapshot pick is empty (`cx/gpt-6-luna` through 9router; Obscura browser in a Lambda sandbox) | `js76rgrnz12qj43ys5qcnfwnm18gadsy` |
| Sandbox `apply-web` | Obscura browser for roam | `m97d9856v8btgvawps2gkhp9jh8gbtag` |

Ladder: extension rules and recoverFill, then Broods odds-apply (`cx/gpt-6-luna`: apply-stuck, then apply-roam), then a person (account, captcha, submit). Apply, fill, and answer decisions do not call an OpenAI mini model.

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
# odds-apply uses cx/gpt-6-luna through 9router (NINE_ROUTER_BASE_URL). Apply decisions do not call OpenAI.
bunx broods deploy --project odds-apply

bunx supabase login
sh scripts/set-apply-broods-secrets.sh
bunx supabase functions deploy apply-agent --project-ref ukpmpyfcnbhngkgbnkxi --use-api
```

Definitions: [`broods/index.ts`](../broods/index.ts).  
Edge: [`apply-agent/index.ts`](../supabase/functions/apply-agent/index.ts).

Do **not** point `APPLY_AGENT_WEBHOOK_URL` at Broods.
