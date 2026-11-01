-- Jobs close themselves when their own deadline passes. Free, certain, runs every hour in the database.
-- A posting with a valid_through date (Magnet.me and LinkedIn pages state one) is closed the day after it, and the reason is written to postings_audit_log.
create or replace function public.close_expired_postings() returns integer
language plpgsql as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id, left(valid_through, 10) as d from public.postings
    where closed_at is null and valid_through ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])'
  loop
    begin
      if r.d::date < current_date then
        update public.postings set closed_at = now(), last_checked = now() where id = r.id and closed_at is null;
        insert into public.postings_audit_log (id, col, old_value, new_value, reason, at)
        values (r.id, 'closed_at', null, 'closed', 'The posting''s own deadline (' || r.d || ') has passed. Closed automatically by close_expired_postings(), hourly.', now());
        n := n + 1;
      end if;
    exception when others then
      continue; -- an impossible date such as 30 February: leave the posting alone
    end;
  end loop;
  return n;
end $$;

select cron.unschedule('close-expired-postings') where exists (select 1 from cron.job where jobname = 'close-expired-postings');
select cron.schedule('close-expired-postings', '20 * * * *', $$select public.close_expired_postings()$$);
