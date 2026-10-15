# Model settings (`reasoning`, `maxOutputTokens`, `temperature`) are untyped and not shown after deploy

- `defineAgent({ model: { reasoning, maxOutputTokens, temperature } })` are not in the published `.d.ts`, so there is no editor help on allowed values (e.g. gpt-6.1-sol rejects `reasoning: "none"`: OpenAI says only low/medium/high/xhigh/max).
- `broods agent get` shows only `Model: openai/gpt-6.1-sol` — not effort, token cap or output schema — so you cannot confirm what is live.
- Usage page shows `$0 / 0 tokens` for runs on a BYO OpenAI key, with no hint why.

## Suggested fix
Type the model block per provider (enums for reasoning effort), validate at deploy against the provider's allowed values, and print the full model block in `broods agent get`. Show BYO-key token counts in Usage (cost N/A).

_Environment:_ broods CLI v0.50.0.
