-- The answers a person gave to the questions application forms ask beyond the standard ones (application_answers): "How many years of
-- experience do you have with SQL?", "Do you need visa sponsorship?". Kept by the odds extension when the person answers one in a form, so the
-- next form that asks it again is filled in the same way. One row per person and question (question_key: the question in lower case, without
-- punctuation, as extension and server both make it).
create table if not exists public.application_questions (
  user_id uuid not null references auth.users (id) on delete cascade,
  question_key text not null check (char_length(question_key) between 2 and 300),
  question text not null check (char_length(question) between 2 and 500),
  answer text not null check (char_length(answer) between 1 and 1000),
  updated_at timestamptz not null default now(),
  primary key (user_id, question_key)
);
alter table public.application_questions enable row level security;
drop policy if exists application_questions_owner on public.application_questions;
create policy application_questions_owner on public.application_questions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.application_questions from anon;
