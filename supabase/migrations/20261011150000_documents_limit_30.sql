-- Documents become a library: a CV or a letter per job is normal now ("CV – Portfolio Strategy Intern"), so five places is too
-- few. Thirty per person; the files are small (8 MB at most) and, with Google Drive connected, kept in the person's own Drive.
create or replace function public.documents_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.documents where user_id = new.user_id) >= 30 then
    raise exception 'document limit' using errcode = 'P0001', hint = 'You can keep thirty documents. Delete one to add another.';
  end if;
  return new;
end;
$$;
