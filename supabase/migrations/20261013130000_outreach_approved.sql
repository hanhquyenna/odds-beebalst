-- A draft can be approved for Claude to send: the person says so in odds (a button) or in the chat with Claude. Claude only sends approved ones.
alter table public.outreach_drafts drop constraint if exists outreach_drafts_status_check;
alter table public.outreach_drafts add constraint outreach_drafts_status_check check (status in ('draft', 'approved', 'sent'));
alter table public.outreach_drafts add column if not exists approved_at timestamptz;
