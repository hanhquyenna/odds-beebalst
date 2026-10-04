-- The employer's own posting date as a real date. posted_at stays as it was read (text, many shapes);
-- days_open is a snapshot from the day of the crawl, so the app works the age out from posted_on instead.
alter table public.postings add column if not exists posted_on date;
comment on column public.postings.posted_on is 'Posting date from the employer board or the job page. Null when the source gives none (SuccessFactors, Workday "30+ days").';
