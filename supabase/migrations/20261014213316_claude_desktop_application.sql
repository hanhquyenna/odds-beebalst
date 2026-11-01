-- The MCP backend supplies the identity from its verified connector key. Never grant this helper to clients.
create or replace function public.request_application_for(p_user uuid,p_posting_id text) returns public.application_runs
language plpgsql security definer set search_path='' as $$
declare job_url text; result public.application_runs;
begin
  if p_user is null then raise exception 'Sign in first.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  update public.application_runs set status='failed',message='Preparation expired. Your open application remains on your desktop.',updated_at=now() where user_id=p_user and status in ('queued','filling','needs_input','ready') and expires_at<now();
  select * into result from public.application_runs where user_id=p_user and posting_id=p_posting_id and status in ('queued','filling','needs_input','ready') limit 1;
  if found then return result; end if;
  select url into job_url from public.postings where id=p_posting_id and closed_at is null;
  if job_url is null or job_url not like 'https://%' then raise exception 'This job has no available application page.'; end if;
  insert into public.application_runs(user_id,posting_id,url) values(p_user,p_posting_id,job_url) returning * into result;
  return result;
end $$;

revoke all on function public.request_application_for(uuid,text) from public,anon,authenticated;
grant execute on function public.request_application_for(uuid,text) to service_role;
create or replace function public.request_application(p_posting_id text) returns public.application_runs
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 return public.request_application_for(auth.uid(),p_posting_id);
end $$;
revoke all on function public.request_application(text) from public,anon;
grant execute on function public.request_application(text) to authenticated;
