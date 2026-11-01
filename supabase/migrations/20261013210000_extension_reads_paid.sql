-- Whether odds paid to read the job (a LinkedIn job read by Apify) or the person's browser read it from the job's own page (free). The paid ones
-- have the small daily allowance (30), the free ones a larger one (300). Rows from before count as paid.
alter table public.extension_reads add column if not exists paid boolean not null default true;
