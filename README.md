# odds

Jobs for international students in the Netherlands, and an AI agent that applies for them in your own Chrome.

This repository is being rebuilt. The tree now starts from the parts that live in integrations and are kept as they are:

- **Google sign-in** through Shoo: `src/lib/shoo.ts`, `src/components/SignIn.tsx`, and the Supabase bridge `supabase/functions/account/shoo.ts`
- **CI/CD**: `.github/workflows/` (checks on every push, web deploy to https://odds.beeblast.co, edge functions deploy)
- **The database**: `supabase/migrations/…_baseline.sql`, the whole public schema, so the project can always be recreated

Everything else is rebuilt on top of this, in the order set out in `docs/DEPLOY.md`.

```bash
bun install
cp .env.example .env.local   # put the project address and anon key in it
bun run dev
bun run check                # types, lint, unused code, unit tests
bun run e2e                  # browser tests
```

`scripts/dump-schema.ts` rewrites the baseline from a live project.
