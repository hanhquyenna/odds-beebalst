// The entry the extension's copy of the shared rules is built from (scripts/build-extension.sh): the same files the server uses, on
// globalThis.oddsSites (which addresses are jobs, reading a job page) and globalThis.oddsApply (filling in an application form, and
// where a screenshot's pixels are on the page).
import * as apply from "../supabase/functions/_shared/apply-form"
import * as censor from "../supabase/functions/_shared/apply-censor"
import * as screen from "../supabase/functions/_shared/drive-screen"
import * as sites from "../supabase/functions/_shared/job-sites"

;(globalThis as unknown as { oddsSites: typeof sites }).oddsSites = sites
;(globalThis as unknown as { oddsApply: typeof apply & typeof censor & typeof screen }).oddsApply = { ...apply, ...censor, ...screen }
