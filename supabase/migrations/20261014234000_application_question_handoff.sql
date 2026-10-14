-- Live questions are private to the applicant; saved answers reuse the existing question library.
create table public.application_prompts (
 user_id uuid not null references auth.users(id) on delete cascade,
 posting_id text not null references public.postings(id),
 questions jsonb not null default '[]'::jsonb check(jsonb_typeof(questions)='array' and jsonb_array_length(questions)<=30),
 updated_at timestamptz not null default now(),
 primary key(user_id,posting_id)
);
alter table public.application_prompts enable row level security;
create policy application_prompts_owner on public.application_prompts for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.application_prompts from anon,authenticated;
grant select on public.application_prompts to authenticated;
create function public.answer_application_questions_for(p_user uuid,p_posting_id text,p_answers jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare prompt public.application_prompts; q jsonb; value text; item record;
begin
 if p_user is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 if p_answers is null or jsonb_typeof(p_answers)<>'object' or p_answers='{}'::jsonb then raise exception 'Send answers by question.'; end if;
 select * into prompt from public.application_prompts where user_id=p_user and posting_id=p_posting_id and updated_at>now()-interval '30 minutes' for update;
 if not found then raise exception 'These questions are no longer current. Wait for the desktop to refresh.'; end if;
 for item in select * from jsonb_each_text(p_answers) loop
  select x into q from jsonb_array_elements(prompt.questions) x where x->>'key'=item.key;
  if q is null then raise exception 'The form changed. Refresh the questions first.'; end if;
  value:=btrim(item.value);
  if value is null or length(value)<1 or length(value)>1000 then raise exception 'Enter an answer between 1 and 1000 characters.'; end if;
  if q->>'kind'='number' and value !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$' then raise exception 'Enter a number.'; end if;
  if q->>'kind' in ('radio','select') and not ((q->'options') ? value) then raise exception 'Choose an option shown by the form.'; end if;
  insert into public.application_questions(user_id,question_key,question,answer) values(p_user,q->>'key',q->>'label',value)
  on conflict(user_id,question_key) do update set answer=excluded.answer,question=excluded.question,updated_at=now();
 end loop;
end $$;
revoke all on function public.answer_application_questions_for(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.answer_application_questions_for(uuid,text,jsonb) to service_role;
create function public.answer_application_questions(p_posting_id text,p_answers jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 perform public.answer_application_questions_for(auth.uid(),p_posting_id,p_answers);
end $$;
revoke all on function public.answer_application_questions(text,jsonb) from public,anon;
grant execute on function public.answer_application_questions(text,jsonb) to authenticated;
