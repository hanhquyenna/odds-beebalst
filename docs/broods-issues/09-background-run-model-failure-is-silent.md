# Background runs fail silently when the model provider refuses (no credits): the caller never learns why

## What happened
`odds-apply` runs are started with `POST /v1/runs` and `background: true` (202 accepted). On 2026-10-16 from 22:46 UTC the OpenAI
account behind the agent ran out of credits. Every agent loop then failed:

```
22:46:43.580 ERROR model.invocation.failed Agent loop failed after 887ms: You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.
22:49:00.638 ERROR model.invocation.failed Agent loop failed after 36720ms using odds-browser__options, odds-browser__read_page: You have no credits remaining. ...
22:49:00.646 ERROR model.invocation.failed Post-generation steps failed
```

These lines appear only in `broods logs`. The caller (our server, which started the run) gets nothing: no callback, no status it can
poll from the 202, and no MCP call. Our side only notices that no tool call arrives. After 100 s it retries (which fails the same way),
then shows the person a generic "Broods could not carry on". Two real applications sat on "Applying…" for minutes with no reason given.

## Expected
A background run that ends in error reports it to the caller with a machine-readable reason, so the product can say "the AI provider
is out of credits" right away. For example:
- a `GET /v1/runs/{id}` (or by `eventId` / `conversationKey`) returning `status: failed, error: { code: "provider_quota", message }`;
- and/or an optional `callbackUrl` on `POST /v1/runs`, called on completion or failure;
- a distinct error code for provider billing/quota failures (not retryable), separate from transient model errors.

## Also
- `Post-generation steps failed` follows the loop failure, with no detail.
- Starting a new background run while the provider refuses still returns 202. Failing fast (or a health/credits check endpoint)
  would let callers stop starting runs that cannot work.

## Environment
broods CLI v0.50.0, org beeblast, project odds-apply, stage Production, gateway.broods.app, model gpt-6.1-sol (reasoning medium).
