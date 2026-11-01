-- The Tracker filters runs by their owner (user_id = the signed-in person); that column needs the same read grant as the others, or the
-- read is refused. The owner policy still only ever returns the person's own rows.
grant select (user_id, mode) on public.drive_runs to authenticated;
