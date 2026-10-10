-- The people who held a role before are named people with their LinkedIn history. With execute granted to anon, the public key
-- alone could walk every posting id and copy them all out in seconds (checked: 23 people from 300 ids). Only a signed-in caller
-- (a guest account counts: it is made when someone imports their LinkedIn) can read them now, and the check is inside the
-- function too, so a later grant cannot quietly open it again.
create or replace function public.job_successful_candidates_guarded(p_posting text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return '[]'::jsonb;
  end if;

  return public.job_successful_candidates_inner(p_posting);
end;
$$;

-- The original body stays as the inner function, callable by no one but the owner.
alter function public.job_successful_candidates(text) rename to job_successful_candidates_inner;
revoke all on function public.job_successful_candidates_inner(text) from public, anon, authenticated;

alter function public.job_successful_candidates_guarded(text) rename to job_successful_candidates;
revoke all on function public.job_successful_candidates(text) from public, anon;
grant execute on function public.job_successful_candidates(text) to authenticated;

notify pgrst, 'reload schema';
