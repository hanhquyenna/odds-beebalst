-- Views nothing reads (the app reads app_jobs; these were counting and research views), the two RPCs
-- nothing calls, and fit_ratings, empty and read only by data_requirements_status. All hold no data.
begin;

do $$
begin
  if (select count(*) from public.fit_ratings) > 0 then
    raise exception 'public.fit_ratings has rows, not dropping anything';
  end if;
end $$;

drop view if exists public.active_internship_entry_english_outreach;
drop view if exists public.active_internship_entry_english_people_coverage;
drop view if exists public.active_internship_entry_english;
drop view if exists public.active_internship_entry_candidates;
drop view if exists public.active_internship_entry;
drop view if exists public.employer_hiring;
drop view if exists public.active_jobs;
drop view if exists public.data_requirements_status;
drop view if exists public.employer_data_status;
drop table if exists public.fit_ratings;

drop function if exists public.create_mcp_key();
drop function if exists public.revoke_extension_key();

commit;
