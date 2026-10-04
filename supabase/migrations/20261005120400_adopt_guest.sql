-- When a guest (made after a LinkedIn import, or by the Home Screen app) signs in for real, their guest data moves to the
-- real account in one step: profile (unless the real account already has one), phones for the morning message,
-- applications, LinkedIn import log, and cached readings. Nothing is deleted; the guest is marked as merged.
-- Called only by the phone-link edge function (service role), after it has checked both sign-ins.
alter table public.guest_accounts add column if not exists merged_into uuid references auth.users (id) on delete set null;
alter table public.guest_accounts add column if not exists merged_at timestamptz;

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
  update strength_cache s set user_id = owner where s.user_id = guest
    and not exists (select 1 from strength_cache o where o.user_id = owner and o.cv_hash = s.cv_hash and o.posting_id = s.posting_id);

  update guest_accounts set merged_into = owner, merged_at = now() where user_id = guest;

  return moved;
end;
$$;

revoke all on function public.adopt_guest(uuid, uuid) from public, anon, authenticated;
grant execute on function public.adopt_guest(uuid, uuid) to service_role;
