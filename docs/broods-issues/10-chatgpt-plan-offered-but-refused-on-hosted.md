# Dashboard offers "Connect ChatGPT plan" on hosted projects, but the CLI refuses it there

## What happened
The OpenAI API account behind `odds-apply` ran out of credits (see issue 09). The dashboard showed a **Connect ChatGPT plan** card:
"Run this in a terminal signed in with broods login … `broods connect chatgpt`". Running it on the hosted project:

```
$ broods connect chatgpt
✖ ChatGPT plan usage is only available on self-hosted Broods for now. Use an OpenAI API key with the `openai` provider instead.
```

## Expected
- The dashboard only offers "Connect ChatGPT plan" where it works (self-hosted), or labels it "self-hosted only" on hosted projects.
- When the provider refuses for billing/quota, the dashboard points to the actual fix (top up the API account, or set another key with
  `broods env set OPENAI_API_KEY`), rather than a connect flow the project cannot use.

## Environment
broods CLI v0.50.0, org beeblast, project odds-apply, stage Production, hosted gateway.broods.app, provider openai (OPENAI_API_KEY).
