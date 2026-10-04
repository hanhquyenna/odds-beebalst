# Deploying odds, and adding real sign-in

For whoever wires up CI/CD and SSO. State on 5 Oct 2026. Repo: `hanhquyenna/odds-beebalst`, branch `main`.

## 1. The web app

- Build: `npm run build` (type check, then `vite build`; output `dist/`). It passes.
- `vercel.json` already sets the build, the single-page rewrites, and the headers the phone features need:
  `/sw.js` must be served from the site root with `Cache-Control: no-cache`, and `/manifest.webmanifest` as
  `application/manifest+json`. Keep both if you move off Vercel.
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

## 3. Real sign-in (SSO)

Today there is no sign-in form people use: anyone who imports their LinkedIn, or turns on notifications from the
Home Screen icon, gets a **guest account** automatically (address `guest-…@guest.odds.invalid`, no password). Their
profile, phones and applications live on that account.

When you add SSO:

1. **Redirect URLs.** In Supabase, Authentication, URL Configuration: set Site URL to the production address and add
   it (with `/**`) to Redirect URLs. Today the Site URL is `http://localhost:3000`, which is wrong for production.
2. **Keep the guest's data.** Right after a person signs in with SSO, move their guest account into the real one.
   Keep the session that was active before the SSO sign-in, then:

   ```ts
   import { adoptGuest, loadSession } from "@/lib/auth"

   const before = loadSession()            // read this BEFORE the SSO session replaces it
   // ... SSO sign-in completes, giving `real` (a Session) ...
   await adoptGuest(before, real)          // does nothing unless `before` was a guest
   data.setSession(real)
   ```

   `adoptGuest` calls the `phone-link` function (`action: "adopt"`), which checks both sign-ins and moves, in one
   database transaction (`public.adopt_guest`), the profile (unless the real account already has one), the phones
   that get the morning message, applications, and cached readings. It is tested and refuses a missing or wrong
   sign-in and a second attempt.
3. The account menu hides guest addresses already (`isGuestEmail`). Once SSO exists, "Sign in to keep it" there can
   point to it.
4. Guest accounts are capped at 20 per connection per day (`guest_accounts` table).

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
