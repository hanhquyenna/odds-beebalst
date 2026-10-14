// The entry the extension's copy of the shared rules is built from (scripts/build-extension.sh): the same files the server uses, on
// globalThis.oddsSites (which addresses are jobs, reading a job page) and globalThis.oddsApply (filling in an application form).
import * as apply from "../supabase/functions/_shared/apply-form"
import * as sites from "../supabase/functions/_shared/job-sites"

;(globalThis as unknown as { oddsSites: typeof sites; oddsApply: typeof apply }).oddsSites = sites
;(globalThis as unknown as { oddsApply: typeof apply }).oddsApply = apply
