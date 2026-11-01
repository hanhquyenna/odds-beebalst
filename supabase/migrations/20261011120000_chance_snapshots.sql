-- The outcome loop (docs/ENGINE_DATA_PLAN.md, step E). When someone marks a job applied, the chance odds showed and what it was
-- worked out from are kept (chance_snapshots). When the stage of that application later becomes interview, rejected or no reply,
-- a trigger records what happened. Predicted against actual, by bucket, is the view chance_calibration; it is what the model gets
-- checked against once people use it. No CV text is kept: only the parts the engine added up (a number per factor) and a few facts
-- about the posting. Deleting the application, or the account, deletes the snapshot.

create table if not exists public.chance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  posting_id text not null check (char_length(posting_id) between 1 and 64),
  applied_on date not null default current_date,
  model text not null check (char_length(model) <= 40),
  -- What was shown, 0 to 1, with the range.
  chance real not null check (chance between 0 and 1),
  low real check (low between 0 and 1),
  high real check (high between 0 and 1),
  -- parts: { factor key: its z-score } as in research-data/backtest/parts.jsonl; posting: family, level, days_open, applicants, ...
  snapshot jsonb not null default '{}'::jsonb check (pg_column_size(snapshot) <= 8000),
  -- interview: heard back with an interview (also offer, hired); rejected; no_reply. Null until it is known. Set by the trigger below.
  outcome text check (outcome in ('interview', 'rejected', 'no_reply')),
  outcome_on date,
  -- When the app last asked "did you hear back?", so it does not ask every visit.
  asked_on date,
  created_at timestamptz not null default now(),
  unique (user_id, posting_id)
);

alter table public.chance_snapshots enable row level security;
drop policy if exists chance_snapshots_owner_read on public.chance_snapshots;
create policy chance_snapshots_owner_read on public.chance_snapshots for select to authenticated using (user_id = auth.uid());
drop policy if exists chance_snapshots_owner_insert on public.chance_snapshots;
create policy chance_snapshots_owner_insert on public.chance_snapshots for insert to authenticated with check (user_id = auth.uid() and outcome is null);
revoke all on public.chance_snapshots from anon;
revoke update, delete on public.chance_snapshots from authenticated;
-- The only thing a person may change themselves is when the question was last asked.
grant update (asked_on) on public.chance_snapshots to authenticated;
drop policy if exists chance_snapshots_owner_ask on public.chance_snapshots;
create policy chance_snapshots_owner_ask on public.chance_snapshots for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- stage of an application -> what we know about the interview
create or replace function public.stage_outcome(stage text)
returns text
language sql
immutable
as $$
  select case stage
    when 'interview' then 'interview'
    when 'offer' then 'interview'
    when 'hired' then 'interview'
    when 'rejected' then 'rejected'
    when 'no_reply' then 'no_reply'
    else null  -- applied, withdrawn: not an answer
  end;
$$;

create or replace function public.applications_outcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.chance_snapshots where user_id = old.user_id and posting_id = old.posting_id;

    return old;
  end if;
  -- An interview stays an interview when it moves on to an offer; a later "rejected" after an interview does not erase it.
  update public.chance_snapshots s
     set outcome = coalesce(public.stage_outcome(new.stage), case when new.stage = 'applied' then null else s.outcome end),
         outcome_on = case when new.stage = 'applied' then null when public.stage_outcome(new.stage) is null then s.outcome_on else coalesce(s.outcome_on, current_date) end
   where s.user_id = new.user_id and s.posting_id = new.posting_id
     and (s.outcome is distinct from 'interview' or new.stage not in ('rejected', 'no_reply'));

  return new;
end;
$$;

drop trigger if exists applications_outcome_update on public.applications;
create trigger applications_outcome_update after update of stage on public.applications for each row execute function public.applications_outcome();
drop trigger if exists applications_outcome_delete on public.applications;
create trigger applications_outcome_delete after delete on public.applications for each row execute function public.applications_outcome();

-- Predicted against actual, by predicted chance. For the people who run the model, not for the app: no grant to anon or authenticated.
create or replace view public.chance_calibration with (security_invoker = true) as
select
  case when chance < 0.01 then '0-1%' when chance < 0.02 then '1-2%' when chance < 0.05 then '2-5%' when chance < 0.10 then '5-10%'
       when chance < 0.20 then '10-20%' when chance < 0.40 then '20-40%' else '40%+' end as bucket,
  count(*) as applications,
  count(*) filter (where outcome is not null) as answered,
  round(avg(chance)::numeric, 4) as mean_predicted,
  round((count(*) filter (where outcome = 'interview'))::numeric / nullif(count(*) filter (where outcome is not null), 0), 4) as interview_rate,
  model
from public.chance_snapshots
group by 1, model;
revoke all on public.chance_calibration from anon, authenticated;

notify pgrst, 'reload schema';
