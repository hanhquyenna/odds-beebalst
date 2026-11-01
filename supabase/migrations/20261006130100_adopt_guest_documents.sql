-- A guest who signs in for real keeps their documents too. The files stay where they are (documents.path points at them, and
-- the read policy follows the row), so only the rows move. The real account's limit of five still holds: the oldest of the
-- guest's documents fill the free places, a file the real account already has is not moved twice, and a name already taken
-- is not moved over. What is not moved stays with the guest account, which is only marked as merged.
create or replace function public.adopt_guest_documents(guest uuid, owner uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  room int;
  n int := 0;
begin
  select greatest(0, 5 - count(*)) into room from documents where user_id = owner;

  with picked as (
    select g.id
    from documents g
    where g.user_id = guest
      and not exists (select 1 from documents o where o.user_id = owner and o.content_hash = g.content_hash)
      and not exists (select 1 from documents o where o.user_id = owner and o.kind = g.kind and lower(btrim(o.name)) = lower(btrim(g.name)))
    order by g.created_at
    limit room
  ), moved as (
    update documents d set user_id = owner, is_main = (d.is_main and not exists (select 1 from documents m where m.user_id = owner and m.is_main))
    from picked p where d.id = p.id
    returning d.id
  )
  select count(*) into n from moved;

  update job_documents j set user_id = owner
  where j.user_id = guest
    and exists (select 1 from documents d where d.id = j.document_id and d.user_id = owner)
    and not exists (select 1 from job_documents o where o.user_id = owner and o.posting_id = j.posting_id and o.kind = j.kind);

  return n;
end;
$$;

revoke all on function public.adopt_guest_documents(uuid, uuid) from public, anon, authenticated;
grant execute on function public.adopt_guest_documents(uuid, uuid) to service_role;
