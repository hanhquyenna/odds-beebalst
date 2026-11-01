-- The person's own application runs and their steps are readable to them again (the policies drive_runs_own and drive_commands_own
-- were kept, but the column grants were lost when the database was rebuilt, so every read answered "permission denied": the Tracker's
-- history, its live chips and the side panel's state all came back empty). Only the columns the app shows, as before.
grant select (id, posting_id, url, status, reason, message, last_note, steps, last_seen_at, person_active_at, created_at, updated_at, tab_id, doc_gen, fill_ended_at, agent_finished_at) on public.drive_runs to authenticated;
grant select (id, run_id, tool, status, note, created_at) on public.drive_commands to authenticated;
