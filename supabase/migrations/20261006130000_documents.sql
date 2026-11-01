-- Documents: the CVs and cover letters a person keeps, named so a version can be reused on any job. The original file is
-- kept in the private storage bucket "documents" and its text here, because the chance is worked out from the text and
-- "download my CV" must give back exactly the file that was uploaded. At most five per person. One CV can be the main one:
-- its text is what the chance on every job is worked out from. A job points at a document (job_documents) and never
-- copies it, so reusing a version costs one small row.
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('cv', 'cover_letter')),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime text not null check (char_length(mime) <= 120),
  size_bytes integer not null check (size_bytes between 1 and 8388608),
  content_hash text not null check (char_length(content_hash) = 64),
  body text not null default '' check (char_length(body) <= 20000),
  path text not null,
  is_main boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A name is one version: the same name twice would make "reuse by name" ambiguous. The same file twice is stored once.
create unique index if not exists documents_name_unique on public.documents (user_id, kind, lower(btrim(name)));
create unique index if not exists documents_hash_unique on public.documents (user_id, content_hash);
-- At most one main document, and only a CV can be it.
create unique index if not exists documents_one_main on public.documents (user_id) where is_main;
alter table public.documents drop constraint if exists documents_main_is_cv;
alter table public.documents add constraint documents_main_is_cv check (not is_main or kind = 'cv');

create or replace function public.documents_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.documents where user_id = new.user_id) >= 5 then
    raise exception 'document limit' using errcode = 'P0001', hint = 'You can keep five documents. Delete one to add another.';
  end if;
  return new;
end;
$$;

drop trigger if exists documents_limit on public.documents;
create trigger documents_limit before insert on public.documents for each row execute function public.documents_limit();

create or replace function public.documents_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists documents_touch on public.documents;
create trigger documents_touch before update on public.documents for each row execute function public.documents_touch();

alter table public.documents enable row level security;
drop policy if exists documents_owner on public.documents;
create policy documents_owner on public.documents for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.documents from anon;

-- Which CV and which cover letter go with which job: one of each at most.
create table if not exists public.job_documents (
  user_id uuid not null references auth.users (id) on delete cascade,
  posting_id text not null,
  kind text not null check (kind in ('cv', 'cover_letter')),
  document_id uuid not null references public.documents (id) on delete cascade,
  attached_at timestamptz not null default now(),
  primary key (user_id, posting_id, kind)
);

create index if not exists job_documents_document on public.job_documents (document_id);

-- The document must be the caller's own and of the same kind.
create or replace function public.job_documents_check()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from public.documents d where d.id = new.document_id and d.user_id = new.user_id and d.kind = new.kind) then
    raise exception 'that document is not yours or is the wrong kind';
  end if;
  return new;
end;
$$;

drop trigger if exists job_documents_check on public.job_documents;
create trigger job_documents_check before insert or update on public.job_documents for each row execute function public.job_documents_check();

alter table public.job_documents enable row level security;
drop policy if exists job_documents_owner on public.job_documents;
create policy job_documents_owner on public.job_documents for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.job_documents from anon;

-- Makes one CV the main one in a single step (the unique index allows only one).
create or replace function public.set_main_document(doc uuid)
returns void
language plpgsql
security invoker
as $$
begin
  if not exists (select 1 from public.documents where id = doc and user_id = auth.uid() and kind = 'cv') then
    raise exception 'not one of your CVs';
  end if;
  update public.documents set is_main = false where user_id = auth.uid() and is_main and id <> doc;
  update public.documents set is_main = true where id = doc and user_id = auth.uid();
end;
$$;

revoke all on function public.set_main_document(uuid) from public, anon;
grant execute on function public.set_main_document(uuid) to authenticated;

-- The files: private, 8 MB each, only the kinds the app reads. A person may add files under their own folder, and read or
-- delete the files their documents point at (so documents moved over from a guest account stay reachable).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  8388608,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ]
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists documents_files_insert on storage.objects;
create policy documents_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists documents_files_read on storage.objects;
create policy documents_files_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and exists (select 1 from public.documents d where d.path = name and d.user_id = auth.uid()));

drop policy if exists documents_files_delete on storage.objects;
create policy documents_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or exists (select 1 from public.documents d where d.path = name and d.user_id = auth.uid()))
  );
