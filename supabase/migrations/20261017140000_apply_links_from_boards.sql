-- Apply links read from a job board's own hand-off page (Magnet.me's applyExternally names the employer's page): source 'board'.
alter table public.posting_apply_links drop constraint if exists posting_apply_links_source_check;
alter table public.posting_apply_links add constraint posting_apply_links_source_check check (source in ('run', 'apify', 'match', 'board'));
