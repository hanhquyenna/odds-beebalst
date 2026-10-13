-- Separate named versions may contain identical bytes. No per-user document count cap.
drop index if exists public.documents_hash_unique;
create unique index if not exists documents_drive_file_unique on public.documents(user_id,drive_file_id);
drop trigger if exists documents_limit on public.documents;
drop function if exists public.documents_limit();
alter table public.documents drop constraint if exists documents_size_bytes_check;
alter table public.documents add constraint documents_size_bytes_check check (size_bytes between 1 and 52428800);
update storage.buckets set file_size_limit = 52428800 where id = 'documents';

-- Save a library entry and its optional job attachment in one transaction, as the authenticated owner.
create or replace function public.save_document(document jsonb, posting text default null)
returns setof public.documents language plpgsql security invoker set search_path = '' as $$
declare saved public.documents;
begin
  if auth.uid() is null then raise exception 'Sign in to keep documents.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  insert into public.documents (id,user_id,kind,name,file_name,mime,size_bytes,content_hash,body,path,is_main)
  values ((document->>'id')::uuid, auth.uid(), document->>'kind', document->>'name', document->>'file_name',
    document->>'mime', (document->>'size_bytes')::integer, document->>'content_hash', document->>'body',
    document->>'path', document->>'kind' = 'cv' and not exists (select 1 from public.documents where user_id=auth.uid() and is_main))
  returning * into saved;
  if saved.path <> auth.uid()::text || '/' || saved.id::text then raise exception 'Invalid document path'; end if;
  if posting is not null then
    insert into public.job_documents (user_id,posting_id,kind,document_id)
    values (auth.uid(),posting,saved.kind,saved.id)
    on conflict (user_id,posting_id,kind) do update set document_id=excluded.document_id, attached_at=now();
  end if;
  return next saved;
end; $$;
revoke all on function public.save_document(jsonb,text) from public, anon;
grant execute on function public.save_document(jsonb,text) to authenticated;
