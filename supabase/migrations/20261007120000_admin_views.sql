-- Views for the people who run odds: who uses it, who connected LinkedIn, and the numbers that matter.
-- They live in their own schema, admin, which the API does not serve: the anon key and signed-in users cannot read
-- them, only the dashboard (Table Editor, schema "admin") and the service role. Personal data: for running odds only.
-- Safe to run more than once.

create schema if not exists admin;
revoke all on schema admin from public, anon, authenticated;

-- One row per account: who they are, what they connected, how far they got.
create or replace view admin.users as
select
  u.id,
  u.email,
  u.email like '%@guest.odds.invalid' as guest,
  p.data->>'name' as name,
  p.data->>'headline' as headline,
  nullif(p.data->>'linkedin', '') as linkedin,
  coalesce((p.data->>'onboarded')::boolean, false) as onboarded,
  u.created_at as joined,
  u.last_sign_in_at as last_seen,
  p.updated_at as profile_updated,
  exists (select 1 from public.push_subscriptions s where s.user_id = u.id) as notifications_on,
  (select count(*) from public.applications a where a.user_id = u.id) as applications,
  (select count(*) from public.linkedin_imports i where i.user_id = u.id and i.kind = 'profile') as linkedin_imports
from auth.users u
left join public.profiles p on p.user_id = u.id;

-- Only the accounts that connected a LinkedIn profile, newest first.
create or replace view admin.linkedin_users as
select email, guest, name, headline, linkedin, joined, last_seen, onboarded, notifications_on, applications
from admin.users
where linkedin is not null
order by joined desc;

-- Every LinkedIn profile import, including people who never made an account.
create or replace view admin.linkedin_imports as
select i.created_at, i.url, u.email, i.user_id is null as no_account
from public.linkedin_imports i
left join auth.users u on u.id = i.user_id
where i.kind = 'profile'
order by i.created_at desc;

-- The headline numbers in one row.
create or replace view admin.stats as
select
  count(*) filter (where not guest) as google_accounts,
  count(*) filter (where guest) as guest_accounts,
  count(*) filter (where not guest and joined > now() - interval '7 days') as new_google_last_7_days,
  count(*) filter (where last_seen > now() - interval '7 days') as signed_in_last_7_days,
  count(*) filter (where onboarded) as finished_the_questions,
  count(*) filter (where linkedin is not null) as linkedin_connected,
  count(*) filter (where notifications_on) as notifications_on,
  count(*) filter (where applications > 0) as logged_an_application,
  coalesce(sum(applications), 0) as applications_logged,
  (select count(*) from public.linkedin_imports where kind = 'profile') as linkedin_imports_total
from admin.users;

-- New accounts per day, Google and guest apart.
create or replace view admin.signups_by_day as
select joined::date as day, count(*) filter (where not guest) as google, count(*) filter (where guest) as guests
from admin.users
group by 1
order by 1 desc;

revoke all on all tables in schema admin from public, anon, authenticated;
