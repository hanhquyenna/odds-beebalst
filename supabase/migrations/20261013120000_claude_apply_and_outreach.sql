-- Claude applying and reaching out for the person (the odds connector, supabase/functions/mcp).
--
-- application_answers: the answers every application form asks again (phone, pay wanted, start date, right to work...), kept once so
-- Claude fills them in the same way each time and never invents one. Its own table, not part of the profile: the app saves the whole
-- profile when anything in it changes, which would wipe what Claude wrote in between.
--
-- outreach_drafts: the messages Claude wrote to people at the employer (a LinkedIn note, a message, an email). Claude only drafts;
-- the person sends, then says so ("sent"), and the app moves that person on to "Contacted".

create table if not exists public.application_answers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 20000),
  updated_at timestamptz not null default now()
);

alter table public.application_answers enable row level security;
drop policy if exists application_answers_owner on public.application_answers;
create policy application_answers_owner on public.application_answers for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.application_answers from anon;

create table if not exists public.outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The person in the app's People list, when the message is for one of them; otherwise to_name and to_url say who it is for.
  person_id text,
  posting_id text,
  to_name text not null check (char_length(to_name) between 1 and 200),
  to_url text check (to_url is null or char_length(to_url) <= 500),
  channel text not null check (channel in ('linkedin_note', 'linkedin_message', 'email')),
  subject text check (subject is null or char_length(subject) <= 200),
  body text not null check (char_length(body) between 1 and 3000),
  status text not null default 'draft' check (status in ('draft', 'sent')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  -- Set by the app once the person's status and messages have been brought up to date with this draft being sent.
  applied_at timestamptz
);

create index if not exists outreach_drafts_user on public.outreach_drafts (user_id, created_at desc);

create or replace function public.outreach_drafts_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.outreach_drafts where user_id = new.user_id) >= 300 then
    raise exception 'outreach limit' using errcode = 'P0001', hint = 'Three hundred drafts are kept. Delete some in odds first.';
  end if;
  return new;
end;
$$;

drop trigger if exists outreach_drafts_limit on public.outreach_drafts;
create trigger outreach_drafts_limit before insert on public.outreach_drafts for each row execute function public.outreach_drafts_limit();

alter table public.outreach_drafts enable row level security;
drop policy if exists outreach_drafts_owner on public.outreach_drafts;
create policy outreach_drafts_owner on public.outreach_drafts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.outreach_drafts from anon;
