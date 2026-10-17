-- Field-mapping recipes: a mapping that names where its field sits (normalized label + nth, structure only) is promoted after three
-- verified runs, mirroring playbookFor in supabase/functions/_shared/site-playbook.ts (which the server reads; this column is a summary).
create or replace function public.record_site_lesson(p_run uuid,p_host text,p_ats text,p_lesson jsonb,p_outcome text)
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
    update site_playbooks set lessons=book, recipes=(select coalesce(jsonb_agg(value),'[]') from jsonb_each(book) where (value->>'failures')::int<3 and (not value ? 'last_failure' or (value->>'last_failure')::timestamptz < now()-interval '14 days') and (((value->>'successes')::int>=5 and (value->'lesson'->>'kind') in ('opener','skip_dialog')) or ((value->>'successes')::int>=3 and (value->'lesson'->>'kind')='mapping' and value->'lesson' ? 'label'))),updated_at=now() where scope=target.scope and key=target.key;
  end loop;
end $$;
