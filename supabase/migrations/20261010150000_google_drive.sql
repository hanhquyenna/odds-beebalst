-- Google Drive for documents. A person can connect their own Drive once: the app makes a folder "odds" with "CVs" and
-- "Cover letters" in it, and from then on every document's file lives there, in their Drive, instead of in the bucket
-- "documents". The text read from the file stays here (documents.body): the chance and Claude work from it, and they must
-- keep working when Drive is slow, disconnected or the file was moved. The edge function `drive` does every Drive call.
--
-- The permission asked is drive.file: the app sees only the files it made itself, never the rest of the person's Drive.

-- One row per connected person. The refresh token is a secret: only the server (service role) may read it. The browser may
-- read whether it is connected, to which Google account, and where the folder is.
create table if not exists public.drive_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  refresh_token text not null,
  root_id text not null,
  cv_folder_id text not null,
  letter_folder_id text not null,
  connected_at timestamptz not null default now()
);

alter table public.drive_links enable row level security;
drop policy if exists drive_links_owner_read on public.drive_links;
create policy drive_links_owner_read on public.drive_links for select to authenticated using (user_id = auth.uid());
revoke all on public.drive_links from anon, authenticated;
grant select (user_id, email, root_id, connected_at) on public.drive_links to authenticated;

-- Where a document's file is: in the bucket (drive_file_id null) or in the person's Drive. drive_md5 is Drive's checksum of
-- the file as the app last read it, so a change made in Drive (an edited CV) is noticed and its text read again.
alter table public.documents add column if not exists drive_file_id text;
alter table public.documents add column if not exists drive_md5 text;
