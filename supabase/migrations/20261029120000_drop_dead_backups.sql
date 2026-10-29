-- Tables nothing reads or writes: one-off posting backups from early October, an old debug log of the drive MCP,
-- and two raw people-capture tables a since-removed import wrote. No view, key, trigger, function or cron job
-- uses them. Exported to research-data/backups/2026-10-29-gdavxkaioqlfvfunmtxd before this ran.
-- Stops and drops nothing if any of them gained rows since that export.
begin;

do $$
declare
  t text;
  n bigint;
  expected constant jsonb := '{"postings_body_backup": 1448, "postings_cbsgroup_backup": 2425, "postings_flat_body_backup": 255,
    "postings_gates_backup": 415, "postings_requirements_backup": 2095, "postings_review_backup": 2188, "postings_years_backup": 2095,
    "drive_mcp_debug": 429, "apify_people_captures": 270, "people_source_captures": 61}';
begin
  for t in select jsonb_object_keys(expected) loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > (expected ->> t)::bigint then
        raise exception 'public.% has % rows, more than the % exported; not dropping anything', t, n, expected ->> t;
      end if;
    end if;
  end loop;
end $$;

drop table if exists public.postings_body_backup;
drop table if exists public.postings_cbsgroup_backup;
drop table if exists public.postings_flat_body_backup;
drop table if exists public.postings_gates_backup;
drop table if exists public.postings_requirements_backup;
drop table if exists public.postings_review_backup;
drop table if exists public.postings_years_backup;
drop table if exists public.drive_mcp_debug;
drop table if exists public.apify_people_captures;
drop table if exists public.people_source_captures;

commit;
