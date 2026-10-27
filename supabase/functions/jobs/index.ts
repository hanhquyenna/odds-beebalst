// Edge Function `jobs`: the shared job list and what hangs off it.
//   POST /jobs/add                  anyone adds one LinkedIn job (add.ts)
//   POST /jobs/check?slice=0&of=4   pg_cron: are employer job-board postings still open? (check.ts, CHECK_SECRET)
//   POST /jobs/check-public         pg_cron: are Magnet.me, AcademicTransfer and EY postings still open? (check-public.ts, PUBLIC_CHECK_SECRET)
//   POST /jobs/morning              pg_cron: the morning message (morning.ts, MORNING_SECRET)
//   POST /jobs/welcome              a signed-in person's first message after turning notifications on (morning.ts)
//   POST /jobs/people               people at a job's employer, for Google accounts only (people.ts)
// Deploy:  scripts/build-morning-jobs.sh && supabase functions deploy jobs --project-ref ukpmpyfcnbhngkgbnkxi --use-api
// (config.toml: verify_jwt = false; each route checks its own secret or sign-in.)
import { serveRoutes } from "../_shared/http.ts"
import { addJob } from "./add.ts"
import { check } from "./check.ts"
import { checkPublic } from "./check-public.ts"
import { morning, welcome } from "./morning.ts"
import { people } from "./people.ts"

serveRoutes({ add: addJob, check: check, "check-public": checkPublic, morning: morning, people: people, welcome: welcome })
