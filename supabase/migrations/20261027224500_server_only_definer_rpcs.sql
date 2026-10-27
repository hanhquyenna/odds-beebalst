-- These SECURITY DEFINER functions trust their user/owner argument, so only the edge functions
-- (service role) may call them; the browser's publishable key could otherwise act for anyone.
revoke execute on function public.adopt_guest(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.adopt_guest_documents(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.answer_application_questions_for(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.continue_application_for(uuid, text) from public, anon, authenticated;
revoke execute on function public.request_application_for(uuid, text) from public, anon, authenticated;
revoke execute on function public.poll_application(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.poll_applications(uuid, uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.report_application(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.drive_cancel_open_commands(uuid) from public, anon, authenticated;
revoke execute on function public.record_site_tactic(text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.job_successful_candidates_inner(text) from public, anon, authenticated;
revoke execute on function public.applications_outcome() from public, anon, authenticated;
grant execute on function public.adopt_guest(uuid, uuid), public.adopt_guest_documents(uuid, uuid),
  public.answer_application_questions_for(uuid, text, jsonb), public.continue_application_for(uuid, text),
  public.request_application_for(uuid, text), public.poll_application(uuid, uuid),
  public.poll_applications(uuid, uuid, uuid[]), public.report_application(uuid, uuid, uuid, text, text),
  public.drive_cancel_open_commands(uuid), public.record_site_tactic(text, text, text, boolean),
  public.job_successful_candidates_inner(text), public.applications_outcome() to service_role;

-- Pin search_path on the functions the linter flags.
alter function public.stage_outcome set search_path = public, pg_temp;
alter function public.documents_touch set search_path = public, pg_temp;
alter function public.outreach_drafts_limit set search_path = public, pg_temp;
alter function public.job_documents_check set search_path = public, pg_temp;
alter function public.set_main_document set search_path = public, pg_temp;
alter function public.close_expired_postings set search_path = public, pg_temp;
