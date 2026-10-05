# Deploying odds, and adding real sign-in

For whoever deploys odds. State on 5 Oct 2026. CI: `.github/workflows/ci.yml` (type check, lint, tests, build, bundle budget). Repo: `hanhquyenna/odds-beebalst`, branch `main`.

## 1. The web app

- Build: `npm run build` (type check, then `vite build`; output `dist/`). It passes.
- Hosting is S3 + CloudFront at https://odds.beeblast.co (terraform in `beeblastco/infra`,
  pipeline in `.github/workflows/deploy-odds.yaml`). The single-page fallback, the cache split
  (hashed assets immutable for a year, everything else no-cache), and the manifest content type
  all live there — keep them together if hosting ever moves:
  `/sw.js` must be served from the site root with `Cache-Control: no-cache`, and `/manifest.webmanifest` as
  `application/manifest+json`.
- Environment variables for the build (both public, safe in the browser):
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Nothing else is needed in production.
- The site must be on **https** at a **fixed address**: iPhones only install and notify from https, and every phone's
  notification registration is tied to the address it was made on.

## 2. Supabase (project `ukpmpyfcnbhngkgbnkxi`)

Everything below is already live. CI only has to keep it that way.

- **Edge Functions**: deploy with `supabase functions deploy <name> --project-ref ukpmpyfcnbhngkgbnkxi --use-api`.
  `supabase/config.toml` sets which functions are open (`verify_jwt = false`) and which need a signed-in user; the
  CLI reads it, so do not add `--no-verify-jwt` by hand and do not drop that file. If `phone-link` or `morning-jobs`
  ever require a sign-in, QR codes, guest accounts and the morning message stop working.
- **Function secrets** (set in Supabase, never in the repo): `VAPID_KEYS`, `VAPID_PUBLIC_KEY`, `VAPID_CONTACT`,
  `MORNING_SECRET`, `CHECK_SECRET`, `PUBLIC_CHECK_SECRET`, `APIFY_TOKEN`, `APIFY_JOB_TOKEN`, `TYPESAFE_API_KEY`,
  `DAILY_LIMIT`, `ANON_LIMIT`, `GLOBAL_LIMIT`.
- **Migrations**: every file in `supabase/migrations` has a unique version and is recorded as applied, so
  `supabase db push` has nothing to do today. New migrations need a new 14-digit version
  (`YYYYMMDDHHMMSS_name.sql`); two files with the same version break `db push`.
- **Scheduled jobs (pg_cron)**: the hourly open/closed checks, and `morning-jobs` at 06:00 and 07:00 UTC (it only
  sends on the run where it is 8:00 in Amsterdam, so summer and winter time both work).
- **morning-jobs** uses the app's own job filters, bundled into `supabase/functions/morning-jobs/match.js`. After
  changing `src/lib/filters.ts`, run `scripts/build-morning-jobs.sh` and deploy `morning-jobs`.

## 3. Sign-in: Google through Shoo, and guest accounts

Sign-in is Google only, through Shoo (`src/lib/shoo.ts`, `src/components/ShooCallback.tsx`), bridged to a normal
Supabase session by the `verify-shoo` function so every row-level policy keeps working.

- To switch it on: set the secret `SHOO_APP_ORIGINS` to the site's origin(s), comma-separated
  (`supabase secrets set SHOO_APP_ORIGINS=https://your-domain --project-ref ukpmpyfcnbhngkgbnkxi`), then
  `sh scripts/deploy-shoo-bridge.sh`. `config.toml` keeps `verify-shoo` callable before sign-in (it checks the Shoo
  token itself).
- In Supabase, Authentication, URL Configuration: set Site URL to the production address and add it (with `/**`) to
  Redirect URLs. Today the Site URL is `http://localhost:3000`.

**Guest accounts.** Anyone who imports their LinkedIn, or turns on notifications from the Home Screen icon, without
signing in gets a guest account automatically (address `guest-…@guest.odds.invalid`, no password), so their profile,
phone and morning message work. When they then sign in with Google, `ShooCallback` calls `adoptGuest()` before the
new session is used: the guest's profile (unless the Google account already has one), phones, applications and cached
readings move to the Google account in one database transaction (`public.adopt_guest`, via the `phone-link`
function, which checks both sign-ins). Guest accounts are capped at 20 per connection per day.

## 4. The phone flow, for reference

- Computer: bell, then "Add to your phone", shows a QR code (one-time code, 15 minutes). The phone opens odds signed in.
- iPhone in Chrome or another app: jumps to Safari, signed in. In Safari: Share, Add to Home Screen.
- The Home Screen app keeps its own storage, apart from Safari. While the steps are open in Safari, the address
  carries a one-time code (30 minutes) so the icon opens signed in; `index.html` gives iPhones a manifest without a
  start address so the icon opens that address.
- On the icon: "Turn on notifications", Allow, and a "You're set" notification arrives at once.
- `public/sw.js` shows the notification and opens `/?open=new-jobs` when it is tapped.

## 5. Leftovers from testing (safe to remove)

- Table `client_events`: a step log used while testing on a phone; nothing writes to it any more.
- About ten guest accounts made during testing on 4 and 5 Oct.
- Phones registered on the temporary test links stop working when those links go away; they register again on the
  real address.
