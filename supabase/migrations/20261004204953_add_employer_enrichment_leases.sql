-- Applied directly to the database by another agent; pulled from the migration history so the repo matches it.
alter table public.employer_enrichment_queue
  add column if not exists lease_id text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_successful_at timestamptz;

create index if not exists employer_enrichment_queue_lease_idx
  on public.employer_enrichment_queue (status, lease_expires_at);
