-- Who an Autofill answer came from: 'person' (they typed it, answered it from their phone, confirmed it in "Save to Autofill?" or
-- edited it in Odds) or 'odds' (Broods or the rules wrote it while filling). Only the person's own answers go back into forms word for
-- word and are locked there; Odds' answers show in Autofill as "Written by Odds" until the person confirms or edits them.
-- Rows from before this column stay null (unknown: Odds wrote many of them silently), so they are reused as hints but never locked.
alter table public.application_questions add column if not exists source text check (source in ('person', 'odds'));
alter table public.application_questions alter column source set default 'person';
