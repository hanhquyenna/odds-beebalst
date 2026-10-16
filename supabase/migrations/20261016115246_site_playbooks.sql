-- Structure-only shared memory. No applicant values or free-text notes are accepted by the server validator.
create table public.site_playbooks (
  scope text not null check (scope in ('host','ats')),
  key text not null,
  lessons jsonb not null default '{}'::jsonb check (jsonb_typeof(lessons) = 'object'),
  recipes jsonb not null default '[]'::jsonb check (jsonb_typeof(recipes) = 'array'),
  updated_at timestamptz not null default now(),
  primary key (scope,key)
);
create table public.site_lessons (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.drive_runs(id) on delete cascade,
  host text not null,
  ats text,
  kind text not null check (kind in ('opener','skip_dialog','widget','mapping')),
  lesson jsonb not null check (jsonb_typeof(lesson) = 'object'),
  fingerprint text not null,
  outcome text not null check (outcome in ('success','failure')),
  created_at timestamptz not null default now(),
  unique(run_id,host,fingerprint)
);
create index site_lessons_host_time on public.site_lessons(host,created_at desc);
alter table public.site_playbooks enable row level security;
alter table public.site_lessons enable row level security;
revoke all on public.site_playbooks,public.site_lessons from public,anon,authenticated;
grant all on public.site_playbooks,public.site_lessons to service_role;
grant usage,select on sequence public.site_lessons_id_seq to service_role;
-- One transaction and a row lock per scope prevent lost evidence from simultaneous runs.
create function public.record_site_lesson(p_run uuid,p_host text,p_ats text,p_lesson jsonb,p_outcome text)
returns void language plpgsql security invoker set search_path=public as $$
declare
  fp text := md5(p_lesson::text);
  inserted_id bigint;
  target record;
  book jsonb;
  item jsonb;
  ids jsonb;
  n integer;
begin
  insert into site_lessons(run_id,host,ats,kind,lesson,fingerprint,outcome)
  values(p_run,p_host,p_ats,p_lesson->>'kind',p_lesson,fp,p_outcome)
  on conflict(run_id,host,fingerprint) do nothing returning id into inserted_id;
  if inserted_id is null then return; end if;
  for target in select 'host'::text as scope,p_host as key union all select 'ats',p_ats where p_ats is not null loop
    insert into site_playbooks(scope,key) values(target.scope,target.key) on conflict do nothing;
    select lessons into book from site_playbooks where scope=target.scope and key=target.key for update;
    item := coalesce(book->fp,jsonb_build_object('lesson',p_lesson,'successes',0,'failures',0,'source_runs','[]'::jsonb));
    ids := coalesce(item->'source_runs','[]'::jsonb);
    if not ids @> to_jsonb(array[p_run::text]) then ids := ids || to_jsonb(p_run::text); end if;
    item := jsonb_set(item,'{source_runs}',ids);
    if p_outcome='success' then
      n := coalesce((item->>'successes')::integer,0)+1;
      item := item || jsonb_build_object('successes',n,'last_success',now());
    else
      item := item || jsonb_build_object('failures',coalesce((item->>'failures')::integer,0)+1,'last_failure',now());
    end if;
    book := jsonb_set(book,array[fp],item);
    update site_playbooks set lessons=book, recipes=(select coalesce(jsonb_agg(value),'[]') from jsonb_each(book) where (value->>'successes')::int>=5 and (value->>'failures')::int<3 and (value->'lesson'->>'kind') in ('opener','skip_dialog') and (not value ? 'last_failure' or (value->>'last_failure')::timestamptz < now()-interval '14 days')),updated_at=now() where scope=target.scope and key=target.key;
  end loop;
end $$;
revoke all on function public.record_site_lesson(uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_site_lesson(uuid,text,text,jsonb,text) to service_role;
