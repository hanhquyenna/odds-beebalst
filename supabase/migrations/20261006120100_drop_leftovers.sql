-- Drops only what holds no data: five tables that were never filled and one unused view. Every table with rows stays,
-- including the reference datasets and the ones an outside worker fills. Stops and drops nothing if a table has rows.
begin;

do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['market_tightness', 'requirement_labels', 'study_effects', 'people_cache', 'strength_cache'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then
        raise exception 'public.% has % rows, not dropping anything', t, n;
      end if;
    end if;
  end loop;
end $$;

-- Added in 20261003120000 for counting; the app filters active_internship_entry itself and nothing reads this view.
drop view if exists public.active_internship_entry_english;

-- adopt_guest without strength_cache (dropped below); otherwise the same as 20261005120400_adopt_guest.sql.
create or replace function public.adopt_guest(guest uuid, owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  moved jsonb := '{}'::jsonb;
  n int;
begin
  if guest = owner then
    raise exception 'same account';
  end if;
  if not exists (select 1 from guest_accounts where user_id = guest and merged_into is null) then
    raise exception 'not an unmerged guest account';
  end if;

  if not exists (select 1 from profiles where user_id = owner) then
    update profiles set user_id = owner where user_id = guest;
    get diagnostics n = row_count;
    moved := moved || jsonb_build_object('profile', n);
  else
    moved := moved || jsonb_build_object('profile', 0, 'kept_existing_profile', true);
  end if;

  update push_subscriptions set user_id = owner where user_id = guest;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('phones', n);

  update applications set user_id = owner where user_id = guest;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('applications', n);

  update linkedin_imports set user_id = owner where user_id = guest;

  update profile_facts f set user_id = owner where f.user_id = guest
    and not exists (select 1 from profile_facts o where o.user_id = owner and o.item_hash = f.item_hash);

  update guest_accounts set merged_into = owner, merged_at = now() where user_id = guest;

  return moved;
end;
$$;

-- Work-queue result tables that were never filled. fit_ratings stays: data_requirements_status reads it.
drop table if exists public.market_tightness;
drop table if exists public.requirement_labels;
drop table if exists public.study_effects;

-- Replaced by job_people (people_cache) and profile_facts (strength_cache); both empty.
drop table if exists public.people_cache;
drop table if exists public.strength_cache;

commit;
