# Broods Apply (script + agents)

Odds Chrome extension = hands (clicks/fills in your logged-in tab). Broods = brain (structured `apply_pick`). Never Submit / password / captcha — those stay human.

## Agent

One agent, `odds-apply` (`broods/index.ts`, `cx/gpt-6-luna` through 9router), in two modes:

| Mode | When | How it answers |
| --- | --- | --- |
| Drive | the message has a `run_id` (`ODDS_DRIVE_AGENT_ID`, started by `mcp/drive.ts`) | odds-browser MCP tool calls in the person's tab until `finish` |
| Pick | no `run_id` (`APPLY_AGENT_BROODS_AGENT_ID`, from `apply-agent`) | one `apply_pick` JSON object as plain text, parsed by `parseBroodsPick` |

There is no forced output schema: the 9router model does not support one (Broods logged "JSON response format schema is only supported
with structuredOutputs" on almost every step, and "No object generated" ended turns), and in drive mode it pushed the model to answer
with JSON instead of a tool call. The old `apply-stuck` / `apply-roam` agents and the `apply-web` sandbox are gone.

### One agent per run

Every Broods turn of a drive run uses the conversation `odds-drive-<run id>`; a pick-up joins it (Broods steers it into a live turn).
When a run sends no step for 30 s, `drive-next` asks Broods whether the turn is still working (`broodsTurn`, the turn id is kept as a
`drive_commands` row with tool `broods`): still working → wait; ended without a tool call → pick it up again (up to 3 times); still
working after 2 minutes (`HUNG_MS`) → the run ends stuck, so a fresh press starts a new run the hung turn cannot touch.

### Sign-in walls

The first sign-in wall in a run is Broods' to try (the read result carries `sign_in_wall` and a `next` hint: Create account / Register
first, else Sign in with the login Odds saved; the extension fills the boxes). The second wall ends the run as `needs_you` / `account`.

### OpenAI mini audit

No unrelated runtime OpenAI or mini-model call was found. The remaining repository references are negative ladder tests, historical Broods issue notes, and the word `openai` in the employer-name classifier (`src/lib/tiers.ts` and its generated MCP bundle). The apply deployment script no longer reads, validates, or uploads `OPENAI_API_KEY`.

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
